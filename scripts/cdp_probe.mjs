/**
 * Local verification harness: drive the real page in headless Edge over CDP.
 * Usage: node scripts/cdp_probe.mjs [url]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PAGE_URL = process.argv[2] || "http://127.0.0.1:8787/";
const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const PORT = 9223;

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(d.exception?.description || d.text);
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push(msg.params.entry.text);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, userGesture = false) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`shot: ${name}.png`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: PAGE_URL });
await sleep(3500);

console.log("boot:", await evaluate(`({
  ready: !!window.__mh,
  title: document.title,
  tracks: document.querySelectorAll('.track').length,
  listMeta: document.querySelector('#listMeta')?.textContent,
  hero: document.querySelector('#nowTitle')?.textContent,
  cover: {
    hidden: document.querySelector('#coverImg')?.hidden,
    naturalWidth: document.querySelector('#coverImg')?.naturalWidth,
    src: document.querySelector('#coverImg')?.getAttribute('src'),
    complete: document.querySelector('#coverImg')?.complete
  },
  errors: []
})`));
await shot("01-player");

// play with a real user gesture
await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(6000);
console.log("playing:", await evaluate(`({
  playing: window.__mh.player.playing,
  timeMs: Math.round(window.__mh.player.currentTimeMs),
  durationMs: Math.round(window.__mh.player.durationMs),
  eventId: window.__mh.journal.eventId,
  playedMs: Math.round(window.__mh.journal.played),
  badge: document.querySelector('#eventState')?.textContent,
  coverHidden: document.querySelector('#coverImg')?.hidden,
  coverW: document.querySelector('#coverImg')?.naturalWidth,
  activeLine: document.querySelector('.peek-line.active')?.textContent
})`));
await shot("02-playing");

// immersive lyrics
await evaluate(`document.querySelector('#lyricsBtn').click()`, true);
await sleep(1800);
console.log("lyrics open:", await evaluate(`({
  open: document.querySelector('#lyricsOverlay')?.classList.contains('open'),
  lines: document.querySelectorAll('.lo-line').length,
  active: document.querySelector('.lo-line.active')?.textContent,
  offset: document.querySelector('#loLines')?.style.transform,
  stageH: document.querySelector('#loStage')?.clientHeight
})`));
await shot("03-lyrics");

// drag lyric sheet upward -> should seek forward
const box = await evaluate(`(() => { const r = document.querySelector('#loStage').getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height}; })()`);
const before = await evaluate(`Math.round(window.__mh.player.currentTimeMs)`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 6; i++) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y - i * 30, button: "left", buttons: 1 });
  await sleep(40);
}
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y - 180, button: "left", buttons: 0, clickCount: 1 });
await sleep(1500);
const after = await evaluate(`Math.round(window.__mh.player.currentTimeMs)`);
console.log("drag seek:", { before, after, delta: after - before });
await shot("04-lyrics-after-drag");

await sleep(1500);
console.log("journal after:", await evaluate(`({
  eventId: window.__mh.journal.eventId,
  playedMs: Math.round(window.__mh.journal.played),
  badge: document.querySelector('#eventState')?.textContent
})`));

console.log("console errors:", consoleErrors.slice(0, 10));
ws.close();
process.exit(0);
