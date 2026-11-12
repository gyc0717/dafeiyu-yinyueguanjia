/** Empty search state (QQ offline) + final screenshots of the P0 batch. */
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
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);
await evaluate(`__mh.closeStarfieldPanel?.(); true`, true);
await sleep(400);

// 1) search with QQ available
await evaluate(`__mh.runSearch('潮汐')`, true);
await sleep(3000);
console.log("search 潮汐:", await evaluate(`({
  meta: document.querySelector('#listMeta')?.textContent,
  sections: [...document.querySelectorAll('.search-section')].map((n) => n.textContent),
  rows: document.querySelectorAll('#trackList .track').length
})`));
await shot("129-unified-search");

// 2) empty state with QQ unavailable
await evaluate(`(() => {
  window.__mh.state.online = { providers: [{ name: 'qq', ready: false }] };
  return true;
})()`, true);
await evaluate(`__mh.runSearch('没有这首歌')`, true);
await sleep(2500);
console.log("empty:", await evaluate(`({
  meta: document.querySelector('#listMeta')?.textContent,
  text: document.querySelector('#trackList .list-empty')?.textContent?.trim(),
  buttons: [...document.querySelectorAll('#trackList .list-empty button')].map((b) => b.textContent)
})`));
await shot("131-search-empty");

console.log("errors:", errors.slice(0, 3));
ws.close();
process.exit(0);
