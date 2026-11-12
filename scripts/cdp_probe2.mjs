/**
 * Second pass: real-world files, queue drawer, recent tab, search, mobile.
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
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 0;
const pending = new Map();
const errors = [];
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
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`shot: ${name}.png`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: PAGE_URL });
await sleep(3200);

// pick a real WeChat m4a far down the list
console.log("list sample:", await evaluate(`Array.from(document.querySelectorAll('.track')).slice(0, 6).map(x => ({id: x.dataset.id, title: x.querySelector('.t')?.textContent, dur: x.querySelector('.dur')?.textContent}))`));

const realId = await evaluate(`(() => { const rows = Array.from(document.querySelectorAll('.track')); const r = rows.find(x => x.querySelector('.t')?.textContent === '晚安') || rows[3]; return r?.dataset.id; })()`);
console.log("chosen real track id:", realId);
await evaluate(`document.querySelector('.track[data-id="${realId}"]').click()`, true);
await sleep(4500);
console.log("real playback:", await evaluate(`({
  title: document.querySelector('#nowTitle')?.textContent,
  playing: window.__mh.player.playing,
  timeMs: Math.round(window.__mh.player.currentTimeMs),
  durationMs: Math.round(window.__mh.player.durationMs),
  audioError: document.querySelector('#audio')?.error?.code || null,
  badge: document.querySelector('#eventState')?.textContent,
  toast: document.querySelector('#toast')?.textContent
})`));
console.log("duration backfilled:", await (async () => {
  const res = await fetch(`http://127.0.0.1:8787/api/tracks/${realId}`);
  const data = await res.json();
  return { id: data.id, duration_ms: data.duration_ms };
})());

// queue drawer
await evaluate(`document.querySelector('#queueBtn').click()`, true);
await sleep(700);
await shot("05-queue");
console.log("queue drawer:", await evaluate(`({
  open: document.querySelector('#queuePanel')?.classList.contains('open'),
  items: document.querySelectorAll('.queue-item').length,
  active: document.querySelector('.queue-item.active .t')?.textContent
})`));
await evaluate(`document.querySelector('#closeQueue').click()`);
await sleep(500);

// recent tab
await evaluate(`document.querySelector('.tab[data-tab="recent"]').click()`, true);
await sleep(900);
console.log("recent tab:", await evaluate(`({
  label: document.querySelector('#listLabel')?.textContent,
  rows: document.querySelectorAll('.track').length,
  first: document.querySelector('.track .t')?.textContent,
  meta: document.querySelector('.track .a')?.textContent
})`));
await shot("06-recent");

// search
await evaluate(`(() => { const s = document.querySelector('#search'); s.value = '夜航'; s.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(900);
console.log("search:", await evaluate(`({
  tab: document.querySelector('.tab.active')?.dataset.tab,
  label: document.querySelector('#listLabel')?.textContent,
  rows: document.querySelectorAll('.track').length,
  title: document.querySelector('.track .t')?.textContent
})`));

// instrumental track lyrics state
await evaluate(`(() => { const s = document.querySelector('#search'); s.value = ''; s.dispatchEvent(new Event('input', {bubbles:true})); })()`);
await sleep(900);
await evaluate(`document.querySelector('.track[data-id="46"]').click()`, true);
await sleep(1500);
await evaluate(`document.querySelector('#lyricsBtn').click()`, true);
await sleep(1200);
console.log("no-lyrics overlay:", await evaluate(`({
  title: document.querySelector('#loTitle')?.textContent,
  lines: document.querySelectorAll('.lo-line').length,
  text: document.querySelector('.lo-line')?.textContent,
  peek: document.querySelector('.peek-line.active')?.textContent
})`));
await shot("07-no-lyrics");
await evaluate(`document.querySelector('#closeLyrics').click()`);
await sleep(400);

// mobile
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.reload", { ignoreCache: false });
await sleep(3200);
await shot("08-mobile");
console.log("mobile:", await evaluate(`({
  w: innerWidth,
  tracks: document.querySelectorAll('.track').length,
  coverW: Math.round(document.querySelector('#cover')?.getBoundingClientRect().width),
  bodyOverflow: getComputedStyle(document.body).overflow
})`));

// restore
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
console.log("errors:", errors.slice(0, 6));
ws.close();
process.exit(0);
