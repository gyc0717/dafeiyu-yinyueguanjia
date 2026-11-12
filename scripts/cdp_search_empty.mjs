/** Why did the nonsense query not render an empty state? */
import { setTimeout as sleep } from "node:timers/promises";

const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
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

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);

const t0 = Date.now();
await evaluate(`(() => {
  const input = document.querySelector('#search');
  input.value = 'zzzz不存在的歌';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`, true);

for (const wait of [1500, 3000, 5000, 8000]) {
  await sleep(wait === 1500 ? 1500 : 1500);
  console.log(`${Date.now() - t0}ms:`, await evaluate(`({
    tab: __mh.state.tab,
    q: __mh.state.searchQuery,
    local: (__mh.state.searchLocal || []).length,
    online: (__mh.state.searchOnline || []).length,
    meta: document.querySelector('#listMeta')?.textContent,
    empty: document.querySelector('#trackList .list-empty')?.textContent || null,
    buttons: [...document.querySelectorAll('#trackList .list-empty button')].map((b) => b.textContent)
  })`));
}
await evaluate(`__mh.closeLyrics?.(); true`);
ws.close();
process.exit(0);
