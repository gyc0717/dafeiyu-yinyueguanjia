/** 桌面壳拖动条：只有整屏歌词盖住顶栏时才出现；星海在顶栏下面，不占用它。 */
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
  const bar = document.querySelector('#winDragBar');
  const cs = getComputedStyle(bar);
  const r = bar.getBoundingClientRect();
  return {
    desktop: document.body.classList.contains('mh-desktop'),
    lyrics: Boolean(document.querySelector('#lyricsOverlay').classList.contains('open')),
    starfield: document.querySelector('#starfieldView').classList.contains('open'),
    dragBar: { hidden: bar.hidden, region: cs.webkitAppRegion, z: cs.zIndex,
               rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  };
})()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1876, height: 923, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);

// 无头浏览器不是 Electron 壳，手动补上桌面类
await evaluate(`document.body.classList.add('mh-desktop'); true`);
console.log("boot:", await probe());

await evaluate(`__mh.openStarfieldPanel(); true`, true);
await sleep(1200);
console.log("starfield open (不需要拖动条):", await probe());

await evaluate(`__mh.closeStarfieldPanel(); __mh.openLyrics(); true`, true);
await sleep(1200);
console.log("lyrics open (要拖动条):", await probe());
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(OUT, "127-dragbar.png"), Buffer.from(data, "base64"));
console.log("shot 127");

await evaluate(`__mh.closeLyrics(); true`, true);
await sleep(600);
console.log("lyrics closed:", await probe());

console.log("errors:", errors.slice(0, 3));
ws.close();
process.exit(0);
