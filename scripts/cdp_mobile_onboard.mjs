/** Mobile check for the onboarding card (390×844, screenshots _shots/40). */
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const version = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};
const send = (method, params = {}, sid = null) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });
const { targetId } = await send("Target.createTarget", { url: "http://127.0.0.1:8787/" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const call = (m, p = {}) => send(m, p, sessionId);
const evaluate = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};
await call("Page.enable");
await call("Runtime.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(600);
await call("Page.reload", { ignoreCache: true });
await sleep(3200);
await evaluate(`window.__mh.openOnboard()`);
await sleep(700);
console.log(
  "mobile:",
  await evaluate(`(() => {
    const card = document.querySelector('.onboard-card');
    const rect = card.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      docScrollWidth: document.documentElement.scrollWidth,
      card: { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), top: Math.round(rect.top) },
      overflow: document.documentElement.scrollWidth > innerWidth,
      pickBtn: Boolean(document.querySelector('#obPickFolder')),
      inputWidth: Math.round(document.querySelector('#obPath').getBoundingClientRect().width),
      loginBtn: (() => {
        const b = document.querySelector('#obLogin');
        const cs = getComputedStyle(b);
        return { w: Math.round(b.getBoundingClientRect().width), scrollW: b.scrollWidth,
                 clientW: b.clientWidth, padding: cs.padding, widthCss: cs.width,
                 flex: cs.flex, ws: cs.whiteSpace, font: cs.fontSize };
      })(),
      doneBtn: (() => {
        const b = document.querySelector('#obDone');
        const cs = getComputedStyle(b);
        return { w: Math.round(b.getBoundingClientRect().width), scrollW: b.scrollWidth,
                 clientW: b.clientWidth, padding: cs.padding, widthCss: cs.width,
                 flex: cs.flex, ws: cs.whiteSpace };
      })(),
    };
  })()`)
);
const { data } = await call("Page.captureScreenshot", { format: "png" });
writeFileSync("D:/数据/deepseek-harness/default-workspace/music-hub/_shots/40-onboarding-mobile.png", Buffer.from(data, "base64"));
console.log("shot 40-onboarding-mobile");
await send("Target.closeTarget", { targetId });
ws.close();
process.exit(0);
