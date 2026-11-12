import { writeFileSync } from "node:fs";
const targets = await (await fetch("http://127.0.0.1:9224/json")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; } if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
await send("Page.enable"); await send("Runtime.enable"); await send("Page.bringToFront");
await new Promise((r) => setTimeout(r, 2000));
console.log(await evalJs(`({ title: document.title, url: location.href, tracks: window.__mh?.state.tracks.length, current: window.__mh?.state.tracks[0]?.title, settings: !!document.querySelector('#settingsBtn'), body: getComputedStyle(document.body).backgroundColor })`));
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("D:/鏁版嵁/deepseek-harness/default-workspace/music-hub/_shots/52-desktop-shell.png", Buffer.from(data, "base64"));
console.log("shot 52", "errors", errors.slice(0, 5));
ws.close(); process.exit(0);

