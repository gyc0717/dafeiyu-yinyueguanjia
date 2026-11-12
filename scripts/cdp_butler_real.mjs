/** Inspect the real Electron window: why can't 管家 be closed? */
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const OUT = "D:/数据/deepseek-harness/default-workspace/music-hub/_shots/";
const targets = await (await fetch("http://127.0.0.1:9224/json")).json();
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
await sleep(1500);

console.log("window size:", await evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, desktop: Boolean(window.mhDesktop) })`));
console.log("initial:", await evaluate(`({
  starfield: document.querySelector('#starfieldView')?.classList.contains('open'),
  butler: document.querySelector('#butlerDrawer')?.classList.contains('open'),
  lyrics: document.body.classList.contains('lyrics-open'),
  bodyClass: document.body.className
})`));

// open 管家 through the real button
await evaluate(`document.querySelector('#butlerBtn').click()`, true);
await sleep(800);
console.log("after 管家:", await evaluate(`(() => {
  const drawer = document.querySelector('#butlerDrawer');
  const close = document.querySelector('#closeButler');
  const rect = close.getBoundingClientRect();
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const chain = [];
  let node = top;
  while (node && chain.length < 4) { chain.push(node.id || node.className || node.tagName); node = node.parentElement; }
  return {
    open: drawer.classList.contains('open'),
    closeRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    topAtClose: chain,
    winControls: (() => { const w = document.querySelector('#winControls'); if (!w) return null; const r = w.getBoundingClientRect(); return { hidden: w.hidden, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, z: getComputedStyle(w).zIndex }; })()
  };
})()`));

// try the real close button
await evaluate(`document.querySelector('#closeButler').click()`, true);
await sleep(600);
console.log("after close click:", await evaluate(`document.querySelector('#butlerDrawer').classList.contains('open')`));

// reopen and try Esc
await evaluate(`document.querySelector('#butlerBtn').click()`, true);
await sleep(600);
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`, true);
await sleep(600);
console.log("after Esc:", await evaluate(`({
  butler: document.querySelector('#butlerDrawer').classList.contains('open'),
  starfield: document.querySelector('#starfieldView').classList.contains('open'),
  state: { butlerOpen: window.__mh?.state?.butlerOpen }
})`));

const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${OUT}132-butler-real.png`, Buffer.from(data, "base64"));
console.log("shot 132; errors:", errors.slice(0, 3));
ws.close();
process.exit(0);
