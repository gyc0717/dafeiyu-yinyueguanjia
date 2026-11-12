/** Verify default flat skin, glass toggle, persistence, lyrics and mobile. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression, userGesture = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(3200);

console.log("default:", await evaluate(`(() => {
  const s = getComputedStyle(document.querySelector('.sidebar'));
  const b = getComputedStyle(document.body);
  return {
    mode: document.documentElement.dataset.glass,
    pressed: document.querySelector('#glassBtn').getAttribute('aria-pressed'),
    bodyImage: b.backgroundImage,
    bodyColor: b.backgroundColor,
    sidebarBg: s.backgroundColor,
    sidebarBlur: s.backdropFilter,
    ambient: getComputedStyle(document.querySelector('#ambient')).opacity,
    sidebarW: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)
  };
})()`));
await shot("26-skin-flat");

await evaluate(`document.querySelector('#glassBtn').click()`, true);
await sleep(900);
console.log("glass:", await evaluate(`(() => {
  const s = getComputedStyle(document.querySelector('.sidebar'));
  const d = getComputedStyle(document.querySelector('.drawer'));
  return {
    mode: document.documentElement.dataset.glass,
    pressed: document.querySelector('#glassBtn').getAttribute('aria-pressed'),
    stored: localStorage.getItem('mh.glass'),
    sidebarBg: s.backgroundColor,
    sidebarBlur: s.backdropFilter,
    drawerBlur: d.backdropFilter,
    searchBlur: getComputedStyle(document.querySelector('.search')).backdropFilter,
    tabBlur: getComputedStyle(document.querySelector('.tabs')).backdropFilter,
    ambient: getComputedStyle(document.querySelector('#ambient')).opacity,
    sidebarW: Math.round(document.querySelector('.sidebar').getBoundingClientRect().width),
    artW: Math.round(document.querySelector('#cover').getBoundingClientRect().width)
  };
})()`));
await shot("27-skin-glass");

await evaluate(`document.querySelector('#lyricsBtn').click()`, true);
await sleep(900);
console.log("glass lyrics:", await evaluate(`(() => {
  const v = getComputedStyle(document.querySelector('.lo-veil'));
  return { overlay: document.querySelector('#lyricsOverlay').classList.contains('open'), veilBlur: v.backdropFilter, veilBg: v.backgroundColor };
})()`));
await shot("28-skin-glass-lyrics");
await evaluate(`document.querySelector('#closeLyrics').click()`);
await sleep(400);

// persistence after reload
await send("Page.reload");
await sleep(3000);
console.log("after reload:", await evaluate(`({
  mode: document.documentElement.dataset.glass,
  pressed: document.querySelector('#glassBtn').getAttribute('aria-pressed'),
  blur: getComputedStyle(document.querySelector('.sidebar')).backdropFilter
})`));

// turn off and confirm no residue
await evaluate(`document.querySelector('#glassBtn').click()`, true);
await sleep(700);
console.log("off:", await evaluate(`({
  mode: document.documentElement.dataset.glass,
  blur: getComputedStyle(document.querySelector('.sidebar')).backdropFilter,
  ambient: getComputedStyle(document.querySelector('#ambient')).opacity,
  stored: localStorage.getItem('mh.glass')
})`));

// mobile: default should be off on a fresh profile/localStorage cleared
await evaluate(`localStorage.removeItem('mh.glass')`);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.reload");
await sleep(3000);
console.log("mobile default:", await evaluate(`({
  mode: document.documentElement.dataset.glass,
  pressed: document.querySelector('#glassBtn').getAttribute('aria-pressed'),
  blur: getComputedStyle(document.querySelector('.sidebar')).backdropFilter
})`));
await shot("29-skin-mobile");

console.log("errors:", errors.slice(0, 6));
ws.close();
process.exit(0);
