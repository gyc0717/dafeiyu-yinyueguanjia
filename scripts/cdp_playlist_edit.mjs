/** Local playlist editing: create → save QQ copy → drag reorder → multi-select remove. */
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
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const view = () => evaluate(`({
  tab: __mh.state.tab,
  localId: __mh.state.playlistId,
  remoteId: __mh.state.remotePlaylistId,
  name: __mh.state.playlistName,
  count: __mh.state.currentList.length,
  selectMode: __mh.state.selectMode,
  selected: __mh.state.selected.size,
  label: document.querySelector('#listLabel')?.textContent,
  meta: document.querySelector('#listMeta')?.textContent,
  buttons: ['newPlaylistBtn','saveQqBtn','renamePlaylistBtn','selectBtn','cancelSelectBtn','syncPlaylistBtn','playAllBtn','backToPlaylists']
    .filter((id) => { const el = document.getElementById(id); return el && !el.hidden; }),
  batch: document.querySelector('#batchBar')?.hidden === false ? document.querySelector('#batchInfo')?.textContent : null,
  toast: document.querySelector('#toast')?.classList.contains('show') ? document.querySelector('#toast').textContent : null
})`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2500);
console.log("1 list view:", await view());
await shot("105-playlist-list");

// 2. new playlist through the dialog
await evaluate(`document.querySelector('#newPlaylistBtn').click()`, true);
await sleep(400);
console.log("2 dialog open:", await evaluate(`({ open: document.querySelector('#nameOverlay').classList.contains('open'), title: document.querySelector('#nameTitle').textContent, hint: document.querySelector('#nameHint').textContent })`));
await evaluate(`(() => {
  const input = document.querySelector('#nameInput');
  input.value = '编辑测试';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('#nameOk').click();
  return true;
})()`, true);
await sleep(1200);
console.log("2 created:", await view());

// 3. save a QQ playlist as an editable local copy
await evaluate(`document.querySelector('#backToPlaylists').click()`, true);
await sleep(2200);
await evaluate(`[...document.querySelectorAll('.pl-row.remote')].find((r) => r.textContent.includes('沙一汀')).click()`, true);
await sleep(2500);
console.log("3 remote view:", await view());
await evaluate(`document.querySelector('#saveQqBtn').click()`, true);
await sleep(2600);
console.log("3 saved:", await view());
await shot("106-playlist-saved-local");

// 4. drag first row below the third one
const before = await evaluate(`__mh.state.currentList.map((t) => t.title)`);
const dragResult = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#trackList .track')];
  const dt = new DataTransfer();
  const from = rows[0];
  const to = rows[2];
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const rect = to.getBoundingClientRect();
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: rect.top + rect.height * 0.8, clientX: rect.left + 20 }));
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: rect.top + rect.height * 0.8, clientX: rect.left + 20 }));
  return { dragging: Boolean(document.querySelector('.track.dragging')), marked: document.querySelectorAll('.drop-before, .drop-after').length };
})()`, true);
await sleep(1200);
const after = await evaluate(`__mh.state.currentList.map((t) => t.title)`);
console.log("4 drag:", dragResult);
console.log("   before:", before.slice(0, 4));
console.log("   after :", after.slice(0, 4));
console.log("   toast:", await evaluate(`document.querySelector('#toast')?.textContent`));

// 5. multi-select two tracks and remove them
await evaluate(`document.querySelector('#selectBtn').click()`, true);
await sleep(400);
await evaluate(`window.confirm = () => true`, true);
await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#trackList .track')];
  rows[4].click();
  rows[5].click();
  return true;
})()`, true);
await sleep(300);
console.log("5 selected:", await view());
await shot("107-playlist-select");
await evaluate(`document.querySelector('#removeSelectedBtn').click()`, true);
await sleep(1800);
console.log("5 removed:", await view());
console.log("   toast:", await evaluate(`document.querySelector('#toast')?.textContent`));

// 6. reload: order and removal must survive
const stateBefore = await view();
const orderBefore = await evaluate(`__mh.state.currentList.map((t) => t.title)`);
await send("Page.reload");
await sleep(6500);
await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2500);
await evaluate(`[...document.querySelectorAll('.pl-row:not(.remote)')].find((r) => r.textContent.includes('编辑测试') || r.textContent.includes('沙一汀')).click()`, true);
await sleep(2000);
const orderAfter = await evaluate(`__mh.state.currentList.map((t) => t.title)`);
console.log("6 after reload:", { count: (await view()).count, sameOrder: JSON.stringify(orderBefore) === JSON.stringify(orderAfter) });
await shot("108-playlist-after-reload");

console.log("errors:", errors.slice(0, 5));
console.log("cleanup hint:", `localId=${stateBefore.localId}`);
ws.close();
process.exit(0);
