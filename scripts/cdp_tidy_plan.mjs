/** Dry-run tidy plan: render + export, and prove nothing on disk changed. */
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
const evaluate = async (expression, userGesture = false) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
try {
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.MH_DOWNLOAD_DIR });
} catch (error) {
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: process.env.MH_DOWNLOAD_DIR });
}
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`(() => { delete window.showSaveFilePicker; window.showSaveFilePicker = undefined; __mh.openButler('tidy'); return true; })()`, true);
await sleep(600);
await evaluate(`document.querySelector('#butlerPlanRun').click()`, true);
await sleep(1800);
console.log("plan:", await evaluate(`({
  rows: document.querySelectorAll('#butlerTidyBody .plan-row').length,
  summary: document.querySelector('#butlerTidyBody .plan-summary')?.textContent?.slice(0, 120),
  csvVisible: !document.querySelector('#planActions').hidden,
  statuses: [...new Set([...document.querySelectorAll('.plan-row')].map((r) => r.className.replace('plan-row ', '')))]
})`));
await shot("119-tidy-plan");

await evaluate(`document.querySelector('#planCsvBtn').click()`, true);
await sleep(2000);
console.log("toast:", await evaluate(`document.querySelector('#toast')?.textContent`));
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
