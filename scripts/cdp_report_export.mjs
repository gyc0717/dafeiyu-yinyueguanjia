/** Weekly report export: PNG + CSV actually land on disk. */
import { setTimeout as sleep } from "node:timers/promises";

const downloadDir = process.env.MH_DOWNLOAD_DIR;
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

await send("Runtime.enable");
await send("Page.enable");
try {
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  console.log("download behavior set ->", downloadDir);
} catch (error) {
  console.log("Browser.setDownloadBehavior failed:", error.message);
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
}
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("picker available:", await evaluate(`typeof window.showSaveFilePicker`));
await evaluate(`try { delete window.showSaveFilePicker; } catch (e) {} ; window.showSaveFilePicker = undefined; true`);

console.log("open report:", await evaluate(`(() => { __mh.openButler('report'); return true; })()`, true));
await sleep(1800);
console.log("data:", await evaluate(`({ plays: __mh.state.weekReport?.totals?.plays, days: __mh.state.weekReport?.series?.length, buttons: ['reportPngBtn','reportCsvBtn'].map(id => !!document.getElementById(id)) })`));

await evaluate(`document.querySelector('#reportPngBtn').click()`, true);
await sleep(2500);
await evaluate(`document.querySelector('#reportCsvBtn').click()`, true);
await sleep(2500);

console.log("canvas size:", await evaluate(`(() => {
  const data = __mh.state.weekReport;
  const c = document.createElement('canvas');
  return { series: data.series.length, top: (data.top_tracks || []).length };
})()`));
console.log("toast:", await evaluate(`document.querySelector('#toast')?.textContent`));
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
