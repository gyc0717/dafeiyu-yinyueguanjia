/** Verify the playlist tab, QQ playlist import modal and playback from a playlist. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const version = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 0;
const pending = new Map();
const errors = [];
let sessionId = null;
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.sessionId !== sessionId) return;
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
};
const send = (method, params = {}, sid = null) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });
const { targetId } = await send("Target.createTarget", { url: "http://127.0.0.1:8787/" });
const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true });
sessionId = sid;
const call = (m, p = {}) => send(m, p, sessionId);
async function evaluate(expression, userGesture = false) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function waitFor(expression, timeout = 10000, interval = 200) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(interval);
  }
  return false;
}
async function shot(name) {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await call("Page.enable");
await call("Runtime.enable");
await call("Network.enable");
await call("Network.clearBrowserCache");
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(700);
await call("Page.reload", { ignoreCache: true });
await sleep(3500);

// open the playlist tab
await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(800);
console.log(
  "playlist tab:",
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.pl-row')].map((r) => ({
      name: r.querySelector('.pl-name')?.textContent,
      meta: r.querySelector('.pl-meta')?.textContent,
    }));
    return {
      label: document.querySelector('#listLabel').textContent,
      meta: document.querySelector('#listMeta').textContent,
      rows,
      importVisible: !document.querySelector('#importQQBtn').hidden,
      backVisible: !document.querySelector('#backToPlaylists').hidden,
    };
  })()`)
);
await shot("41-playlists");

// open a playlist and play all
await evaluate(`document.querySelector('.pl-row')?.click()`, true);
await sleep(700);
console.log(
  "playlist detail:",
  await evaluate(`({
    label: document.querySelector('#listLabel').textContent,
    meta: document.querySelector('#listMeta').textContent,
    trackRows: document.querySelectorAll('#trackList .track').length,
    first: document.querySelector('#trackList .track .t')?.textContent,
    playAll: !document.querySelector('#playAllBtn').hidden,
    back: !document.querySelector('#backToPlaylists').hidden,
  })`)
);
await shot("42-playlist-tracks");
await evaluate(`document.querySelector('#playAllBtn').click()`, true);
await sleep(1200);
console.log(
  "play all:",
  await evaluate(`({
    queue: window.__mh.player.queue.length,
    playing: window.__mh.player.playing,
    title: document.querySelector('#nowTitle').textContent,
  })`)
);

// back to the playlist list
await evaluate(`document.querySelector('#backToPlaylists').click()`, true);
await sleep(600);
console.log(
  "back:",
  await evaluate(`({
    label: document.querySelector('#listLabel').textContent,
    rows: document.querySelectorAll('.pl-row').length,
    backHidden: document.querySelector('#backToPlaylists').hidden,
  })`)
);

// QQ import modal
await evaluate(`document.querySelector('#importQQBtn').click()`, true);
await waitFor(`document.querySelectorAll('#qqPlaylistList .qq-row').length > 0`, 15000);
await sleep(400);
console.log(
  "import modal:",
  await evaluate(`({
    open: document.querySelector('#qqImportOverlay').classList.contains('open'),
    rows: document.querySelectorAll('#qqPlaylistList .qq-row').length,
    liked: [...document.querySelectorAll('#qqPlaylistList .qq-row')].some((r) => r.querySelector('.pl-badge')),
    first: document.querySelector('#qqPlaylistList .qq-row .name')?.textContent,
  })`)
);
await shot("43-qq-import");

// pick the 9-song playlist and inspect the preview
await evaluate(`document.querySelector('#qqPlaylistList .qq-row[data-directory-id="18"]')?.click()`, true);
await waitFor(`document.querySelectorAll('#qqPlaylistPreview .pv-song').length > 0`, 15000);
await sleep(300);
console.log(
  "preview:",
  await evaluate(`({
    title: document.querySelector('#qqPlaylistPreview h3')?.textContent,
    songs: document.querySelectorAll('#qqPlaylistPreview .pv-song').length,
    first: document.querySelector('#qqPlaylistPreview .pv-song .t')?.textContent,
    importButton: document.querySelector('#qqPlaylistPreview .solid')?.textContent,
  })`)
);
await shot("44-qq-preview");

// import through the UI
await evaluate(`document.querySelector('#qqPlaylistPreview .solid').click()`, true);
const imported = await waitFor(
  `!document.querySelector('#qqImportOverlay').classList.contains('open')`,
  60000
);
await sleep(900);
console.log(
  "import result:",
  await evaluate(`(() => ({
    modalClosed: !document.querySelector('#qqImportOverlay').classList.contains('open'),
    label: document.querySelector('#listLabel').textContent,
    tracks: document.querySelectorAll('#trackList .track').length,
    toast: document.querySelector('#toast').textContent,
  }))()`)
);
console.log("import finished:", imported);
await shot("45-playlist-imported");

console.log("errors:", errors.slice(0, 6));
await send("Target.closeTarget", { targetId });
ws.close();
process.exit(0);
