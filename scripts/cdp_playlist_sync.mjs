/** QQ playlist snapshot: stale hint + 「同步」force refresh (button, note, toast, scroll). */
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const snapshot = () => evaluate(`({
  remoteId: __mh.state.remotePlaylistId,
  count: __mh.state.currentList.length,
  meta: document.querySelector('#listMeta')?.textContent,
  note: document.querySelector('#syncNote')?.textContent,
  noteHidden: document.querySelector('#syncNote')?.hidden,
  noteStale: document.querySelector('#syncNote')?.classList.contains('stale'),
  syncHidden: document.querySelector('#syncPlaylistBtn')?.hidden,
  syncLabel: document.querySelector('#syncPlaylistBtn')?.textContent,
  syncDisabled: document.querySelector('#syncPlaylistBtn')?.disabled,
  toast: document.querySelector('#toast')?.textContent,
  toastShown: document.querySelector('#toast')?.classList.contains('show')
})`);

const target = process.env.MH_PLAYLIST || "沙一汀";
const SHOT_STALE = process.env.MH_SHOT_STALE || "98-playlist-sync-stale";
const SHOT_DONE = process.env.MH_SHOT_DONE || "99-playlist-sync-done";

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6000);

console.log("boot:", await evaluate(`({ tab: __mh.state.tab, qq: __mh.state.online?.providers?.qq?.ready, remote: __mh.state.remotePlaylists.length })`));

await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2500);
await evaluate(
  `[...document.querySelectorAll('.pl-row.remote')].find(r => r.textContent.includes(${JSON.stringify(target)})).click()`,
  true
);
await sleep(3000);
console.log("opened:", await snapshot());
await shot(SHOT_STALE);

const scrollBefore = await evaluate(`(() => {
  const list = document.querySelector('#trackList');
  list.scrollTop = 900;
  return { top: list.scrollTop, rows: list.querySelectorAll('.track').length };
})()`);
console.log("scrolled before sync:", scrollBefore);

const t0 = Date.now();
await evaluate(`document.querySelector('#syncPlaylistBtn').click()`, true);
await sleep(250);
console.log("syncing:", await snapshot());
let done = null;
for (let i = 0; i < 120; i += 1) {
  const now = await evaluate(`({ busy: document.querySelector('#syncPlaylistBtn')?.disabled })`);
  if (!now.busy) { done = { elapsed: Date.now() - t0 }; break; }
  await sleep(120);
}
console.log("after sync:", { ...(await snapshot()), elapsedMs: done?.elapsed });
console.log("scrolled after sync:", await evaluate(`(() => {
  const list = document.querySelector('#trackList');
  return { top: list.scrollTop, rows: list.querySelectorAll('.track').length };
})()`));
await shot(SHOT_DONE);

await evaluate(`document.querySelector('#backToPlaylists').click()`, true);
await sleep(1500);
console.log("back:", await evaluate(`({
  remoteId: __mh.state.remotePlaylistId,
  syncHidden: document.querySelector('#syncPlaylistBtn')?.hidden,
  noteHidden: document.querySelector('#syncNote')?.hidden,
  label: document.querySelector('#listLabel')?.textContent
})`));
console.log("errors:", errors.slice(0, 6));
ws.close();
process.exit(0);
