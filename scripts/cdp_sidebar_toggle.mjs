/** 侧栏收起 / 召回验收（真 Electron 窗口）：
 *  - 侧栏底部有「隐藏侧栏」按钮，点了侧栏收起、主区变宽；
 *  - 左边缘出现把手，点了侧栏回来；
 *  - 状态写进 localStorage，刷新后仍是收起的。
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
  const side = document.querySelector('.sidebar');
  const main = document.querySelector('.main');
  const show = document.querySelector('#sidebarShowBtn');
  const hide = document.querySelector('#sidebarHideBtn');
  return {
    hiddenClass: document.body.classList.contains('side-hidden'),
    sidebarRect: Math.round(side.getBoundingClientRect().width),
    sidebarOpacity: getComputedStyle(side).opacity,
    mainWidth: Math.round(main.getBoundingClientRect().width),
    hideVisible: Boolean(hide && hide.offsetParent !== null),
    show: show ? { hidden: show.hidden, w: Math.round(show.getBoundingClientRect().width) } : null,
    stored: localStorage.getItem('mh.sidebarHidden')
  };
})()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.reload", { ignoreCache: true });
await sleep(5000);

await evaluate(`localStorage.removeItem('mh.sidebarHidden'); true`);
console.log("1 初始:", await probe());

await evaluate(`document.querySelector('#sidebarHideBtn').click()`);
await sleep(600);
console.log("2 点隐藏:", await probe());
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}143-sidebar-hidden.png`, Buffer.from(shot.data, "base64"));
console.log("shot 143-sidebar-hidden");

await evaluate(`document.querySelector('#sidebarShowBtn').click()`);
await sleep(600);
console.log("3 点把手召回:", await probe());

await evaluate(`document.querySelector('#sidebarHideBtn').click()`);
await sleep(400);
await send("Page.reload", { ignoreCache: true });
await sleep(4500);
console.log("4 刷新后:", await probe());
await evaluate(`document.querySelector('#sidebarShowBtn').click()`);
await sleep(500);
console.log("5 收尾:", await probe());

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
