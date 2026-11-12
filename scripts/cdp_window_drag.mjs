/** 右键按住空白处拖窗口验收（真 Electron，真实鼠标移动）：
 *  - 右键按下空白处 → 移动系统光标 → 窗口跟着走；
 *  - 松开右键 → 再动光标，窗口不动；
 *  - 全程窗口尺寸不变。
 */
import { setTimeout as sleep } from "node:timers/promises";
import { execFileSync } from "node:child_process";

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
const ps = (cmd) => execFileSync("powershell", ["-NoProfile", "-Command", cmd]).toString().trim();
const moveCursor = (x, y) => ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`);
const cursor = () => {
  const [x, y] = ps("Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; \"$($p.X),$($p.Y)\"").split(",").map(Number);
  return { x, y };
};
const bounds = async () => {
  const b = await evaluate(`window.mhDesktop.bounds()`);
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.bringToFront");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.reload", { ignoreCache: true });
await sleep(4500);
await sleep(800);

const dpr = await evaluate(`window.devicePixelRatio || 1`);
const spot = await evaluate(`(() => {
  for (let y = 120; y < innerHeight - 140; y += 40) {
    for (let x = 420; x < innerWidth - 220; x += 40) {
      const el = document.elementFromPoint(x, y);
      if (el && window.__mh.isBlankArea(el)) return { x, y };
    }
  }
  return null;
})()`);
if (!spot) { console.log("找不到空白处"); process.exit(1); }

const before = await bounds();
console.log("dpr:", dpr, "空白点:", spot, "窗口起点:", before);

// 真实光标先挪到按下点，避免第一次移动产生跳变
moveCursor((before.x + spot.x) * dpr, (before.y + spot.y) * dpr);
await sleep(200);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: spot.x, y: spot.y, button: "right", buttons: 2, clickCount: 1 });
await sleep(200);

await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: spot.x + 100, y: spot.y + 60, button: "right", buttons: 2 });
await sleep(500);
const during = await bounds();
console.log("拖动中:", during, "位移:", { dx: during.x - before.x, dy: during.y - before.y, size: [during.w - before.w, during.h - before.h] });

await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: spot.x, y: spot.y, button: "right", buttons: 0, clickCount: 1 });
await sleep(300);
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: spot.x + 200, y: spot.y + 140, button: "none", buttons: 0 });
await sleep(500);
const after = await bounds();
console.log("松开后再动:", after, "位移:", { dx: after.x - during.x, dy: after.y - during.y });

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
