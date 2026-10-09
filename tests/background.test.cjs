"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const extension = fs.existsSync(path.join(__dirname, "../extension")) ? path.join(__dirname, "../extension") : path.join(__dirname, "..");
const core = require(path.join(extension, "core.js"));
const clone = value => structuredClone(value);

function event() {
	const listeners = [];
	return {addListener: listener => listeners.push(listener), emit: (...args) => Promise.all(listeners.map(listener => listener(...args)))};
}
function harness({config = {...core.DEFAULTS, sites: ["example.com"]}, sessions = {}, reminderPosition = null, tabs = [], now = 1000000, failAudio = false, uiLanguage = "en"} = {}) {
	let clock = now;
	const data = {config: clone(config), sessions: clone(sessions), reminderPosition: clone(reminderPosition)};
	const tabMap = new Map(tabs.map(tab => [tab.id, clone(tab)]));
	const removed = [];
	const created = [];
	const messages = [];
	const alarms = new Map();
	let sounds = 0;
 const soundKinds = [];
	let getHook = null;
	const api = {
		i18n: {getUILanguage: () => uiLanguage},
		storage: {local: {
			get: async () => clone(data),
			set: async values => Object.assign(data, clone(values))
		}},
		tabs: {
			query: async () => clone([...tabMap.values()]),
			get: async id => {
				if (getHook) getHook(id, tabMap);
				if (!tabMap.has(id)) throw new Error("No tab");
				return clone(tabMap.get(id));
			},
			remove: async id => { removed.push(id); tabMap.delete(id); },
			create: async properties => {
				const id = 1000 + created.length;
				created.push(clone(properties));
				tabMap.set(id, {id, url: "about:newtab", windowId: properties.windowId});
				return {id};
			},
			sendMessage: async (id, message) => { messages.push({id, ...clone(message)}); },
			onRemoved: event(), onUpdated: event()
		},
		alarms: {
			create: async (name, info) => { alarms.set(name, clone(info)); },
			clear: async name => alarms.delete(name),
			clearAll: async () => alarms.clear(),
			onAlarm: event()
		},
		runtime: {
			id: "site-intent@local.extension",
			getURL: suffix => `moz-extension://intent/${suffix}`,
			openOptionsPage: async () => {},
			onMessage: event(), onStartup: event(), onInstalled: event()
		},
		action: {onClicked: event()}
	};
	class Clock extends Date { static now() { return clock; } }
	const IntentSound = {async play(kind) { if (failAudio) throw new Error("Audio blocked"); sounds++; soundKinds.push(kind); }};
	const context = vm.createContext({browser: api, Date: Clock, URL, IntentSound, console});
	for (const file of ["core.js", "background.js"]) vm.runInContext(fs.readFileSync(path.join(extension, file), "utf8"), context, {filename: file});
	const optionsSender = {url: "moz-extension://intent/options.html", tab: {id: 100}};
	const sender = id => ({tab: {id}, frameId: 0, url: tabMap.get(id)?.pendingUrl || tabMap.get(id)?.url});
	const message = async (payload, from = optionsSender) => clone((await api.runtime.onMessage.emit(payload, from))[0]);
	return {
		api, data, tabs: tabMap, removed, created, messages, alarms, message, sender, soundKinds,
		ready: () => message({type: "GET_SETTINGS"}),
		advance: milliseconds => { clock += milliseconds; },
		get sounds() { return sounds; },
		setGetHook: hook => { getHook = hook; }
	};
}

test("manual ending closes only the sender's site and clears its session and alarms", async () => {
	const h = harness({
		config: {...core.DEFAULTS, sites: ["example.com", "other.test"]},
		tabs: [
			{id: 1, url: "https://example.com/a", windowId: 1},
			{id: 2, url: "https://m.example.com/b", windowId: 2, pinned: true},
			{id: 3, url: "https://other.test"},
			{id: 4, url: "https://example.com", pendingUrl: "https://elsewhere.test"}
		]
	});
	await h.message({type: "START_SESSION", task: "A", minutes: 15}, h.sender(1));
	await h.message({type: "START_SESSION", task: "B", minutes: 15}, h.sender(3));
	const result = await h.message({type: "END_SESSION", site: "other.test"}, h.sender(1));
	assert.equal(result.ok, true);
	assert.equal(result.session, null);
	assert.deepEqual(h.removed, [1, 2]);
	assert.equal(h.data.sessions["example.com"], undefined);
	assert.ok(h.data.sessions["other.test"]);
	assert.ok([...h.alarms.keys()].every(name => !name.endsWith(":example.com")));
	assert.deepEqual(h.soundKinds, ["end"]);
	await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
	assert.deepEqual(h.removed, [1, 2]);
});

test("manual ending ignores stale documents, rejects subframes, and leaves idle tabs open", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com"}]});
	await h.message({type: "END_SESSION"}, h.sender(1));
	assert.deepEqual(h.removed, []);
	await h.message({type: "START_SESSION", task: "A", minutes: 15}, h.sender(1));
	assert.equal((await h.message({type: "END_SESSION"}, {...h.sender(1), frameId: 1})).ok, false);
	assert.equal((await h.message({type: "END_SESSION"}, {...h.sender(1), url: "https://other.test"})).stale, true);
	assert.deepEqual(h.removed, []);
	assert.ok(h.data.sessions["example.com"]);
});

test("closing an idle site closes all of its tabs and no others", async () => {
	const h = harness({tabs: [
		{id: 1, url: "https://example.com/a"},
		{id: 2, url: "https://m.example.com/b", pinned: true},
		{id: 3, url: "https://other.test"},
		{id: 4, url: "https://example.com", pendingUrl: "https://other.test/leaving"}
	]});
	assert.equal((await h.message({type: "CLOSE_SITE"}, {...h.sender(1), frameId: 1})).ok, false);
	assert.deepEqual(h.removed, []);
	assert.equal((await h.message({type: "CLOSE_SITE", site: "other.test"}, h.sender(1))).ok, true);
	assert.deepEqual(h.removed, [1, 2]);
	assert.deepEqual([...h.tabs.keys()], [3, 4]);
	assert.equal(h.sounds, 0);
});

test("normalizes full URLs, IDNs and duplicate/overlapping domains", () => {
	assert.deepEqual(core.parseSites("https://WWW.YouTube.com/watch?v=1\nyoutube.com\nmusic.youtube.com\nпример.рф"), ["xn--e1afmkfd.xn--p1ai", "youtube.com"]);
	assert.throws(() => core.parseSites("*.com"));
	assert.throws(() => core.parseSites("about:config"));
	assert.throws(() => core.parseSites("https://user:secret@example.com"));
	assert.throws(() => core.parseSites("com"));
});
test("domain matching includes subdomains and excludes lookalike domains", () => {
	assert.equal(core.matchesSite("https://m.example.com/page", "example.com"), true);
	assert.equal(core.matchesSite("https://example.com.evil.test/", "example.com"), false);
	assert.equal(core.matchesSite("https://notexample.com/", "example.com"), false);
	assert.equal(core.matchesSite("file:///example.com", "example.com"), false);
	assert.equal(core.matchesSite("https://EXAMPLE.COM./", "example.com"), true);
});
test("validates durations and formats long sessions", () => {
	assert.equal(core.validateMinutes("0.1"), 0.1);
	for (const input of ["", "not-a-number", Infinity, -1, 0, 1441]) assert.throws(() => core.validateMinutes(input));
	assert.equal(core.formatTime(119001), "02:00");
	assert.equal(core.formatTime(-10), "00:00");
	assert.equal(core.formatTime(3600000), "1:00:00");
});
test("unlisted sites receive no gate", async () => {
	const h = harness({tabs: [{id: 1, url: "https://other.test"}]});
	const result = await h.message({type: "GET_STATE"}, h.sender(1));
	assert.equal(result.site, null);
	assert.equal(result.session, null);
});
test("simultaneous starts share the first task and deadline; reload does not reset", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://m.example.com/b"}]});
	const [first, second] = await Promise.all([
		h.message({type: "START_SESSION", task: "Learn a new language", minutes: 10}, h.sender(1)),
		h.message({type: "START_SESSION", task: "Another goal", minutes: 30}, h.sender(2))
	]);
	assert.deepEqual(first.session, second.session);
	assert.equal(first.session.task, "Learn a new language");
	h.advance(3000);
	const reloaded = await h.message({type: "GET_STATE"}, h.sender(1));
	assert.equal(reloaded.session.endsAt, first.session.endsAt);
	assert.equal(Object.keys(h.data.sessions).length, 1);
	assert.ok(h.alarms.has("intent:end:example.com"));
});
test("expiry closes every matching tab across windows including pinned tabs", async () => {
	const h = harness({tabs: [
		{id: 1, url: "https://example.com/a", windowId: 1},
		{id: 2, url: "https://m.example.com/b", windowId: 2, pinned: true},
		{id: 3, url: "https://other.test", windowId: 2},
		{id: 4, url: "https://example.com.evil.test", windowId: 1},
		{id: 5, url: "https://notexample.com", windowId: 1}
	]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 0.1}, h.sender(1));
	h.advance(6100);
	await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
	assert.deepEqual(h.removed, [1, 2]);
	assert.deepEqual([...h.tabs.keys()], [3, 4, 5]);
	assert.deepEqual(h.data.sessions, {});
});
test("a tab navigating away immediately before closure survives", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://example.com/b"}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 0.1}, h.sender(1));
	h.advance(6100);
	h.setGetHook((id, tabs) => { if (id === 2) tabs.get(id).pendingUrl = "https://other.test/"; });
	await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
	assert.deepEqual(h.removed, [1]);
	assert.equal(h.tabs.has(2), true);
});
test("warning plays once despite simultaneous checks, alarms and new tabs", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a", active: true}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 5}, h.sender(1));
	h.advance(180001);
	await Promise.all([
		h.api.alarms.onAlarm.emit({name: "intent:warn:example.com"}),
		h.message({type: "CHECK_DEADLINE"}, h.sender(1))
	]);
	h.tabs.set(2, {id: 2, url: "https://example.com/new"});
	await h.message({type: "GET_STATE"}, h.sender(2));
	await h.api.alarms.onAlarm.emit({name: "intent:warn:example.com"});
	assert.equal(h.sounds, 1);
	assert.equal(h.data.sessions["example.com"].warned, true);
});
test("muted settings suppress warning; blocked background audio selects one fallback tab", async () => {
	const tabs = [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://example.com/b", active: true}];
	const silent = harness({tabs, config: {...core.DEFAULTS, sites: ["example.com"], sound: false}});
	await silent.message({type: "START_SESSION", task: "Check", minutes: 0.1}, silent.sender(1));
	await silent.message({type: "CHECK_DEADLINE"}, silent.sender(1));
	assert.equal(silent.sounds, 0);
	assert.equal(silent.messages.filter(message => message.type === "PLAY_WARNING").length, 0);
	const fallback = harness({tabs, failAudio: true});
	await fallback.message({type: "START_SESSION", task: "Check", minutes: 0.1}, fallback.sender(1));
	await fallback.message({type: "CHECK_DEADLINE"}, fallback.sender(1));
	assert.deepEqual(fallback.messages.filter(message => message.type === "PLAY_WARNING").map(message => message.id), [2]);
});
test("background recreation restores absolute deadline and alarms", async () => {
	const tabs = [{id: 1, url: "https://example.com/a"}];
	const h = harness({tabs});
	const initial = await h.message({type: "START_SESSION", task: "Check", minutes: 10}, h.sender(1));
	const restored = harness({tabs, config: h.data.config, sessions: h.data.sessions, now: 1050000});
	await restored.ready();
	assert.equal(restored.data.sessions["example.com"].endsAt, initial.session.endsAt);
	assert.equal(restored.alarms.get("intent:end:example.com").when, initial.session.endsAt);
});
test("expired persisted sessions close matching tabs when background restores", async () => {
	const session = {site: "example.com", task: "Check", endsAt: 900000, startedAt: 800000, warned: true};
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://other.test"}], sessions: {"example.com": session}});
	await h.ready();
	assert.deepEqual(h.removed, [1]);
	assert.deepEqual(h.data.sessions, {});
});
test("closing the last matching tab resets the next visit", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://example.com/b"}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 10}, h.sender(1));
	h.tabs.delete(1);
	await h.api.tabs.onRemoved.emit(1);
	assert.ok(h.data.sessions["example.com"]);
	h.tabs.delete(2);
	await h.api.tabs.onRemoved.emit(2);
	assert.deepEqual(h.data.sessions, {});
	assert.equal(h.alarms.size, 0);
	h.tabs.set(3, {id: 3, url: "https://example.com/new"});
	assert.equal((await h.message({type: "GET_STATE"}, h.sender(3))).session, null);
});
test("emptying the list cancels timers without closing tabs", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 10}, h.sender(1));
	const result = await h.message({type: "SAVE_SETTINGS", config: {...h.data.config, sites: []}});
	assert.equal(result.ok, true);
	assert.deepEqual(h.data.sessions, {});
	assert.equal(h.alarms.size, 0);
	assert.equal(h.removed.length, 0);
	assert.equal(h.messages.at(-1).state.site, null);
});
test("removing a site cancels only its session", async () => {
	const h = harness({config: {...core.DEFAULTS, sites: ["example.com", "other.test"]}, tabs: [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://other.test"}]});
	await h.message({type: "START_SESSION", task: "A", minutes: 10}, h.sender(1));
	await h.message({type: "START_SESSION", task: "B", minutes: 10}, h.sender(2));
	await h.message({type: "SAVE_SETTINGS", config: {...h.data.config, sites: ["other.test"]}});
	assert.deepEqual(Object.keys(h.data.sessions), ["other.test"]);
});
test("content pages cannot change settings or launch a timer for a different site", async () => {
	const h = harness({tabs: [{id: 1, url: "https://other.test"}, {id: 2, url: "https://example.com"}]});
	const denied = await h.message({type: "SAVE_SETTINGS", config: {...core.DEFAULTS, sites: []}}, h.sender(1));
	assert.equal(denied.ok, false);
	const forged = await h.message({type: "START_SESSION", site: "example.com", task: "Check", minutes: 10}, h.sender(1));
	assert.equal(forged.ok, false);
	const subframe = await h.message({type: "START_SESSION", task: "Check", minutes: 10}, {...h.sender(2), frameId: 1});
	assert.equal(subframe.ok, false);
	const empty = await h.message({type: "START_SESSION", task: "  ", minutes: 10}, h.sender(2));
	assert.equal(empty.ok, false);
});
test("an early alarm cannot prematurely close the site", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com"}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 10}, h.sender(1));
	await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
	assert.equal(h.removed.length, 0);
	assert.ok(h.data.sessions["example.com"]);
});
test("page-side deadline checks close tabs even without a delivered alarm", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com"}, {id: 2, url: "https://m.example.com"}]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 0.1}, h.sender(1));
	h.advance(6100);
	await h.message({type: "CHECK_DEADLINE"}, h.sender(1));
	assert.deepEqual(h.removed, [1, 2]);
});

test("reminder position is shared across sites, new tabs and background restarts", async () => {
 const config = {...core.DEFAULTS, sites: ["example.com", "other.test"]};
 const tabs = [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://other.test/"}];
 const h = harness({config, tabs});
 const position = {x: 500, y: 320};
 assert.equal((await h.message({type: "SAVE_POSITION", position}, h.sender(1))).ok, true);
 assert.deepEqual(h.messages.filter(m => m.type === "STATE").map(m => m.state.reminderPosition), [position, position]);
 assert.deepEqual((await h.message({type: "GET_STATE"}, h.sender(2))).reminderPosition, position);
 h.tabs.set(3, {id: 3, url: "https://example.com/new"});
 assert.deepEqual((await h.message({type: "GET_STATE"}, h.sender(3))).reminderPosition, position);
 await h.message({type: "SAVE_SETTINGS", config: {...config, language: "ru"}});
 const restored = harness({config: h.data.config, tabs, reminderPosition: h.data.reminderPosition});
 const state = await restored.message({type: "GET_STATE"}, restored.sender(1));
 assert.deepEqual(state.reminderPosition, position);
 assert.equal(state.config.language, "ru");
 for (const invalid of [null, {x: -1, y: 10}, {x: Infinity, y: 0}, {x: "5", y: 0}]) {
  assert.equal((await h.message({type: "SAVE_POSITION", position: invalid}, h.sender(1))).ok, false);
 }
 assert.deepEqual(h.data.reminderPosition, position);
 assert.equal((await h.message({type: "SAVE_POSITION", position})).ok, false);
});

test("legacy settings default to automatic; translations cover goals and validation errors", () => {
 const {language, ...legacy} = core.DEFAULTS;
 assert.equal(core.validateConfig(legacy).language, "auto");
 assert.equal(core.validateConfig({...legacy, language: "ru"}).language, "ru");
 assert.equal(core.validateConfig({...legacy, language: "unknown"}).language, "auto");
 const context = vm.createContext({});
 vm.runInContext(fs.readFileSync(path.join(extension, "i18n.js"), "utf8"), context);
 const {t} = context.IntentI18n;
 assert.equal(t("Start session"), "Start session");
 assert.equal(t("Start session", "ru"), "Начать сессию");
 assert.equal(t("For example, learn a new language or study a subject", "ru"), "Например, учить новый язык или изучать предмет");
 assert.equal(t("Invalid address: empty string", "ru"), "Некорректный адрес: пустая строка");
});

test("same-site navigation and another tab preserve the original tab's timer", async () => {
 const h = harness({tabs: [{id: 1, url: "https://example.com/start"}]});
 const originalSender = h.sender(1);
 const initial = await h.message({type: "START_SESSION", task: "Learn Spanish", minutes: 10}, originalSender);
 h.tabs.get(1).url = "https://example.com/lesson#exercise";
 await h.api.tabs.onUpdated.emit(1, {url: h.tabs.get(1).url});
 h.tabs.set(2, {id: 2, url: "https://example.com/next"});
 for (const type of ["GET_STATE", "CHECK_DEADLINE"]) {
  const previous = await h.message({type}, originalSender);
  const next = await h.message({type}, h.sender(2));
  assert.equal(previous.site, "example.com");
  assert.deepEqual(previous.session, initial.session);
  assert.deepEqual(next.session, initial.session);
 }
 h.tabs.get(1).pendingUrl = "https://other.test/";
 assert.equal((await h.message({type: "CHECK_DEADLINE"}, originalSender)).stale, true);
 assert.deepEqual((await h.message({type: "GET_STATE"}, h.sender(2))).session, initial.session);
 const forged = await h.message({type: "START_SESSION", task: "Wrong site", minutes: 10}, originalSender);
 assert.equal(forged.stale, true);
 assert.equal(Object.keys(h.data.sessions).length, 1);
});

test("final ten seconds tick once per second across tabs and alarms, then stop", async () => {
 const tabs = [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://example.com/b"}];
 const h = harness({tabs, config: {...core.DEFAULTS, sites: ["example.com"], warningSeconds: 1}});
 await h.message({type: "START_SESSION", task: "Study", minutes: 1}, h.sender(1));
 assert.equal(h.alarms.get("intent:tick:example.com").when, 1050000);
 h.advance(50000);
 for (let second = 10; second >= 1; second--) {
  await Promise.all([
   h.api.alarms.onAlarm.emit({name: "intent:tick:example.com"}),
   h.message({type: "CHECK_DEADLINE"}, h.sender(1)),
   h.message({type: "CHECK_DEADLINE"}, h.sender(2))
  ]);
  assert.equal(h.data.sessions["example.com"].countdownSecond, second);
  assert.equal(h.sounds, 11 - second + (second === 1 ? 1 : 0));
  h.advance(1000);
 }
 await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
 assert.equal(h.sounds, 12); // Ten ticks, the configured warning and the final sound.
 assert.equal(h.alarms.size, 0);
});

test("countdown restores without duplicate ticks, skips missed seconds and respects mute", async () => {
 const tabs = [{id: 1, url: "https://example.com/", active: true}];
 const session = {site: "example.com", task: "Study", endsAt: 1009000, warned: true, countdownSecond: 9};
 const h = harness({tabs, sessions: {"example.com": session}, failAudio: true});
 await h.ready();
 assert.equal(h.messages.filter(m => m.type === "PLAY_TICK").length, 0);
 assert.equal(h.alarms.get("intent:tick:example.com").when, 1001000);
 h.advance(4000);
 await h.api.alarms.onAlarm.emit({name: "intent:tick:example.com"});
 assert.equal(h.messages.filter(m => m.type === "PLAY_TICK").length, 1);
 assert.equal(h.data.sessions["example.com"].countdownSecond, 5);
 await h.message({type: "SAVE_SETTINGS", config: {...h.data.config, sound: false}});
 h.advance(1000);
 await h.api.alarms.onAlarm.emit({name: "intent:tick:example.com"});
 assert.equal(h.messages.filter(m => m.type === "PLAY_TICK").length, 1);
 assert.equal(h.data.sessions["example.com"].countdownSecond, 4);
});


test("automatic language follows browser locale while explicit choices persist", async () => {
 for (const [browserLanguage, expected] of [["de-DE", "de"], ["es-MX", "es"], ["fr-CA", "fr"], ["it-IT", "it"], ["pl-PL", "pl"], ["zh-CN", "zh"], ["hi-IN", "hi"], ["ar-SA", "ar"], ["pt-BR", "pt"], ["pt-PT", "pt"], ["tr-TR", "tr"], ["ja-JP", "en"]]) {
  assert.equal(core.resolveLanguage("auto", browserLanguage), expected);
 }
 const tabs = [{id: 1, url: "https://example.com"}];
 const h = harness({tabs, uiLanguage: "ar-SA"});
 assert.equal((await h.ready()).config.language, "auto");
 assert.equal((await h.message({type: "GET_STATE"}, h.sender(1))).config.language, "ar");
 await h.message({type: "SAVE_SETTINGS", config: {...h.data.config, language: "de"}});
 assert.equal((await h.message({type: "GET_STATE"}, h.sender(1))).config.language, "de");
 const restored = harness({tabs, config: h.data.config, uiLanguage: "fr-FR"});
 assert.equal((await restored.message({type: "GET_STATE"}, restored.sender(1))).config.language, "de");
 await restored.message({type: "SAVE_SETTINGS", config: {...restored.data.config, language: "auto"}});
 assert.equal((await restored.message({type: "GET_STATE"}, restored.sender(1))).config.language, "fr");
});

test("every supported translation covers all labels and preserves address values", () => {
 const source = fs.readFileSync(path.join(extension, "i18n.js"), "utf8");
 const translations = JSON.parse(source.match(/const translations = ([\s\S]*?);\n function t/)[1]);
 const context = vm.createContext({});
 vm.runInContext(source, context);
 const keys = Object.keys(translations.ru);
 for (const language of Object.keys(core.LANGUAGES).filter(code => code !== "en")) {
  assert.deepEqual(Object.keys(translations[language]), keys);
  for (const key of keys) assert.ok(translations[language][key].trim(), `${language}: ${key}`);
  assert.ok(context.IntentI18n.t("Invalid address: example.invalid/path", language).endsWith("example.invalid/path"));
 }
 for (const file of ["options.html", "content.js"]) {
  for (const match of fs.readFileSync(path.join(extension, file), "utf8").matchAll(/data-i18n(?:-placeholder|-label)?="([^"]+)"/g)) {
   assert.ok(keys.includes(match[1]), match[1]);
  }
 }
});


test("expiry plays one final sound across tabs and concurrent deadline events", async () => {
 const tabs = [{id: 1, url: "https://example.com/a"}, {id: 2, url: "https://example.com/b", active: true}];
 const h = harness({tabs});
 await h.message({type: "START_SESSION", task: "Study", minutes: 1}, h.sender(1));
 h.advance(60000);
 await Promise.all([h.api.alarms.onAlarm.emit({name: "intent:end:example.com"}), h.message({type: "GET_SETTINGS"})]);
 assert.deepEqual(h.soundKinds, ["end"]);
 assert.deepEqual(h.removed, [1, 2]);
 const silent = harness({tabs, config: {...core.DEFAULTS, sites: ["example.com"], sound: false}});
 await silent.message({type: "START_SESSION", task: "Study", minutes: 1}, silent.sender(1));
 silent.advance(60000);
 await silent.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
 assert.equal(silent.sounds, 0);
 assert.deepEqual(silent.removed, [1, 2]);
 const fallback = harness({tabs, failAudio: true});
 await fallback.message({type: "START_SESSION", task: "Study", minutes: 1}, fallback.sender(1));
 fallback.advance(60000);
 let finish;
 fallback.api.tabs.sendMessage = async (id, message) => {
  if (message.type === "PLAY_END") {
   assert.equal(id, 2);
   assert.deepEqual(fallback.removed, []);
   await new Promise(resolve => { finish = resolve; });
  }
 };
 const expiry = fallback.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(typeof finish, "function");
 assert.deepEqual(fallback.removed, []);
 finish();
 await expiry;
 assert.deepEqual(fallback.removed, [1, 2]);
});


test("all-sites mode is opt-in and excludes system pages and protected services", () => {
 const config = {...core.DEFAULTS, sites: []};
 assert.equal(core.siteForUrl("https://example.com", config), null);
 config.allSites = true;
 assert.equal(core.siteForUrl("https://www.example.com/page", config), "example.com");
 assert.equal(core.siteForUrl("http://localhost:8080", config), "localhost");
 for (const url of ["about:preferences", "about:config", "about:addons", "about:newtab", "chrome://settings", "moz-extension://test/options.html", "file:///tmp/page.html", "view-source:https://example.com", "https://addons.mozilla.org", "https://accounts.firefox.com", "https://support.mozilla.org"]) {
  assert.equal(core.siteForUrl(url, config), null, url);
 }
 assert.equal(core.validateConfig({...config, enabled: false}).allSites, true);
 assert.equal(Object.hasOwn(core.validateConfig(config), "enabled"), false);
});

test("all-sites sessions restore, stay independent, and cancel when returning to an empty list", async () => {
 const tabs = [{id: 1, url: "https://example.com"}, {id: 2, url: "https://other.test"}, {id: 3, url: "about:preferences"}, {id: 4, url: "https://addons.mozilla.org"}];
 const h = harness({tabs, config: {...core.DEFAULTS, allSites: true}});
 await h.message({type: "START_SESSION", task: "A", minutes: 1}, h.sender(1));
 await h.message({type: "START_SESSION", task: "B", minutes: 2}, h.sender(2));
 const restored = harness({tabs, config: h.data.config, sessions: h.data.sessions});
 await restored.ready();
 assert.equal(Object.keys(restored.data.sessions).length, 2);
 restored.advance(60000);
 await restored.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
 assert.deepEqual(restored.removed, [1]);
 assert.ok(restored.data.sessions["other.test"]);
 await restored.message({type: "SAVE_SETTINGS", config: {...restored.data.config, allSites: false}});
 assert.deepEqual(restored.data.sessions, {});
 assert.deepEqual(restored.removed, [1]);
 assert.equal(restored.alarms.size, 0);
});

test("expiry keeps a window open when all of its tabs belong to the site", async () => {
	const h = harness({tabs: [
		{id: 1, url: "https://example.com/a", windowId: 1},
		{id: 2, url: "https://m.example.com/b", windowId: 1},
		{id: 3, url: "https://example.com/c", windowId: 2},
		{id: 4, url: "https://other.test", windowId: 2}
	]});
	await h.message({type: "START_SESSION", task: "Check", minutes: 0.1}, h.sender(1));
	h.advance(6100);
	await h.api.alarms.onAlarm.emit({name: "intent:end:example.com"});
	assert.deepEqual(h.removed, [1, 2, 3]);
	// Only window 1 would have become empty, so only it receives a replacement tab.
	assert.deepEqual(h.created, [{windowId: 1}]);
	assert.deepEqual([...h.tabs.values()].map(tab => tab.windowId).sort(), [1, 2]);
});

test("an early tick alarm is rescheduled instead of silencing the countdown", async () => {
	const h = harness({tabs: [{id: 1, url: "https://example.com/a"}]});
	await h.message({type: "START_SESSION", task: "Study", minutes: 1}, h.sender(1));
	const endsAt = h.data.sessions["example.com"].endsAt;
	h.advance(50000 - 5);
	// Browsers remove one-shot alarms once they fire.
	h.alarms.delete("intent:tick:example.com");
	await h.api.alarms.onAlarm.emit({name: "intent:tick:example.com"});
	assert.equal(h.data.sessions["example.com"].countdownSecond, undefined);
	const next = h.alarms.get("intent:tick:example.com")?.when;
	assert.ok(next >= endsAt - 10000 && next <= endsAt - 9800, `tick rescheduled near the ten-second mark, got ${next}`);
	h.advance(5);
	h.alarms.delete("intent:tick:example.com");
	await h.api.alarms.onAlarm.emit({name: "intent:tick:example.com"});
	assert.equal(h.data.sessions["example.com"].countdownSecond, 10);
});
