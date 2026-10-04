"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("sound preview starts in the click handler and reports failures", async () => {
 const elements = new Map();
 const document = {documentElement: {}, createElement: () => ({}), querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, {
   append() {}, replaceChildren() {}, handlers: {}, textContent: "", classList: {toggle() {}},
   addEventListener(name, handler) { this.handlers[name] = handler; }
  });
  return elements.get(selector);
 }};
 let plays = 0, failure = null;
 let confirmed = false, confirmations = 0;
 const requests = [];
 const IntentSound = {play(kind) {
  assert.equal(kind, "warning");
  plays++;
  return failure ? Promise.reject(failure) : Promise.resolve();
 }};
 const context = vm.createContext({
  window: {confirm() { confirmations++; return confirmed; }},
  document, IntentSound, IntentCore: require("../core.js"), IntentI18n: {t: text => text, localize() {}},
  console: {error() {}}, setInterval() {},
  browser: {runtime: {
   getURL: name => `moz-extension://intent/${name}`,
   sendMessage: message => { requests.push(message); return new Promise(() => {}); }
  }}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname, "../options.js"), "utf8"), context);
 const allSites = elements.get("#all-sites");
 allSites.checked = true;
 allSites.handlers.change();
 assert.equal(allSites.checked, false, "cancel must leave all-sites mode disabled");
 confirmed = true;
 allSites.checked = true;
 allSites.handlers.change();
 assert.equal(allSites.checked, true);
 allSites.checked = false;
 allSites.handlers.change();
 assert.equal(confirmations, 2, "disabling does not require confirmation");
 const click = elements.get("#test-sound").handlers.click;
 const pending = click();
 assert.equal(plays, 1, "play must be called before any async work");
 await pending;
 assert.equal(elements.get("#status").textContent, "Sound played.");
 await click();
 assert.equal(plays, 2);
 failure = Object.assign(new Error("Playback denied"), {name: "NotAllowedError"});
 await click();
 assert.match(elements.get("#status").textContent, /NotAllowedError: Playback denied/);
 assert.deepEqual(requests.map(message => message.type), ["GET_SETTINGS"]);
});
