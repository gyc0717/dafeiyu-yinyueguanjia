/** Prototype core actions: home -> search -> library -> organize -> report. */
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
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/assets/prototype/starfield.html" });
await sleep(5000);
await evaluate(`document.querySelector('[data-go="search"]').click()`);
await sleep(400);
console.log("search view:", await evaluate(`({ view: __proto.view, input: !!document.querySelector('#searchInput') })`));
await evaluate(`(() => { const i = document.querySelector('#searchInput'); i.value = '晴天'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(300);
console.log("search results:", await evaluate(`document.querySelectorAll('#searchResults .res').length`));
await evaluate(`document.querySelector('.nav[data-view="library"]').click()`);
await sleep(500);
console.log("library:", await evaluate(`({ rows: document.querySelectorAll('#libTable .tr').length, sub: document.querySelector('#libSub')?.textContent })`));
await evaluate(`document.querySelector('#organizeBtn').click()`);
await sleep(400);
console.log("organize:", await evaluate(`({ open: document.querySelector('#organizeMask').classList.contains('on'), title: document.querySelector('#orgTitle')?.textContent })`));
await shot("40-starfield-organize");
await evaluate(`document.querySelector('#orgFoot .btn.pri').click()`);
await sleep(250);
await evaluate(`document.querySelector('#orgFoot .btn.pri').click()`);
await sleep(250);
console.log("organize step:", await evaluate(`({ step: __proto.orgStep, title: document.querySelector('#orgTitle')?.textContent })`));
await evaluate(`document.querySelector('#orgFoot .btn.pri').click()`);
await sleep(250);
await shot("41-starfield-organize-done");
await evaluate(`document.querySelector('#orgFoot .btn').click()`);
await evaluate(`document.querySelector('.nav[data-view="report"]').click()`);
await sleep(600);
console.log("report:", await evaluate(`({ view: __proto.view, stats: document.querySelectorAll('#reportStats .stat').length, bars: document.querySelectorAll('#reportBars .day').length })`));
await shot("42-starfield-report");
console.log("errors:", errors.slice(0, 6));
ws.close();
process.exit(0);
