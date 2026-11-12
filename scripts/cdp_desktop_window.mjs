/** 桌面壳窗口行为验收（连真实的 Electron 窗口，不是 headless 浏览器）：
 *  1) 启动是窗口化，不是全屏；
 *  2) 「全屏」只铺满界面，不跳歌词；
 *  3) Esc 退出全屏；
 *  4) 点封面进的是窗口内的歌词，不会整屏劫持；
 *  5) ✕ 收进托盘，窗口隐藏但页面还活着。
 *  用法：MUSIC_HUB_DEBUG_PORT=9333 启动壳，再 node scripts/cdp_desktop_window.mjs
 */
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.MUSIC_HUB_DEBUG_PORT || 9333;
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("没有找到页面 target");
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
const evaluate = async (expression, userGesture = true) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};

const probe = () => evaluate(`({
  desktop: Boolean(window.mhDesktop?.isDesktop),
  fullscreen: document.body.classList.contains('mh-fullscreen'),
  lyrics: document.querySelector('#lyricsOverlay').classList.contains('open'),
  winControls: !document.querySelector('#winControls').hidden,
  viewport: [innerWidth, innerHeight],
  screen: [screen.width, screen.height],
  star: document.querySelector('#starfieldView').classList.contains('open')
})`);

await send("Runtime.enable");
await send("Page.enable");
await sleep(1500);

console.log("1 启动:", await probe());

await evaluate(`document.querySelector('[data-win="fullscreen"]').click()`);
await sleep(1800);
console.log("2 点全屏:", await probe());

await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(1200);
console.log("3 Esc:", await probe());

await evaluate(`document.querySelector('#cover').click()`);
await sleep(1000);
console.log("4 点封面（应为窗口内歌词）:", await probe());
await evaluate(`window.__mh.closeLyrics(); true`);
await sleep(400);

await evaluate(`document.querySelector('[data-win="hide"]').click()`);
await sleep(900);
console.log("5 点✕后页面是否还活着:", await probe());

console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
