/** Why does the player show through when 星海 is open? */
import { setTimeout as sleep } from "node:timers/promises";

const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
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
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1876, height: 923, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(7000);

await evaluate(`__mh.openStarfieldPanel(); true`, true);
await sleep(3000);

console.log(await evaluate(`(() => {
  const overlay = document.querySelector('#starfieldOverlay');
  const frame = document.querySelector('#starfieldFrame');
  const shell = document.querySelector('.shell');
  const cs = getComputedStyle(overlay);
  const fs = getComputedStyle(frame);
  const pt = document.elementFromPoint(1200, 500);
  let docInfo = null;
  try {
    const d = frame.contentDocument;
    docInfo = d ? {
      ready: d.readyState,
      url: d.location.pathname,
      bodyBg: d.body ? getComputedStyle(d.body).backgroundColor : null,
      bodyOpacity: d.body ? getComputedStyle(d.body).opacity : null,
      stage: d.querySelector('.stage') ? getComputedStyle(d.querySelector('.stage')).left : null,
      views: [...d.querySelectorAll('.view')].map((v) => v.id + ':' + (v.classList.contains('on') ? 'on' : 'off')).slice(0, 6)
    } : null;
  } catch (e) { docInfo = { error: String(e) }; }
  return {
    overlay: { open: overlay.classList.contains('open'), display: cs.display, z: cs.zIndex,
               bg: cs.backgroundImage.slice(0, 40), rect: overlay.getBoundingClientRect().toJSON() },
    frame: { z: fs.zIndex, pos: fs.position, left: fs.left, opacity: fs.opacity, bg: fs.backgroundColor,
             rect: frame.getBoundingClientRect().toJSON() },
    shellZ: getComputedStyle(shell).zIndex,
    bodyClass: document.body.className,
    at1200x500: pt ? (pt.id || pt.className || pt.tagName) : null,
    frameDoc: docInfo
  };
})()`));

ws.close();
process.exit(0);
