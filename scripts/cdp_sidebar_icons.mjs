/** 侧栏收起/召回两个图标的样子（裁两张小图）。 */
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const PORT = process.env.MUSIC_HUB_DEBUG_PORT || 9333;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId; pending.set(id, { resolve });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  return r.result?.value;
};
const clipShot = async (rect, name, pad = 16) => {
  const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.w + pad * 2, height: rect.h + pad * 2, scale: 3 };
  const { data } = await send("Page.captureScreenshot", { format: "png", clip });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(data, "base64"));
  console.log("shot", name, clip);
};
const rectOf = (sel) => evaluate(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);

await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.reload", { ignoreCache: true });
await sleep(5000);

await clipShot(await rectOf("#sidebarHideBtn"), "144-sidebar-hide-icon", 22);
await evaluate(`document.querySelector('#sidebarHideBtn').click()`);
await sleep(700);
await clipShot(await rectOf("#sidebarShowBtn"), "145-sidebar-show-icon", 20);
await evaluate(`document.querySelector('#sidebarShowBtn').click()`);
await sleep(500);
console.log("done");
ws.close();
process.exit(0);
