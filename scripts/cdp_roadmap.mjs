/** Roadmap pill + modal visual check. */
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

console.log("pill:", await evaluate(`({
  pct: document.querySelector('#roadmapPct')?.textContent,
  title: document.querySelector('#roadmapBtn')?.title,
  segments: [...document.querySelectorAll('#roadmapMini i')].map(i => i.style.getPropertyValue('--p'))
})`));
await shot("24-roadmap-pill");

await evaluate(`document.querySelector('#roadmapBtn').click()`, true);
await sleep(1400);
console.log("modal:", await evaluate(`({
  open: document.querySelector('#roadmapOverlay')?.classList.contains('open'),
  big: document.querySelector('#roadmapBig')?.textContent,
  rows: [...document.querySelectorAll('.rm-item')].map(r => ({
    name: r.querySelector('.rm-name')?.textContent,
    pct: r.querySelector('.rm-pct')?.textContent,
    state: r.className,
    bar: r.querySelector('.rm-bar i')?.style.width
  })),
  updated: document.querySelector('#roadmapUpdated')?.textContent,
  next: document.querySelector('#roadmapNext')?.textContent,
  fill: document.querySelector('#roadmapFill')?.style.width
})`));
await shot("23-roadmap");

for (const type of ["keyDown", "keyUp"]) {
  await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}
await sleep(500);
console.log("closed:", await evaluate(`({
  open: document.querySelector('#roadmapOverlay')?.classList.contains('open'),
  aria: document.querySelector('#roadmapOverlay')?.getAttribute('aria-hidden')
})`));

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(700);
await evaluate(`document.querySelector('#roadmapBtn').click()`, true);
await sleep(1100);
await shot("25-roadmap-mobile");
await evaluate(`document.querySelector('#closeRoadmap').click()`, true);

console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
