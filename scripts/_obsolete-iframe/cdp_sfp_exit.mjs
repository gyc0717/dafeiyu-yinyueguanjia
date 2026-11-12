/** Prove the 返回管家 button is visible while 星海 is open, and that it closes it. */
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
const evaluate = async (expression, userGesture = false) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const probe = () => evaluate(`(() => {
  const b = document.querySelector('#sfpExitBtn');
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return {
    open: document.querySelector('#starfieldOverlay').classList.contains('open'),
    hidden: b.hidden,
    label: b.textContent.trim(),
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0,
    zIndex: cs.zIndex,
    hitTop: top ? (top.id || top.className) : null
  };
})()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1876, height: 923, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);

console.log("boot:", await probe());
await evaluate(`__mh.openStarfieldPanel()`, true);
await sleep(2500);
console.log("opened:", await probe());
await shotSafe("125-starfield-exit");

await evaluate(`document.querySelector('#sfpExitBtn').click()`, true);
await sleep(900);
console.log("after click:", await probe());
await shotSafe("126-after-exit");

console.log("errors:", errors.slice(0, 3));
ws.close();
process.exit(0);

async function shotSafe(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
