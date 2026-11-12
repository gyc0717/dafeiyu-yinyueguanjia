/** Inspect the real Electron window: does a reload break the sidebar? */
import { setTimeout as sleep } from "node:timers/promises";

const port = process.env.MH_CDP_PORT || "9224";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map(); const errors = []; const consoleMsgs = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleMsgs.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleMsgs.push(`${msg.params.entry.source}: ${msg.params.entry.text}`);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, userGesture = false) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const snapshot = () => evaluate(`({
  ready: document.readyState,
  tab: window.__mh?.state?.tab,
  tracks: window.__mh?.state?.tracks?.length,
  remote: window.__mh?.state?.remotePlaylists?.length,
  local: window.__mh?.state?.playlists?.length,
  playlistCount: document.querySelector('#playlistCount')?.textContent,
  roadmap: document.querySelector('#roadmapPct')?.textContent,
  starfield: document.querySelector('#starfieldView')?.className,
  bodyClass: document.body.className,
  rows: document.querySelectorAll('#trackList .track').length,
  listLabel: document.querySelector('#listLabel')?.textContent,
  hasMh: Boolean(window.__mh)
})`);

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

console.log("== current page ==");
console.log(await snapshot());
console.log("errors so far:", errors.slice(0, 4));
console.log("console errors so far:", consoleMsgs.slice(0, 4));

console.log("\n== reload (like Ctrl+R) ==");
errors.length = 0; consoleMsgs.length = 0;
await send("Page.reload");
await sleep(7000);
console.log(await snapshot());
console.log("errors after reload:", errors.slice(0, 5));
console.log("console errors after reload:", consoleMsgs.slice(0, 5));

console.log("\n== click 歌单 tab ==");
await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2500);
console.log(await snapshot());
console.log("rows in playlist list:", await evaluate(`document.querySelectorAll('#trackList .pl-row').length`));

ws.close();
process.exit(0);
