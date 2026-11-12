/** Screenshots for "where do I delete a song": remote read-only → save as local → select. */
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
async function evaluate(expression, userGesture = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name, clip) {
  const { data } = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const buttons = () => evaluate(`['newPlaylistBtn','saveQqBtn','renamePlaylistBtn','selectBtn','cancelSelectBtn','syncPlaylistBtn','playAllBtn','backToPlaylists']
  .filter((id) => { const el = document.getElementById(id); return el && !el.hidden; })
  .map((id) => id + ':' + document.getElementById(id).textContent.trim())`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2200);
await evaluate(`[...document.querySelectorAll('.pl-row.remote')].find((r) => r.textContent.includes('沙一汀')).click()`, true);
await sleep(2500);
console.log("remote view buttons:", await buttons());
await shot("109-readonly-remote", { x: 0, y: 0, width: 430, height: 520, scale: 2 });

await evaluate(`document.querySelector('#saveQqBtn').click()`, true);
await sleep(2600);
console.log("local view buttons:", await buttons());
await evaluate(`document.querySelector('#selectBtn').click()`, true);
await sleep(500);
await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#trackList .track')];
  rows[0].click();
  rows[1].click();
  return true;
})()`, true);
await sleep(400);
console.log("select mode:", await evaluate(`({
  batch: document.querySelector('#batchBar')?.hidden === false ? document.querySelector('#batchInfo')?.textContent : null,
  selected: __mh.state.selected.size
})`));
await shot("110-local-select", { x: 0, y: 0, width: 430, height: 640, scale: 2 });

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
