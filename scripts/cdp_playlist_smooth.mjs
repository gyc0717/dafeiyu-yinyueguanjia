import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expression, userGesture = false) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
const shot = async (name) => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64")); console.log("shot", name); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(5000);

const t0 = Date.now();
await evalJs(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(150);
console.log("tab instant:", await evalJs(`({ rows: document.querySelectorAll('.pl-row.remote').length, label: document.querySelector('#listLabel')?.textContent })`), "ms", Date.now() - t0);

await evalJs(`[...document.querySelectorAll('.pl-row.remote')].find(r=>r.textContent.includes('沙一汀')).click()`, true);
await sleep(80);
console.log("skeleton:", await evalJs(`({ sk: document.querySelectorAll('.skeleton-row').length, label: document.querySelector('#listLabel')?.textContent })`));
await shot("46-playlist-skeleton");
await sleep(1200);
console.log("loaded:", await evalJs(`({ id: __mh.state.remotePlaylistId, count: __mh.state.currentList.length, sk: document.querySelectorAll('.skeleton-row').length, label: document.querySelector('#listLabel')?.textContent })`));

await evalJs(`document.querySelector('#backToPlaylists').click()`);
await sleep(500);
const t1 = Date.now();
await evalJs(`[...document.querySelectorAll('.pl-row.remote')].find(r=>r.textContent.includes('沙一汀')).click()`, true);
await sleep(120);
console.log("cached reopen:", await evalJs(`({ count: __mh.state.currentList.length, sk: document.querySelectorAll('.skeleton-row').length })`), "ms", Date.now() - t1);

await evalJs(`document.querySelector('#backToPlaylists').click()`);
await sleep(500);
await evalJs(`[...document.querySelectorAll('.pl-row.remote')].find(r=>r.textContent.includes('我喜欢')).click()`, true);
await sleep(80);
console.log("big skeleton:", await evalJs(`document.querySelectorAll('.skeleton-row').length`));
await shot("47-playlist-big-skeleton");
await sleep(3500);
console.log("big loaded:", await evalJs(`({ count: __mh.state.currentList.length, rows: document.querySelectorAll('#trackList .track').length, meta: document.querySelector('#listMeta')?.textContent, sk: document.querySelectorAll('.skeleton-row').length })`));
await shot("48-playlist-big-loaded");
console.log("errors:", errors.slice(0, 6));
ws.close(); process.exit(0);
