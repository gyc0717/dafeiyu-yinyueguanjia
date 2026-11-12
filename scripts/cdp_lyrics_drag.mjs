/** 整屏歌词：拖动到某一句，松手后应从那一句开始播放（真 Electron 窗口）。 */
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const PORT = process.env.MUSIC_HUB_DEBUG_PORT || 9333;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const state = () => evaluate(`({
  lyrics: document.querySelector('#lyricsOverlay').classList.contains('open'),
  playing: window.__mh.player.playing,
  timeMs: Math.round(window.__mh.player.currentTimeMs),
  track: window.__mh.player.track?.title || null,
  active: document.querySelector('.lo-line.on')?.textContent?.trim() || null,
  lines: document.querySelectorAll('.lo-line').length
})`);

await send("Runtime.enable");
await send("Input.setIgnoreInputEvents", { ignore: false });
await sleep(1000);

// 停在潮汐信，暂停后进歌词页
await evaluate(`(() => {
  const q = window.__mh.player.queue;
  const i = q.findIndex(x => x.title === '潮汐信');
  if (i >= 0) window.__mh.player.playIndex(i);
  return true;
})()`);
await sleep(1500);
await evaluate(`window.__mh.player.pause(); window.__mh.openLyrics(); true`);
await sleep(1200);
console.log("1 进歌词（暂停）:", await state());

const box = await evaluate(`(() => { const r = document.querySelector('#loStage').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);

// 向上拖 180px（看更后面的句子），松手
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", buttons: 1, clickCount: 1 });
for (const dy of [40, 80, 120, 160, 180]) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y - dy, button: "left", buttons: 1 });
  await sleep(60);
}
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y - 180, button: "left", buttons: 0, clickCount: 1 });
await sleep(1600);
console.log("2 拖动松手后:", await state());

await evaluate(`window.__mh.player.pause(); true`);
await sleep(400);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}141-lyrics-drag-play.png`, Buffer.from(shot.data, "base64"));
console.log("shot 141-lyrics-drag-play");
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
