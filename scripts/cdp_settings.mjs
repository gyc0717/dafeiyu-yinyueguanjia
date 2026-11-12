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
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(4500);
await evalJs(`document.querySelector('#settingsBtn').click()`, true);
await sleep(900);
console.log("settings:", await evalJs(`({
  open: document.querySelector('#settingsOverlay').classList.contains('on') || document.querySelector('#settingsOverlay').classList.contains('open'),
  roots: [...document.querySelectorAll('#settingsRoots .settings-root')].map(x=>x.textContent),
  backups: document.querySelectorAll('#backupList .backup-row').length,
  dir: document.querySelector('#settingsBackupDir')?.textContent,
  about: document.querySelector('#settingsAbout')?.textContent,
  glass: document.querySelector('#settingsGlass')?.textContent
})`));
await shot("50-settings");

const before = await evalJs(`document.querySelectorAll('#backupList .backup-row').length`);
await evalJs(`document.querySelector('#backupNow').click()`, true);
await sleep(1200);
console.log("backup now:", { before, after: await evalJs(`document.querySelectorAll('#backupList .backup-row').length`), toast: await evalJs(`document.querySelector('#toast')?.textContent`) });
await shot("51-settings-backup");

await evalJs(`document.querySelector('#settingsGlass').click()`, true);
await sleep(300);
console.log("glass:", await evalJs(`({ label: document.querySelector('#settingsGlass')?.textContent, glass: document.documentElement.dataset.glass })`));
await evalJs(`document.querySelector('#settingsGlass').click()`, true);
await evalJs(`document.querySelector('#closeSettings').click()`);
await sleep(300);
console.log("closed:", await evalJs(`!document.querySelector('#settingsOverlay').classList.contains('open')`));
console.log("errors:", errors.slice(0, 6));
ws.close(); process.exit(0);
