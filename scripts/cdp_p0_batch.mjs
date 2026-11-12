/** P0 batch: unified search, queue preserved, lyrics duration fallback. */
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
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);
await evaluate(`__mh.closeStarfieldPanel?.(); true`, true);
await sleep(500);

console.log("queue before:", await evaluate(`__mh.player.queue.length`));

// 1) one input, both sources
await evaluate(`(() => {
  const input = document.querySelector('#search');
  input.value = '晴天';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`, true);
await sleep(3000);
console.log("search:", await evaluate(`({
  label: document.querySelector('#listLabel')?.textContent,
  meta: document.querySelector('#listMeta')?.textContent,
  sections: [...document.querySelectorAll('.search-section')].map((n) => n.textContent),
  rows: document.querySelectorAll('#trackList .track').length
})`));
await shot("129-unified-search");

// 2) clicking an online result must not replace the queue
const clicked = await evaluate(`(() => {
  const sections = [...document.querySelectorAll('.search-section')];
  const qq = sections.find((s) => s.textContent.includes('QQ'));
  if (!qq) return null;
  let node = qq.nextElementSibling;
  while (node && !node.classList.contains('track')) node = node.nextElementSibling;
  if (!node) return null;
  const title = node.querySelector('.t')?.textContent;
  node.click();
  return { title };
})()`, true);
await sleep(2200);
console.log("after click:", clicked, await evaluate(`({
  track: __mh.player.track?.title,
  playing: __mh.player.playing,
  queue: __mh.player.queue.length,
  queueIndex: __mh.player.index
})`));

// 3) lyrics footer duration
await evaluate(`__mh.openLyrics(); true`, true);
await sleep(1200);
console.log("lyrics time:", await evaluate(`({
  loTime: document.querySelector('#loTime')?.textContent,
  mainTime: document.querySelector('#curTime')?.textContent + ' / ' + document.querySelector('#durTime')?.textContent,
  durationMs: __mh.player.durationMs,
  trackDur: __mh.player.track?.duration_ms
})`));
await shot("130-lyrics-duration");
await evaluate(`__mh.closeLyrics(); true`, true);
await sleep(600);

// 4) empty state offers a way out
await evaluate(`(() => {
  const input = document.querySelector('#search');
  input.value = 'zzzz不存在的歌';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`, true);
await sleep(3000);
console.log("empty:", await evaluate(`({
  meta: document.querySelector('#listMeta')?.textContent,
  text: document.querySelector('#trackList .list-empty')?.textContent,
  buttons: [...document.querySelectorAll('#trackList .list-empty button')].map((b) => b.textContent)
})`));
await shot("131-search-empty");

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
