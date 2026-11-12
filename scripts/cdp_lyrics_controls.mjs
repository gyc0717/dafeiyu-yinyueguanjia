/** 整屏歌词的控制条验收（真 Electron 窗口）：
 *  - 上一首 / 播放暂停 / 下一首 在进度条这一行，不在右上角窗口按钮下面；
 *  - 点下一首真的换歌，点播放真的切换状态；
 *  - 歌词头的补偿按钮与窗口按钮（− □ ✕）不重叠。
 */
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

const probe = () => evaluate(`(() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const hit = (r) => r ? !(r.w === 0 || r.h === 0) : false;
  const win = rect('#winControls');
  const actions = rect('.lo-actions');
  const overlap = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  return {
    lyrics: document.querySelector('#lyricsOverlay').classList.contains('open'),
    loPlay: rect('#loPlay'), loPrev: rect('#loPrev'), loNext: rect('#loNext'),
    actions, winControls: win,
    overlapsWindowControls: overlap(actions, win),
    icon: document.querySelector('#loPlayIcon')?.getAttribute('href'),
    time: document.querySelector('#loTime').textContent,
    track: window.__mh.player.track?.title || null,
    playing: window.__mh.player.playing
  };
})()`);

await send("Runtime.enable");
await sleep(1200);
await evaluate(`window.__mh.openLyrics(); true`);
await sleep(900);
console.log("1 打开歌词:", await probe());

await evaluate(`document.querySelector('#loNext').click()`);
await sleep(1200);
console.log("2 点下一首:", await probe());

await evaluate(`document.querySelector('#loPlay').click()`);
await sleep(900);
console.log("3 点播放/暂停:", await probe());

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}139-lyrics-controls.png`, Buffer.from(shot.data, "base64"));
console.log("shot 139-lyrics-controls");

console.log("errors:", errors.slice(0, 4));

// 手机宽度：控制条不许把时间挤出去
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(600);
console.log("4 手机宽度:", await evaluate(`(() => {
  const t = document.querySelector('#loTime').getBoundingClientRect();
  const f = document.querySelector('.lo-foot').getBoundingClientRect();
  return {
    timeRight: Math.round(t.right), footRight: Math.round(f.right),
    fits: t.right <= f.right + 1,
    overflowX: document.documentElement.scrollWidth - window.innerWidth
  };
})()`));
const mob = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}140-lyrics-controls-mobile.png`, Buffer.from(mob.data, "base64"));
console.log("shot 140-lyrics-controls-mobile");
await send("Emulation.clearDeviceMetricsOverride");

ws.close();
process.exit(0);
