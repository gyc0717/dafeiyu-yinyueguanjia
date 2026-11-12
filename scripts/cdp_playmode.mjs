/** 播放模式菜单验收（真 Electron 窗口）：
 *  - 控制条上没有单独的随机/循环圆钮，只有一个「播放模式」；
 *  - 菜单四个选项，选中后 player 状态对、图标对、菜单关掉；
 *  - Esc 先关菜单。
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
const probe = () => evaluate(`({
  mode: window.__mh.player.shuffle ? 'shuffle' : window.__mh.player.repeat,
  icon: document.querySelector('#playModeIcon')?.getAttribute('href'),
  title: document.querySelector('#playModeBtn')?.title,
  menuOpen: !document.querySelector('#playModeMenu').hidden,
  items: [...document.querySelectorAll('.playmode-item')].map((b) => ({ mode: b.dataset.mode, on: b.classList.contains('on') })),
  roundButtons: [...document.querySelectorAll('.controls > button, .controls > .playmode > button')].map((b) => b.id),
  oldButtons: Boolean(document.querySelector('#shuffleBtn') || document.querySelector('#repeatBtn')),
  likeVisible: Boolean(document.querySelector('#likeBtn'))
})`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.reload", { ignoreCache: true });
await sleep(5000);
console.log("1 初始:", await probe());

await evaluate(`document.querySelector('#playModeBtn').click()`);
await sleep(400);
console.log("2 打开菜单:", await probe());
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}142-playmode-menu.png`, Buffer.from(shot.data, "base64"));
console.log("shot 142-playmode-menu");

for (const mode of ["one", "shuffle", "order", "all"]) {
  await evaluate(`document.querySelector('#playModeBtn').click()`);
  await sleep(250);
  await evaluate(`document.querySelector('.playmode-item[data-mode="${mode}"]').click()`);
  await sleep(500);
  console.log(`3 选 ${mode}:`, await probe());
}

await evaluate(`document.querySelector('#playModeBtn').click()`);
await sleep(300);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(500);
console.log("4 Esc 关菜单:", await probe());

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
