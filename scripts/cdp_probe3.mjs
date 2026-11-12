/** Transport + journal edge cases: pause/resume, next, bar seek, track end, no-cover. */
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
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text);
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
async function space() {
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type,
      key: " ",
      code: "Space",
      windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32,
    });
  }
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(3200);

await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(3500);
console.log("playing:", await evaluate(`({ playing: __mh.player.playing, t: Math.round(__mh.player.currentTimeMs), e: __mh.journal.eventId, badge: document.querySelector('#eventState').textContent })`));

await space();
await sleep(700);
console.log("after space (pause):", await evaluate(`({ playing: __mh.player.playing, badge: document.querySelector('#eventState').textContent })`));
await space();
await sleep(1200);
console.log("after space (resume):", await evaluate(`({ playing: __mh.player.playing, e: __mh.journal.eventId })`));

const firstTitle = await evaluate(`__mh.player.track.title`);
await evaluate(`document.querySelector('#nextBtn').click()`, true);
await sleep(2500);
console.log("next:", await evaluate(`({ from: ${JSON.stringify(firstTitle)}, to: __mh.player.track.title, e: __mh.journal.eventId, events: __mh.player.queue.length })`));

// progress bar seek to ~50%
const bar = await evaluate(`(() => { const r = document.querySelector('#seekBar').getBoundingClientRect(); return {x: r.left, y: r.top + r.height/2, w: r.width}; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: bar.x + bar.w * 0.5, y: bar.y, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: bar.x + bar.w * 0.5, y: bar.y, button: "left", buttons: 0, clickCount: 1 });
await sleep(1200);
console.log("bar seek:", await evaluate(`({ t: Math.round(__mh.player.currentTimeMs), dur: Math.round(__mh.player.durationMs) })`));

// jump close to the end, let it roll over
await evaluate(`__mh.player.seek(__mh.player.durationMs - 1500)`);
await sleep(4500);
console.log("rolled over:", await evaluate(`({ title: __mh.player.track.title, playing: __mh.player.playing, t: Math.round(__mh.player.currentTimeMs), e: __mh.journal.eventId, badge: document.querySelector('#eventState').textContent })`));

// a real file with no embedded cover
await evaluate(`document.querySelector('.track[data-id="41"]').click()`, true);
await sleep(2000);
console.log("no-cover track:", await evaluate(`({
  title: document.querySelector('#nowTitle').textContent,
  imgHidden: document.querySelector('#coverImg').hidden,
  imgRendered: document.querySelector('#coverImg').getBoundingClientRect().width,
  emptyShown: getComputedStyle(document.querySelector('#coverEmpty')).display
})`));
await shot("12-real-track");

// leave the page so the beacon closes the open event
await send("Page.navigate", { url: "about:blank" });
await sleep(1200);
console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
