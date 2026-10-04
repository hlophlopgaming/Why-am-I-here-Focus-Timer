"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../sound.js"), "utf8");

test("synthesizes three warning tones and one countdown tone, reusing the context", async () => {
 const tones = [];
 let contexts = 0, resumes = 0, disconnected = 0;
 class AudioContext {
  constructor() { contexts++; this.state = "suspended"; this.currentTime = 10; this.destination = {}; }
  async resume() { resumes++; this.state = "running"; }
  createOscillator() {
   const tone = {frequency: {}, connect() {}, disconnect() { disconnected++; },
    start(time) { this.startTime = time; }, stop(time) { this.stopTime = time; }};
   tones.push(tone);
   return tone;
  }
  createGain() {
   return {gain: {setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}},
    connect() {}, disconnect() { disconnected++; }};
  }
 }
 const context = vm.createContext({AudioContext, DOMException, setTimeout, clearTimeout});
 vm.runInContext(source, context);
 await context.IntentSound.play("warning");
 assert.deepEqual(tones.map(tone => tone.frequency.value), [660, 660, 880]);
 assert.deepEqual(tones.map(tone => tone.startTime), [10, 10.22, 10.44]);
 assert.ok(tones.every(tone => tone.stopTime > tone.startTime));
 tones.forEach(tone => tone.onended());
 assert.equal(disconnected, 6);
 await context.IntentSound.play("tick");
 assert.equal(tones.length, 4);
 assert.equal(tones[3].frequency.value, 880);
 assert.equal(contexts, 1);
 assert.equal(resumes, 1);
 let complete = false;
 const ending = context.IntentSound.play("end").then(() => { complete = true; });
 await new Promise(resolve => setImmediate(resolve));
 const finalTones = tones.slice(4);
 assert.deepEqual(finalTones.map(tone => tone.frequency.value), [523.25, 392, 261.63]);
 assert.ok(finalTones[2].stopTime - finalTones[2].startTime >= 0.49);
 assert.equal(complete, false);
 finalTones.forEach(tone => tone.onended());
 await ending;
 assert.equal(complete, true);
});

test("blocked audio rejects without scheduling late tones or stalling background work", async () => {
 let release, tones = 0;
 class AudioContext {
  constructor() { this.state = "suspended"; }
  resume() { return new Promise(resolve => { release = () => { this.state = "running"; resolve(); }; }); }
  createOscillator() { tones++; }
 }
 const context = vm.createContext({AudioContext, DOMException, setTimeout, clearTimeout});
 vm.runInContext(source, context);
 await assert.rejects(context.IntentSound.play("tick"), {name: "NotAllowedError"});
 release();
 await Promise.resolve();
 assert.equal(tones, 0);
});
