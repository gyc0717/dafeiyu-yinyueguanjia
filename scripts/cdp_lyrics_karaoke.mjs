/** Karaoke lyrics: the active line fills character by character. */
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
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const state = () => evaluate(`(() => {
  const view = __mh.lyricsView;
  const active = view.activeIndex;
  return {
    open: __mh.state.lyricsOpen,
    activeIndex: active,
    text: view.lines[active]?.text ?? null,
    lineT: view.lines[active]?.t ?? null,
    nextT: view.lines[active + 1]?.t ?? null,
    spans: view.spans.length,
    sung: view.spans.filter((s) => s.classList.contains('sung')).length,
    hasWords: Boolean(view.lines[active]?.words?.length),
    karaokeClass: document.querySelectorAll('.lo-line.karaoke').length,
    now: Math.round(__mh.player.currentTimeMs ?? 0)
  };
})()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
const WIDTH = Number(process.env.MH_WIDTH || 1440);
const SUFFIX = WIDTH < 700 ? "-mobile" : "";
const HEIGHT = Number(process.env.MH_HEIGHT || 900);
await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700 });
await send("Emulation.setTouchEmulationEnabled", { enabled: WIDTH < 700 });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

// Leave the starfield landing page, then pick a local track that has lyrics.
await evaluate(`document.querySelector('[data-tab="recent"]').click()`, true);
await sleep(800);
const pick = await evaluate(`(async () => {
  const tracks = __mh.state.tracks;
  for (const track of tracks) {
    const lyric = await __mh.api.lyrics(track.id).catch(() => null);
    if (lyric?.synced && lyric.lines.length > 8) {
      return { id: track.id, title: track.title, lines: lyric.lines.length, word_sync: lyric.word_sync,
               source: lyric.source, first: lyric.lines[0] };
    }
  }
  return null;
})()`);
console.log("track:", pick);
if (!pick) throw new Error("no synced local track");

await evaluate(`(() => {
  const track = __mh.state.tracks.find((t) => t.id === ${pick.id});
  __mh.player.setQueue([track], 0, true);
  return true;
})()`, true);
await sleep(1500);
await evaluate(`__mh.player.seek(20000)`, true);
await sleep(600);
await evaluate(`__mh.openLyrics()`, true);
await sleep(900);
console.log("opened:", await state());
await shot(`102-lyrics-karaoke-a${SUFFIX}`);

for (let i = 0; i < 4; i += 1) {
  await sleep(700);
  console.log(`sample ${i + 1}:`, await state());
}
await shot(`102-lyrics-karaoke-b${SUFFIX}`);
console.log("colors:", await evaluate(`(() => {
  const line = document.querySelector('.lo-line.karaoke');
  const spans = [...line.querySelectorAll('.lo-ch')];
  return {
    sung: spans.filter((s) => s.classList.contains('sung')).length,
    total: spans.length,
    colors: spans.map((s) => getComputedStyle(s).color),
    lineColor: getComputedStyle(line).color,
    shadow: getComputedStyle(line).textShadow
  };
})()`));
{
  const box = await evaluate(`(() => {
    const r = document.querySelector('.lo-line.karaoke').getBoundingClientRect();
    return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 8), width: Math.min(1440, r.width + 20), height: Math.min(900, r.height + 16) };
  })()`);
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 2 } });
  writeFileSync(join(OUT, `102b-lyrics-karaoke-crop${SUFFIX}.png`), Buffer.from(data, "base64"));
  console.log("shot 102b", box);
}

// A line with real word timestamps: inject one at the current position and seek
// the audio across it, so the normal tick drives the same code path as playback.
await evaluate(`__mh.player.pause && __mh.player.pause()`, true);
await sleep(300);
const injected = await evaluate(`(() => {
  const view = __mh.lyricsView;
  const lines = view.lines.map((line) => ({ ...line }));
  lines[3] = { t: 20000, text: "你好世界", words: [
    { t: 20000, text: "你" }, { t: 20500, text: "好" }, { t: 21000, text: "世" }, { t: 21500, text: "界" }
  ]};
  lines[4] = { t: 30000, text: lines[4].text };
  view.setLines(lines, true);
  view.setOpen(true);
  view.update(20000, true);
  __mh.player.audio.currentTime = 20.2;
  return { active: view.activeIndex, spans: view.spans.length };
})()`);
console.log("word line injected:", injected);

for (const seconds of [20.2, 20.7, 21.2, 21.7]) {
  const r = await evaluate(`(async () => {
    __mh.player.audio.currentTime = ${seconds};
    await new Promise((res) => setTimeout(res, 320));
    const view = __mh.lyricsView;
    return { at: ${seconds}, active: view.activeIndex,
             total: view.spans.length,
             sung: view.spans.filter((s) => s.classList.contains('sung')).length,
             words: Boolean(view.lines[view.activeIndex]?.words?.length) };
  })()`);
  console.log("word path:", r);
}

console.log("errors:", errors.slice(0, 5));
ws.close();
process.exit(0);
