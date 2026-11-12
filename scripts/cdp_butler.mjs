/** Butler drawer: 搜歌 / 整理 / 周报. */
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const drawer = () => evaluate(`({
  open: document.querySelector('#butlerDrawer').classList.contains('open'),
  panel: __mh.state.butlerPanel,
  tiles: [...document.querySelectorAll('.butler-tile strong')].map((n) => n.textContent),
  searchRows: document.querySelectorAll('#butlerSearchResults .butler-row').length,
  tidyRows: document.querySelectorAll('#butlerTidyBody .butler-row').length,
  numbers: [...document.querySelectorAll('#reportNumbers b')].map((n) => n.textContent),
  bars: document.querySelectorAll('#reportBars .report-bar').length,
  topRows: [...document.querySelectorAll('#reportTop .row')].map((n) => n.textContent.trim())
})`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`document.querySelector('#butlerBtn').click()`, true);
await sleep(600);
console.log("1 home:", await drawer());
await shot("113-butler-home");

await evaluate(`document.querySelector('.butler-tile[data-panel="search"]').click()`, true);
await sleep(400);
await evaluate(`(() => {
  const input = document.querySelector('#butlerSearchInput');
  input.value = '晴天';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
})()`, true);
await sleep(2600);
console.log("2 search:", await drawer());
await shot("114-butler-search");

await evaluate(`document.querySelector('#butlerSearchResults .butler-row')?.click()`, true);
await sleep(1500);
console.log("2 play:", await evaluate(`({ track: __mh.player.track?.title, playing: __mh.player.playing, drawer: document.querySelector('#butlerDrawer').classList.contains('open'), toast: document.querySelector('#toast')?.textContent })`));

await evaluate(`document.querySelector('#butlerBtn').click()`, true);
await sleep(400);
await evaluate(`document.querySelector('.butler-tile[data-panel="tidy"]').click()`, true);
await sleep(400);
await evaluate(`document.querySelector('#butlerTidyRun').click()`, true);
await sleep(1800);
console.log("3 tidy:", await drawer());
await shot("115-butler-tidy");

await evaluate(`document.querySelector('#butlerBack').click()`, true);
await sleep(300);
await evaluate(`document.querySelector('.butler-tile[data-panel="report"]').click()`, true);
await sleep(1800);
console.log("4 report:", await drawer());
await shot("116-butler-report");

await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`, true);
await sleep(500);
console.log("5 esc:", await drawer());

console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
