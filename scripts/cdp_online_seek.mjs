/** Verify seeking inside an online (proxied) track. */
import { setTimeout as sleep } from "node:timers/promises";

const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(3000);
await evaluate(`document.querySelector('.tab[data-tab="online"]').click()`, true);
await sleep(300);
await evaluate(`(() => { const s=document.querySelector('#search'); s.value='晴天'; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await sleep(3200);
await evaluate(`document.querySelector('.track').click()`, true);
await sleep(4000);
console.log("before seek:", await evaluate(`({ t: Math.round(__mh.player.currentTimeMs), d: Math.round(__mh.player.durationMs), playing: __mh.player.playing })`));
await evaluate(`__mh.player.seek(120000)`);
await sleep(2500);
console.log("after seek:", await evaluate(`({
  t: Math.round(__mh.player.currentTimeMs),
  playing: __mh.player.playing,
  badge: document.querySelector('#eventState')?.textContent,
  err: document.querySelector('#audio')?.error?.code || null,
  toast: document.querySelector('#toast')?.textContent
})`));
ws.close();
process.exit(0);
