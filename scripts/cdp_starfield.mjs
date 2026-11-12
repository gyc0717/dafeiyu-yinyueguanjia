/** Starfield prototype walkthrough: home -> galaxy -> card -> play -> player. */
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/assets/prototype/starfield.html" });
await sleep(6000);

console.log("home:", await evaluate(`({
  title: document.querySelector('#homeTitle')?.textContent,
  artist: document.querySelector('#homeArtist')?.textContent,
  tracks: window.__proto?.tracks.length,
  stars: window.__proto?.stars.length,
  stats: [...document.querySelectorAll('#homeStats .stat b')].map(x=>x.textContent.trim()),
  chips: [...document.querySelectorAll('#statusChips .chip')].map(x=>x.textContent.trim())
})`));
await shot("35-starfield-home");

await evaluate(`window.__protoGalaxy.go('starfield')`);
await sleep(1200);
console.log("galaxy:", await evaluate(`({
  view: window.__proto.view,
  canvas: [document.querySelector('#galaxy').width, document.querySelector('#galaxy').height],
  stars: window.__proto.stars.length
})`));
await shot("36-starfield-galaxy");

const point = await evaluate(`(() => {
  const s = window.__proto.stars.find(x => x.provider === 'local' && x.title.includes('潮汐')) || window.__proto.stars[0];
  const p = window.__protoGalaxy.project(s);
  return { x: Math.round(p.x), y: Math.round(p.y), id: s.id, title: s.title, provider: s.provider };
})()`);
console.log("star point:", point);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 72 + point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 72 + point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
await sleep(700);
console.log("card:", await evaluate(`({
  open: document.querySelector('#starCard').classList.contains('on'),
  title: document.querySelector('#cardTitle')?.textContent,
  badge: document.querySelector('#cardBadge')?.textContent,
  meta: document.querySelector('#cardMeta')?.textContent
})`));
await shot("37-starfield-card");

await evaluate(`window.__protoGalaxy.playTrack(window.__proto.stars.find(x => x.title.includes('潮汐')))`, true);
await sleep(3000);
console.log("playing:", await evaluate(`({
  title: window.__proto.current?.title,
  paused: document.querySelector('audio') ? null : null,
  bar: document.querySelector('#barTitle')?.textContent,
  time: document.querySelector('#barTime')?.textContent,
  badge: document.querySelector('#barPlatform')?.textContent
})`));
await shot("38-starfield-playing");

await evaluate(`window.__protoGalaxy.openPlayer()`, true);
await sleep(1200);
console.log("player:", await evaluate(`({
  open: document.querySelector('#playerOverlay').classList.contains('on'),
  title: document.querySelector('#poTitle')?.textContent,
  lyrics: document.querySelectorAll('#poLyr .po-ly').length,
  active: document.querySelector('#poLyr .po-ly.on')?.textContent
})`));
await shot("39-starfield-player");

console.log("errors:", errors.slice(0, 8));
ws.close();
process.exit(0);
