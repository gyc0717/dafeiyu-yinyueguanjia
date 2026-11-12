/** QQ playlists auto-appear; open a remote playlist and play a track. */
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
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(5500);

console.log("boot:", await evaluate(`({
  view: __mh.state.tab,
  qq: __mh.state.online?.providers?.qq?.ready,
  remote: __mh.state.remotePlaylists.length,
  local: __mh.state.playlists.length,
  count: document.querySelector('#playlistCount')?.textContent
})`));

await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2200);
console.log("playlist tab:", await evaluate(`({
  tab: __mh.state.tab,
  remote: __mh.state.remotePlaylists.length,
  local: __mh.state.playlists.length,
  sections: [...document.querySelectorAll('.pl-section')].map(x=>x.textContent.trim()),
  remoteRows: document.querySelectorAll('.pl-row.remote').length,
  localRows: document.querySelectorAll('.pl-row:not(.remote)').length,
  hasImport: !!document.querySelector('#importQQBtn'),
  label: document.querySelector('#listLabel')?.textContent
})`));
await shot("43-qq-playlists-auto");

const first = await evaluate(`(() => {
  const row = document.querySelector('.pl-row.remote');
  return row ? row.textContent.trim() : null;
})()`);
console.log("first row:", first);
await evaluate(`[...document.querySelectorAll('.pl-row.remote')].find(r => r.textContent.includes('沙一汀')).click()`, true);
await sleep(2600);
console.log("opened:", await evaluate(`({
  remoteId: __mh.state.remotePlaylistId,
  name: __mh.state.playlistName,
  count: __mh.state.currentList.length,
  label: document.querySelector('#listLabel')?.textContent,
  meta: document.querySelector('#listMeta')?.textContent,
  first: __mh.state.currentList[0]?.title,
  back: !document.querySelector('#backToPlaylists')?.hidden
})`));
await shot("44-qq-playlist-tracks");

await evaluate(`document.querySelector('#trackList .track')?.click()`, true);
await sleep(2000);
console.log("playing:", await evaluate(`({
  track: __mh.player.track?.title,
  provider: __mh.player.track?.provider,
  playing: __mh.player.playing,
  time: document.querySelector('#curTime')?.textContent,
  bar: document.querySelector('#barPlatform')?.textContent || null
})`));
await shot("45-qq-playlist-playing");

await evaluate(`document.querySelector('#backToPlaylists').click()`);
await sleep(1200);
console.log("back:", await evaluate(`({ remoteId: __mh.state.remotePlaylistId, rows: document.querySelectorAll('.pl-row').length, label: document.querySelector('#listLabel')?.textContent })`));
console.log("errors:", errors.slice(0, 6));
ws.close();
process.exit(0);
