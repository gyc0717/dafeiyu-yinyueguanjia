/** Real window: 管家 must land on the player and come back to it. */
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const OUT = "D:/数据/deepseek-harness/default-workspace/music-hub/_shots/";
const targets = await (await fetch("http://127.0.0.1:9224/json")).json();
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
const state = () => evaluate(`({
  starfield: document.querySelector('#starfieldView').classList.contains('open'),
  butler: document.querySelector('#butlerDrawer').classList.contains('open'),
  bodyClass: document.body.className,
  onScreen: (() => { const el = document.elementFromPoint(innerWidth * 0.45, innerHeight * 0.5); return el ? (el.id || el.className || el.tagName) : null; })()
})`);

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`__mh.closeStarfieldPanel(); __mh.closeButler(); true`, true);
await sleep(400);
await evaluate(`__mh.openStarfieldPanel(); true`, true);
await sleep(1500);
console.log("1 starfield:", await state());

await evaluate(`document.querySelector('#butlerBtn').click()`, true);
await sleep(900);
console.log("2 after 管家 click:", await state());

await evaluate(`document.querySelector('#closeButler').click()`, true);
await sleep(700);
console.log("3 after close ✕:", await state());

const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}133-butler-returns.png`, Buffer.from(data, "base64"));
console.log("shot 133; errors:", errors.slice(0, 3));
ws.close();
process.exit(0);
