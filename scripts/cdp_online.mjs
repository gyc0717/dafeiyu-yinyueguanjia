/** Online source acceptance: search QQ, play, lyrics, journal. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
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

await evaluate(`document.querySelector('.tab[data-tab="online"]').click()`, true);
await sleep(400);
console.log("online tab empty:", await evaluate(`({
  tab: document.querySelector('.tab.active')?.dataset.tab,
  placeholder: document.querySelector('#search')?.placeholder,
  empty: document.querySelector('.list-empty')?.textContent
})`));
await shot("19-online-empty");

await evaluate(`(() => { const s = document.querySelector('#search'); s.value = '晴天'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(3500);
console.log("search results:", await evaluate(`({
  label: document.querySelector('#listLabel')?.textContent,
  meta: document.querySelector('#listMeta')?.textContent,
  rows: document.querySelectorAll('.track').length,
  first: {
    title: document.querySelector('.track .t')?.textContent,
    sub: document.querySelector('.track .a')?.textContent,
    dur: document.querySelector('.track .dur')?.textContent,
    thumb: document.querySelector('.track .thumb img')?.naturalWidth
  }
})`));
await shot("20-online-search");

await evaluate(`document.querySelector('.track').click()`, true);
await sleep(5500);
console.log("online playing:", await evaluate(`({
  playing: __mh.player.playing,
  title: __mh.player.track?.title,
  provider: __mh.player.track?.provider,
  label: __mh.player.track?.provider_label,
  timeMs: Math.round(__mh.player.currentTimeMs),
  durationMs: Math.round(__mh.player.durationMs),
  eyebrow: document.querySelector('#eyebrow')?.textContent,
  badge: document.querySelector('#eventState')?.textContent,
  coverW: document.querySelector('#coverImg')?.naturalWidth,
  coverHidden: document.querySelector('#coverImg')?.hidden,
  eventId: __mh.journal.eventId,
  audioError: document.querySelector('#audio')?.error?.code || null,
  toast: document.querySelector('#toast')?.textContent
})`));
await shot("21-online-player");

await evaluate(`document.querySelector('#lyricsBtn').click()`, true);
await sleep(2600);
console.log("online lyrics:", await evaluate(`({
  open: document.querySelector('#lyricsOverlay')?.classList.contains('open'),
  title: document.querySelector('#loTitle')?.textContent,
  lines: document.querySelectorAll('.lo-line').length,
  active: document.querySelector('.lo-line.active')?.textContent,
  first: document.querySelector('.lo-line')?.textContent
})`));
await shot("22-online-lyrics");

console.log("console errors:", errors.slice(0, 8));
ws.close();
process.exit(0);
