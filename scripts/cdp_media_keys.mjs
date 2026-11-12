/** Media session: action handlers, stop/seek steps, position state, playback state. */
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
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression, userGesture = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
const now = () => evaluate(`({
  time: Math.round(__mh.player.currentTimeMs),
  paused: __mh.player.audio.paused,
  playing: __mh.player.playing,
  track: __mh.player.track?.title,
  duration: Math.round(__mh.player.durationMs || 0)
})`);

await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.enable");
await send("Runtime.enable");
// Record what the page registers, and keep the handler functions so we can invoke
// them exactly the way the OS would.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__ms = { actions: {}, positions: [], states: [] };
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      const origSet = ms.setActionHandler.bind(ms);
      ms.setActionHandler = (action, handler) => {
        window.__ms.actions[action] = handler;
        return origSet(action, handler);
      };
      if (typeof ms.setPositionState === "function") {
        const origPos = ms.setPositionState.bind(ms);
        ms.setPositionState = (state) => {
          window.__ms.positions.push({ d: state.duration, p: state.position, r: state.playbackRate });
          if (window.__ms.positions.length > 60) window.__ms.positions.shift();
          return origPos(state);
        };
      }
      try {
        let raw = "none";
        Object.defineProperty(ms, "playbackState", {
          configurable: true,
          get: () => raw,
          set: (value) => { raw = value; window.__ms.states.push(value); }
        });
      } catch (error) {
        window.__ms.stateHookError = String(error);
      }
    }
  `,
});
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("handlers:", await evaluate(`Object.keys(window.__ms.actions)`));
console.log("state hook:", await evaluate(`({ error: window.__ms.stateHookError || null, states: window.__ms.states })`));

await evaluate(`document.querySelector('[data-tab="recent"]').click()`, true);
await sleep(600);
await evaluate(`(() => {
  const track = __mh.state.tracks.find((t) => t.title.includes("潮汐信")) || __mh.state.tracks[0];
  __mh.player.setQueue([track], 0, true);
  return track.title;
})()`, true);
await sleep(1500);
await evaluate(`__mh.player.seek(30000)`, true);
await sleep(1300);
console.log("playing:", await now());
console.log("position state calls:", await evaluate(`window.__ms.positions.length`));
console.log("position state last:", await evaluate(`window.__ms.positions[window.__ms.positions.length - 1]`));

console.log("\n-- stop --");
await evaluate(`window.__ms.actions.stop()`, true);
await sleep(500);
console.log("after stop:", await now());
console.log("states:", await evaluate(`window.__ms.states`));

console.log("\n-- play --");
await evaluate(`window.__ms.actions.play()`, true);
await sleep(700);
console.log("after play:", await now());

console.log("\n-- seekforward 10s @ position 30s --");
await evaluate(`__mh.player.seek(30000)`, true);
await sleep(400);
await evaluate(`window.__ms.actions.seekforward({ seekOffset: 10 })`, true);
await sleep(500);
console.log("after seekforward:", await now());

console.log("\n-- seekbackward 15s --");
await evaluate(`window.__ms.actions.seekbackward({ seekOffset: 15 })`, true);
await sleep(500);
console.log("after seekbackward:", await now());

console.log("\n-- pause --");
await evaluate(`window.__ms.actions.pause()`, true);
await sleep(500);
console.log("after pause:", await now());
console.log("states:", await evaluate(`window.__ms.states`));

console.log("\n-- metadata --");
console.log(await evaluate(`(() => {
  const m = navigator.mediaSession.metadata;
  return m ? { title: m.title, artist: m.artist, album: m.album, art: (m.artwork || []).length } : null;
})()`));

const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(join(OUT, "104-media-keys.png"), Buffer.from(data, "base64"));
console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
