/* Generate tones directly: no media files, codecs or network requests. */
(() => {
 "use strict";
 let context;
 async function unlock() {
  if (!context || context.state === "closed") context = new AudioContext();
  if (context.state !== "running") {
   let timeout;
   try {
    // A blocked resume can stay pending. Never stall the background timer queue.
    await Promise.race([
     context.resume(),
     new Promise((_, reject) => { timeout = setTimeout(() => reject(new DOMException("Audio playback is blocked", "NotAllowedError")), 500); })
    ]);
   } finally { clearTimeout(timeout); }
  }
  if (context.state !== "running") throw new DOMException("Audio playback is blocked", "NotAllowedError");
 }
 async function play(kind = "warning") {
  await unlock();
  const final = kind === "end";
  const frequencies = final ? [523.25, 392, 261.63] : kind === "tick" ? [880] : [660, 660, 880];
  let finished;
  const ending = final ? new Promise(resolve => { finished = resolve; }) : null;
  frequencies.forEach((frequency, index) => {
   const oscillator = context.createOscillator();
   const gain = context.createGain();
   const start = context.currentTime + index * (final ? 0.24 : 0.22);
   const duration = final ? (index === 2 ? 0.5 : 0.2) : 0.13;
   oscillator.frequency.value = frequency;
   gain.gain.setValueAtTime(0, start);
   gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
   gain.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.01);
   oscillator.connect(gain);
   gain.connect(context.destination);
   oscillator.onended = () => {
    oscillator.disconnect(); gain.disconnect();
    if (final && index === frequencies.length - 1) finished();
   };
   oscillator.start(start);
   oscillator.stop(start + duration);
  });
  if (final) {
   let timeout;
   try {
    // Let the final note finish before closing the fallback tab; bound device stalls.
    await Promise.race([ending, new Promise(resolve => { timeout = setTimeout(resolve, 1200); })]);
   } finally { clearTimeout(timeout); }
  }
 }
 globalThis.IntentSound = {unlock, play};
})();
