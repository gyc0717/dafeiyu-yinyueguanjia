/** Esc steps back: select mode → playlist list. */
import { setTimeout as sleep } from "node:timers/promises";

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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const where = () => evaluate(`({
  label: document.querySelector('#listLabel')?.textContent,
  localId: __mh.state.playlistId,
  remoteId: __mh.state.remotePlaylistId,
  selectMode: __mh.state.selectMode
})`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2000);
await evaluate(`[...document.querySelectorAll('.pl-row.remote')].find((r) => r.textContent.includes('沙一汀')).click()`, true);
await sleep(2200);
console.log("opened:", await where());

// save as local so 选择 exists, then enter select mode and press Esc twice
await evaluate(`document.querySelector('#saveQqBtn').click()`, true);
await sleep(2600);
console.log("saved:", await where());
await evaluate(`document.querySelector('#selectBtn').click()`, true);
await sleep(300);
console.log("select mode:", await where());

await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`, true);
await sleep(400);
console.log("after Esc #1:", await where());

await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`, true);
await sleep(600);
console.log("after Esc #2:", await where());
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
