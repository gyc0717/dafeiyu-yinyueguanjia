/** Roadmap panel: new percentages and long detail lines must still fit. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map(); const errors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression, userGesture = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
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
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("capsule:", await evaluate(`document.querySelector('#roadmapPct')?.textContent`));
await evaluate(`document.querySelector('#roadmapBtn').click()`, true);
await sleep(700);
console.log("panel:", await evaluate(`({
  open: document.querySelector('#roadmapOverlay').classList.contains('open'),
  big: document.querySelector('#roadmapBig')?.textContent,
  updated: document.querySelector('#roadmapUpdated')?.textContent,
  next: document.querySelector('#roadmapNext')?.textContent,
  rows: [...document.querySelectorAll('#roadmapList .roadmap-row, #roadmapList > *')].slice(0, 6).map((r) => r.textContent.trim().slice(0, 46)),
  overflow: (() => { const card = document.querySelector('.roadmap-card') || document.querySelector('#roadmapOverlay .modal-card'); return card ? { scrollW: card.scrollWidth, clientW: card.clientWidth } : null; })()
})`));
await shot("111-roadmap-58");

console.log("mobile check");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(500);
console.log("mobile overflow:", await evaluate(`(() => {
  const card = document.querySelector('#roadmapOverlay .modal-card');
  const doc = document.documentElement;
  return { cardScroll: card?.scrollWidth, cardClient: card?.clientWidth, docScroll: doc.scrollWidth, win: window.innerWidth };
})()`));
await shot("112-roadmap-mobile");
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
