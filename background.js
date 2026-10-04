/* Firefox MV3 event page. Deadlines are stored, never decremented counters. */
"use strict";
const api = browser;
const core = IntentCore;
let config = {...core.DEFAULTS};
let sessions = {};
let reminderPosition = null;
let queue = Promise.resolve();

function enqueue(task) {
	const next = queue.then(task);
	queue = next.catch(error => console.error("Site Intent:", error));
	return next;
}
async function persist() {
	await api.storage.local.set({config, sessions});
}
function alarmName(kind, site) {
	return `intent:${kind}:${site}`;
}
async function clearAlarms(site) {
	await api.alarms.clear(alarmName("warn", site));
	await api.alarms.clear(alarmName("end", site));
	await api.alarms.clear(alarmName("tick", site));
}
async function schedule(session) {
	const nextSecond = Math.min(10, (session.countdownSecond ?? 11) - 1);
	if (nextSecond > 0) await api.alarms.create(alarmName("tick", session.site), {when: Math.max(Date.now() + 100, session.endsAt - nextSecond * 1000)});
	await api.alarms.create(alarmName("end", session.site), {when: session.endsAt});
	if (!session.warned) {
		await api.alarms.create(alarmName("warn", session.site), {when: Math.max(Date.now() + 100, session.endsAt - config.warningSeconds * 1000)});
	}
}
function stateFor(url) {
	const site = core.siteForUrl(url, config);
	return {ok: true, config: {...config, language: core.resolveLanguage(config.language, api.i18n?.getUILanguage())}, reminderPosition, site, session: site ? sessions[site] || null : null};
}
function tabMatches(tab, site) {
	// pendingUrl takes priority while a tab is navigating away.
	return core.siteForUrl(tab.pendingUrl || tab.url, config) === site;
}
async function broadcast() {
	const tabs = await api.tabs.query({});
	await Promise.allSettled(tabs.map(tab => api.tabs.sendMessage(tab.id, {type: "STATE", state: stateFor(tab.pendingUrl || tab.url)})));
}
async function expire(site) {
	if (!sessions[site]) return;
	delete sessions[site];
	await persist();
	await clearAlarms(site);
	await playSound(site, "end", "PLAY_END");
	const candidates = (await api.tabs.query({})).filter(tab => tabMatches(tab, site));
	for (const tab of candidates) {
		try {
			// Recheck immediately before closing so a tab that left the site survives.
			const current = await api.tabs.get(tab.id);
			if (tabMatches(current, site)) await api.tabs.remove(tab.id);
		} catch (error) {
			// Tabs may close independently. Other tabs must still be processed.
			console.debug("Site Intent: tab no longer available", error);
		}
	}
	await broadcast();
}
async function warn(site) {
	const session = sessions[site];
	if (!session || session.warned) return;
	if (session.endsAt <= Date.now()) { await expire(site); return; }
	// One warning per session, shared across all tabs, including page reloads.
	session.warned = true;
	await persist();
	await broadcast();
	await playSound(site, "warning", "PLAY_WARNING");
}
async function playSound(site, kind, type) {
	if (!config.sound) return;
	try {
		await IntentSound.play(kind);
	} catch {
		const tabs = (await api.tabs.query({})).filter(tab => tabMatches(tab, site));
		const target = tabs.find(tab => tab.active) || tabs[0];
		if (target) await api.tabs.sendMessage(target.id, {type}).catch(() => {});
	}
}
async function countdown(site) {
	const session = sessions[site];
	if (!session) return;
	const seconds = Math.ceil((session.endsAt - Date.now()) / 1000);
	if (seconds < 1 || seconds > 10) return;
	// Persist before playback so other tabs and a restored event page cannot repeat a tick.
	if (session.countdownSecond !== undefined && session.countdownSecond <= seconds) return;
	session.countdownSecond = seconds;
	await persist();
	if (seconds > 1) await api.alarms.create(alarmName("tick", site), {when: session.endsAt - (seconds - 1) * 1000});
	await playSound(site, "tick", "PLAY_TICK");
}

async function sweep() {
	for (const site of Object.keys(sessions)) {
		const session = sessions[site];
		if (session.endsAt <= Date.now()) await expire(site);
		else {
			if (!session.warned && session.endsAt - Date.now() <= config.warningSeconds * 1000) await warn(site);
			await countdown(site);
		}
	}
}
async function restore() {
	const stored = await api.storage.local.get(["config", "sessions", "reminderPosition"]);
	reminderPosition = core.validPosition(stored.reminderPosition) ? stored.reminderPosition : null;
	try { config = core.validateConfig(stored.config || core.DEFAULTS); }
	catch { config = {...core.DEFAULTS}; }
	sessions = {};
	for (const [site, session] of Object.entries(stored.sessions || {})) {
		if (core.siteForUrl(`https://${site}`, config) === site && session.site === site && typeof session.task === "string" && Number.isFinite(session.endsAt)) {
			sessions[site] = session;
		}
	}
	await api.alarms.clearAll();
	await sweep();
	for (const session of Object.values(sessions)) await schedule(session);
	await persist();
}
async function cleanupEmptySessions() {
	const tabs = await api.tabs.query({});
	let changed = false;
	for (const site of Object.keys(sessions)) {
		if (!tabs.some(tab => tabMatches(tab, site))) {
			delete sessions[site];
			await clearAlarms(site);
			changed = true;
		}
	}
	if (changed) await persist();
}
function isExtensionPage(sender) {
	return sender.url?.startsWith(api.runtime.getURL(""));
}
async function handle(message, sender) {
	if (!message || typeof message.type !== "string") throw new Error("Unknown request.");
	if (message.type === "GET_SETTINGS") {
		if (!isExtensionPage(sender)) throw new Error("Settings access denied.");
		await sweep();
		return {ok: true, config, sessions: Object.values(sessions)};
	}
	if (message.type === "SAVE_SETTINGS") {
		if (!isExtensionPage(sender)) throw new Error("Settings access denied.");
		config = core.validateConfig(message.config);
		for (const site of Object.keys(sessions)) {
			if (core.siteForUrl(`https://${site}`, config) !== site) {
				delete sessions[site];
				await clearAlarms(site);
			}
		}
		await persist();
		for (const session of Object.values(sessions)) await schedule(session);
		await sweep();
		await broadcast();
		return {ok: true, config};
	}
	if (message.type === "OPEN_SETTINGS") {
		await api.runtime.openOptionsPage();
		return {ok: true};
	}
	// Content scripts can only act on the site of their own tab.
	if (!sender.tab || sender.frameId !== 0) throw new Error("The request must come from a website tab.");
	const tab = await api.tabs.get(sender.tab.id);
	const url = tab.pendingUrl || tab.url;
	const site = core.siteForUrl(url, config);
	// A content script can retain its original URL after same-document navigation.
	// Compare sites, not paths, and ignore requests from a departing document.
	if (sender.url && core.siteForUrl(sender.url, config) !== site) return {ok: true, stale: true};
	if (message.type === "GET_STATE" || message.type === "CHECK_DEADLINE") {
		await sweep();
		return stateFor(url);
	}
	if (message.type === "SAVE_POSITION") {
		if (!site || !core.validPosition(message.position)) throw new Error("Invalid reminder position.");
		reminderPosition = {x: message.position.x, y: message.position.y};
		await api.storage.local.set({reminderPosition});
		await broadcast();
		return {ok: true};
	}
	if (message.type === "START_SESSION") {
		if (!site) throw new Error("This site is no longer on the list.");
		await sweep();
		const liveTab = await api.tabs.get(tab.id);
		if (core.siteForUrl(liveTab.pendingUrl || liveTab.url, config) !== site) throw new Error("This tab has navigated to another site.");
		if (sessions[site]) return stateFor(url);
		const task = String(message.task || "").trim();
		if (!task || task.length > 300) throw new Error("Describe your goal using 1 to 300 characters.");
		const minutes = core.validateMinutes(message.minutes);
		const startedAt = Date.now();
		sessions[site] = {site, task, startedAt, endsAt: startedAt + Math.round(minutes * 60000), warned: false};
		await persist();
		await schedule(sessions[site]);
		await broadcast();
		return stateFor(url);
	}
	throw new Error("Unknown request.");
}

// Register wake-up events synchronously before any asynchronous initialization.
api.runtime.onMessage.addListener((message, sender) => enqueue(() => handle(message, sender)).catch(error => ({ok: false, error: error.message})));
api.alarms.onAlarm.addListener(alarm => enqueue(async () => {
	if (!alarm.name.startsWith("intent:")) return;
	const [, kind, ...parts] = alarm.name.split(":");
	const site = parts.join(":");
	const session = sessions[site];
	if (!session) return;
	if (kind === "end") {
		if (session.endsAt <= Date.now()) await expire(site);
		else await schedule(session);
	} else if (kind === "tick") {
		await sweep();
	} else if (kind === "warn") {
		if (session.endsAt - Date.now() <= config.warningSeconds * 1000) await warn(site);
		else await schedule(session);
	}
}));
api.tabs.onRemoved.addListener(() => enqueue(cleanupEmptySessions));
api.tabs.onUpdated.addListener((_id, changes) => {
	if (changes.url || changes.status === "complete") enqueue(async () => { await sweep(); await cleanupEmptySessions(); });
});
api.runtime.onStartup.addListener(() => enqueue(restore));
api.runtime.onInstalled.addListener(details => enqueue(async () => {
	if (details.reason === "install") await api.runtime.openOptionsPage();
}));
api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
enqueue(restore);
