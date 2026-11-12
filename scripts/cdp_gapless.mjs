/**
 * Verify the dual-audio gapless pass: next-track preload, preload readiness
 * before the switch, `ended` -> standby swap gap, queue edits re-planning the
 * preload, repeat-one restart, and the slow fallback when no preload exists.
 *
 * Talks to the browser-level CDP endpoint and attaches to a fresh page target
 * (the page-level websocket in this Edge build closes immediately).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../_shots/", import.meta.url));
const version = await (await fetch("http://127.0.0.1:9223/json/version")).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 0;
const pending = new Map();
const errors = [];
let sessionId = null;
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.sessionId !== sessionId) return;
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
};
const send = (method, params = {}, sid = null) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

const { targetId } = await send("Target.createTarget", { url: "http://127.0.0.1:8787/" });
const attached = await send("Target.attachToTarget", { targetId, flatten: true });
sessionId = attached.sessionId;
const call = (method, params = {}) => send(method, params, sessionId);

async function evaluate(expression, userGesture = false) {
  const r = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " :: " + expression.slice(0, 80));
  return r.result?.value;
}
async function waitFor(expression, timeout = 8000, interval = 200) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(interval);
  }
  return false;
}
async function shot(name) {
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}

await call("Page.enable");
await call("Runtime.enable");
await call("Network.enable");
await call("Network.clearBrowserCache");
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(900);
await call("Page.reload", { ignoreCache: true });
await sleep(3500);

console.log(
  "boot:",
  await evaluate(`(() => {
    const p = window.__mh?.player;
    return p
      ? { elements: p.elements.length, queue: p.queue.length, index: p.index, title: p.track?.title,
          domAudioB: Boolean(document.querySelector('#audio-b')) }
      : { missing: true, mh: Boolean(window.__mh) };
  })()`)
);

// record every swap so repeat-one can be checked even though the index repeats
await evaluate(`(() => {
  window.__gapless = [];
  window.__mh.player.addEventListener('gapless', (e) => window.__gapless.push(e.detail));
  return true;
})()`);

// start playback with a real user gesture
await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(2200);

const before = await evaluate(`(() => {
  const p = window.__mh.player;
  return {
    playing: p.playing, active: p.active, index: p.index, title: p.track?.title,
    src: p.audio.currentSrc.split('/').pop(),
    preloadIndex: p.preloadIndex, preloadId: p.preloadId,
    standbyReady: p.standby.readyState, standbySrc: p.standby.currentSrc.split('/').pop(),
    currentMs: Math.round(p.currentTimeMs), durationMs: Math.round(p.durationMs),
  };
})()`);
console.log("playing + early preload:", before);
console.log("preload ok:", before.preloadId != null ? "yes" : "NO");

// jump to just before the end and let it run out
const prevId = await evaluate(`window.__mh.player.track.id`);
await evaluate(`window.__mh.player.seek(window.__mh.player.durationMs - 1200); 'seeked'`);
const switched = await waitFor(`window.__mh.player.track.id !== ${prevId}`, 9000, 150);
console.log("auto-advanced:", switched);
await sleep(600);

const after = await evaluate(`(() => {
  const p = window.__mh.player;
  return {
    index: p.index, title: p.track?.title, playing: p.playing, paused: p.audio.paused,
    active: p.active, activeIsExpected: p.elements[p.active] === document.querySelector(p.active ? '#audio-b' : '#audio'),
    gapMs: p.lastGapMs == null ? null : Math.round(p.lastGapMs * 10) / 10,
    currentMs: Math.round(p.currentTimeMs), durationMs: Math.round(p.durationMs),
    src: p.audio.currentSrc.split('/').pop(),
    standbySrc: p.standby.currentSrc,
    gaplessEvents: window.__gapless.length,
    badge: (document.querySelector('#eventState') || {}).textContent || null,
  };
})()`);
console.log("after switch:", after);
await shot("35-gapless-next");

// queue edit: insert a far-away track as next, the preload must follow it
const insert = await evaluate(`(() => {
  const p = window.__mh.player;
  const candidate = p.queue.find((t, i) => i > p.index + 2 && t.id !== p.track.id);
  if (!candidate) return null;
  p.insertNext(candidate);
  return { id: candidate.id, title: candidate.title, index: p.index };
})()`);
await sleep(900);
const afterInsert = await evaluate(`(() => {
  const p = window.__mh.player;
  return { preloadId: p.preloadId, preloadIndex: p.preloadIndex, nextId: p.queue[p.index + 1]?.id,
           standbyReady: p.standby.readyState };
})()`);
console.log("insertNext:", insert, "-> preload:", afterInsert);
console.log("preload follows queue:", afterInsert.preloadId === insert?.id ? "yes" : "NO");

// repeat-one should restart the same track through the same swap path
const swapCountBefore = await evaluate(`window.__gapless.length`);
await evaluate(`(() => {
  const p = window.__mh.player;
  p.repeat = 'one';
  p.prepareNext();               // the previous queue edit left the wrong track buffered
  p.seek(p.durationMs - 1200);
  return p.repeat;
})()`);
await sleep(700);
await waitFor(`window.__gapless.length > ${swapCountBefore}`, 7000, 150);
const repeatOne = await evaluate(`(() => {
  const p = window.__mh.player;
  return { repeat: p.repeat, index: p.index, playing: p.playing,
           currentMs: Math.round(p.currentTimeMs), gapMs: Math.round((p.lastGapMs || 0) * 10) / 10,
           swaps: window.__gapless.length - ${swapCountBefore} };
})()`);
console.log("repeat one:", repeatOne);
await evaluate(`window.__mh.player.repeat = 'all'`);

// fallback: no preload -> the old linear load path must still advance
await evaluate(`(() => {
  const p = window.__mh.player;
  clearTimeout(p.earlyPreloadTimer);
  p.preloadLeadMs = 0;
  p.preloadIndex = -1; p.preloadId = null;
  p.standby.removeAttribute('src'); p.standby.load();
  return true;
})()`);
const fallbackFrom = await evaluate(`window.__mh.player.track.id`);
const gapsBefore = await evaluate(`window.__gapless.length`);
await evaluate(`window.__mh.player.seek(window.__mh.player.durationMs - 1200); 'seeked'`);
const fallbackAdvanced = await waitFor(`window.__mh.player.track.id !== ${fallbackFrom}`, 9000, 200);
await sleep(500);
const fallback = await evaluate(`(() => {
  const p = window.__mh.player;
  return { index: p.index, playing: p.playing,
           newSwaps: window.__gapless.length - ${gapsBefore} };
})()`);
console.log("fallback advanced:", fallbackAdvanced, fallback);
await evaluate(`window.__mh.player.preloadLeadMs = 22000`);

// transport still works on the swapped-in element
await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(400);
const paused = await evaluate(`({ paused: window.__mh.player.audio.paused, playing: window.__mh.player.playing })`);
await evaluate(`document.querySelector('#playBtn').click()`, true);
await sleep(600);
const resumed = await evaluate(`({ paused: window.__mh.player.audio.paused, playing: window.__mh.player.playing })`);
console.log("pause/resume after swap:", paused, resumed);

console.log("errors:", errors.slice(0, 6));
await send("Target.closeTarget", { targetId });
ws.close();
process.exit(0);
