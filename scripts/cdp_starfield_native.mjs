/** 星海原生视图验收：打开 / 画布有星 / 点星出卡 / 卡片播放走主播放器 / Esc 退出。 */
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
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
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
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
};

const probe = () => evaluate(`(() => {
  const view = document.querySelector('#starfieldView');
  const canvas = document.querySelector('#sfpCanvas');
  const hero = document.querySelector('.hero');
  const topbar = document.querySelector('.topbar');
  const btn = document.querySelector('#starfieldBtn');
  const stars = window.__mh?.starfield?.debugStars?.() || [];
  const tr = topbar.getBoundingClientRect();
  const topHit = document.elementFromPoint(tr.x + 60, tr.y + tr.height / 2);
  return {
    open: view.classList.contains('open'),
    hidden: view.hidden,
    heroDisplay: getComputedStyle(hero).display,
    canvas: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
    stars: stars.length,
    topbarVisible: topHit ? (topHit.closest('.topbar') !== null) : false,
    sidebarVisible: getComputedStyle(document.querySelector('.sidebar')).display !== 'none',
    btnLabel: btn.textContent.trim(),
    cardHidden: document.querySelector('#sfpCard').hidden,
    cardTitle: document.querySelector('#sfpCardTitle').textContent,
    dockTitle: document.querySelector('#sfpDockTitle').textContent,
    queue: window.__mh.player.queue.length,
    track: window.__mh.player.track?.title || null
  };
})()`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("boot:", await probe());
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(1500);
console.log("opened:", await probe());
await shot("132-starfield-native");

const rect = await evaluate(`(() => { const r = document.querySelector('#sfpCanvas').getBoundingClientRect(); return { x: r.x, y: r.y }; })()`);
const star = await evaluate(`(() => { const s = window.__mh.starfield.debugStars()[0]; return { x: s.x, y: s.y, title: s.title }; })()`);
const px = rect.x + star.x;
const py = rect.y + star.y;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: px, y: py, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: px, y: py, button: "left", buttons: 0, clickCount: 1 });
await sleep(700);
const card = await probe();
console.log("star clicked:", { cardHidden: card.cardHidden, cardTitle: card.cardTitle, expected: star.title });
await shot("133-starfield-card");

const before = await evaluate(`({ queue: window.__mh.player.queue.length, track: window.__mh.player.track?.title || null })`);
await evaluate(`document.querySelector('#sfpPlay').click()`, true);
await sleep(1200);
const after = await evaluate(`({ queue: window.__mh.player.queue.length, track: window.__mh.player.track?.title || null, playing: window.__mh.player.playing })`);
console.log("play from card:", { before, after });
await evaluate(`window.__mh.player.pause()`);

await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(800);
console.log("after esc:", await probe());
await shot("134-starfield-closed");

// 手机宽度：星图 + 底栏不许溢出，顶栏还在
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(400);
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(1200);
console.log("mobile:", await evaluate(`(() => {
  const view = document.querySelector('#starfieldView');
  const dock = document.querySelector('#sfpDock');
  const dr = dock.getBoundingClientRect();
  return {
    open: view.classList.contains('open'),
    canvas: [document.querySelector('#sfpCanvas').clientWidth, document.querySelector('#sfpCanvas').clientHeight],
    dockFits: dr.right <= window.innerWidth + 1 && dr.left >= -1,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    stars: window.__mh.starfield.debugStars().length
  };
})()`));
await shot("135-starfield-mobile");

console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
