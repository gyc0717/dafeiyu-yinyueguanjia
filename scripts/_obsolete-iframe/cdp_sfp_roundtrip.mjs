/** Round trip: 星海 → 返回管家 → 星海 again, and what the button says. */
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
const snap = () => evaluate(`(() => {
  const overlay = document.querySelector('#starfieldOverlay');
  const open = overlay.classList.contains('open');
  const btn = document.querySelector('#starfieldBtn');
  const pill = document.querySelector('#sfpExitBtn');
  const frame = document.querySelector('#starfieldFrame');
  let home = null;
  try { home = frame.contentDocument?.querySelector('#view-home')?.classList.contains('on') ?? null; } catch (e) { home = 'blocked'; }
  return {
    open, btnLabel: btn?.textContent.trim(), pillVisible: pill ? !pill.hidden : null,
    frameSrc: frame.getAttribute('src'), homeView: home,
    hit: (() => { const el = document.elementFromPoint(1200, 500); return el ? (el.id || el.className || el.tagName) : null; })()
  };
})()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1876, height: 923, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);

console.log("1 boot (auto-open):", await snap());

await evaluate(`document.querySelector('#sfpExitBtn').click()`, true);
await sleep(900);
console.log("2 after 返回管家:", await snap());

await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(2600);
console.log("3 after clicking 星海 again:", await snap());

await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(900);
console.log("4 after clicking 返回管家 (topbar):", await snap());

const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(OUT, "128-sfp-roundtrip.png"), Buffer.from(data, "base64"));
console.log("shot 128; errors:", errors.slice(0, 3));
ws.close();
process.exit(0);
