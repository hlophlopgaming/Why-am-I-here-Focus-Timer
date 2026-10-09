"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("the intent form keeps keyboard events away from page shortcuts", async () => {
	const elements = new Map();
	const makeElement = () => ({
		handlers: {}, isConnected: true, style: {setProperty() {}}, classList: {toggle() {}},
		addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
		append() {}, remove() {}, focus() {}, showModal() {}, querySelector() { return null; }
	});
	for (const selector of [".backdrop", ".site", "#intent-minutes", ".settings", "form", ".error", ".start", ".close-site", "#intent-task", ".minutes-note"]) elements.set(selector, makeElement());
	elements.get(".minutes-note").dataset = {i18n: "subdomains"};
	elements.get("#intent-minutes").value = "15";
	elements.get("#intent-task").value = "";
	const root = {
		activeElement: null,
		append(element) { if (element.className === "shell") this.shell = element; },
		querySelector(selector) { return selector === ".shell" ? this.shell : elements.get(selector); },
		querySelectorAll(selector) { return selector === "[data-minutes]" ? [] : []; }
	};
	const hosts = [];
	const document = {
		documentElement: {append(element) { element.isConnected = true; hosts.push(element); }},
		activeElement: null,
		createElement(name) {
			const element = makeElement();
			if (name === "div") element.attachShadow = () => root;
			return element;
		},
		addEventListener() {}, hidden: false
	};
	const messages = [];
	let sites = [];
	const browser = {runtime: {
		onMessage: {addListener() {}},
		sendMessage: async message => {
			messages.push(message);
			return {ok: true, site: "youtube.com", session: null, reminderPosition: null, config: {language: "en", defaultMinutes: 15, sites}};
		}
	}};
	const intervals = [];
	const context = vm.createContext({
		browser, document, window: {addEventListener() {}}, console,
		IntentCore: {}, IntentI18n: {t: text => text, localize() {}}, IntentSound: {unlock: async () => {}},
		setInterval: callback => { intervals.push(callback); return intervals.length; }, clearInterval() {}
	});
	vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
	await new Promise(resolve => setTimeout(resolve, 10));

	let cancelPrevented = false;
	elements.get(".backdrop").handlers.cancel[0]({preventDefault() { cancelPrevented = true; }});
	assert.equal(cancelPrevented, true, "Escape must not dismiss the intent form");
	assert.equal(elements.get(".start").disabled, true);
	elements.get("#intent-task").value = "Read documentation";
	elements.get("#intent-task").handlers.input[0]();
	assert.equal(elements.get(".start").disabled, false);

	for (const type of ["keydown", "keyup", "keypress"]) {
		let stopped = false;
		for (const handler of root.shell.handlers[type]) handler({key: "k", stopPropagation() { stopped = true; }});
		assert.equal(stopped, true, `${type} must not reach YouTube`);
	}
	await elements.get(".close-site").handlers.click[0]();
	assert.equal(messages.at(-1).type, "CLOSE_SITE");

	// All-sites hosts do not cover subdomains, so the form must not promise that.
	assert.equal(elements.get(".minutes-note").dataset.i18n, "Time in minutes. When it ends, all tabs of this site close in every window. Save your work first.");

	// A page that removes the overlay while the form is open gets it back.
	assert.equal(intervals.length, 1, "the form keeps a watchdog running");
	assert.equal(hosts.length, 1);
	hosts[0].isConnected = false;
	intervals[0]();
	assert.equal(hosts.length, 2, "the form is remounted after removal");
	assert.equal(hosts[1].isConnected, true);
});
