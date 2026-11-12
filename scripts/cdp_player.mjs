/** Player-first acceptance: resume, queue insert/reorder, lyric offset, F full screen. */
import { setTimeout as sleep } from "node:timers/promises";

const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression, userGesture = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(3200);

console.log("boot:", await evaluate(`({
  title: document.querySelector('#nowTitle')?.textContent,
  cur: document.querySelector('#curTime')?.textContent,
  badge: document.querySelector('#eventState')?.textContent,
  resume: localStorage.getItem('mh.resume')
})`));

await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(6500);
console.log("playing:", await evaluate(`({
  t: Math.round(__mh.player.currentTimeMs),
  playing: __mh.player.playing,
  resume: JSON.parse(localStorage.getItem('mh.resume') || 'null')
})`));
await shot("30-player-queue-base");

await send("Page.reload");
await sleep(3200);
console.log("resume after reload:", await evaluate(`({
  title: document.querySelector('#nowTitle')?.textContent,
  cur: document.querySelector('#curTime')?.textContent,
  badge: document.querySelector('#eventState')?.textContent,
  paused: document.querySelector('#audio').paused,
  currentTime: Math.round(document.querySelector('#audio').currentTime)
})`));
await shot("31-resume");

// queue insert next
await evaluate(`document.querySelector('#queueBtn').click()`, true);
await sleep(600);
console.log("queue before:", await evaluate(`__mh.player.queue.slice(0,4).map(t=>t.title)`));
await evaluate(`document.querySelectorAll('.queue-item')[4].querySelector('.queue-insert').click()`, true);
await sleep(600);
console.log("queue after insert:", await evaluate(`({ order: __mh.player.queue.slice(0,4).map(t=>t.title), next: __mh.player.queue[__mh.player.index+1]?.title })`));
await shot("32-queue-insert");

// reorder via real DragEvent sequence
await evaluate(`(() => {
  const items = document.querySelectorAll('.queue-item');
  const src = items[3], dst = items[0];
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:dt}));
  dst.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:dt}));
  dst.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:dt}));
  return true;
})()`);
await sleep(600);
console.log("queue after drag:", await evaluate(`__mh.player.queue.slice(0,4).map(t=>t.title)`));

// lyric offset
await evaluate(`document.querySelector('#closeQueue').click()`);
await sleep(300);
await evaluate(`document.querySelector('#lyricsBtn').click()`, true);
await sleep(900);
const before = await evaluate(`({ label: document.querySelector('#lyrOffsetLabel')?.textContent, offset: __mh.state.lyricOffset })`);
await evaluate(`document.querySelector('#lyrPlus').click(); document.querySelector('#lyrPlus').click();`, true);
await sleep(400);
const after = await evaluate(`({
  label: document.querySelector('#lyrOffsetLabel')?.textContent,
  offset: __mh.state.lyricOffset,
  stored: localStorage.getItem('mh.lyr.' + __mh.player.track.id)
})`);
console.log("lyric offset:", { before, after });
await shot("33-lyric-offset");
await evaluate(`document.querySelector('#closeLyrics').click()`);
await sleep(300);

// F opens full-screen
for (const type of ["keyDown", "keyUp"]) {
  await send("Input.dispatchKeyEvent", { type, key: "f", code: "KeyF", windowsVirtualKeyCode: 70 });
}
await sleep(700);
console.log("F full screen:", await evaluate(`({
  open: document.querySelector('#lyricsOverlay')?.classList.contains('open'),
  active: document.querySelector('.lo-line.active')?.textContent,
  label: document.querySelector('#lyrOffsetLabel')?.textContent
})`));
await shot("34-f-full");

console.log("errors:", errors.slice(0, 8));
ws.close();
process.exit(0);
