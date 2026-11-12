/** Favourites: row heart, player heart, persistence, 我喜欢 list. */
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
const evaluate = async (expression, userGesture = false) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("shot", name);
}
const state = () => evaluate(`({
  likes: __mh.state.likes.size,
  likedRows: document.querySelectorAll('#trackList .like.liked').length,
  playerHeart: document.querySelector('#likeBtn')?.classList.contains('liked'),
  toast: document.querySelector('#toast')?.classList.contains('show') ? document.querySelector('#toast').textContent : null
})`);

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("boot:", await state());

// play a local track, then heart it from the player
await evaluate(`(() => {
  const track = __mh.state.tracks.find((t) => t.title.includes("潮汐信")) || __mh.state.tracks[0];
  __mh.player.setQueue([track], 0, true);
  return track.title;
})()`, true);
await sleep(1500);
console.log("playing:", await evaluate(`__mh.player.track?.title`), "heart:", await evaluate(`document.querySelector('#likeBtn').classList.contains('liked')`));

await evaluate(`document.querySelector('#likeBtn').click()`, true);
await sleep(900);
console.log("after player heart:", await state());
await shot("120-likes-player");

// hit a row heart in the recent list
await evaluate(`document.querySelector('[data-tab="recent"]').click()`, true);
await sleep(1600);
const rowResult = await evaluate(`(() => {
  const heart = document.querySelector('#trackList .like:not(.liked)');
  if (!heart) return null;
  const id = heart.dataset.id;
  heart.click();
  return { id, title: __mh.state.currentList.find((t) => String(t.id) === id)?.title };
})()`, true);
await sleep(900);
console.log("row heart:", rowResult, await state());
await shot("121-likes-rows");

// persistence after reload
await send("Page.reload");
await sleep(6500);
console.log("after reload:", await state());

// the 我喜欢 virtual playlist
await evaluate(`document.querySelector('[data-tab="playlists"]').click()`, true);
await sleep(2200);
console.log("likes row:", await evaluate(`(() => {
  const row = document.querySelector('.likes-row');
  return row ? { text: row.textContent.replace(/\\s+/g, ' ').trim(), has: true } : { has: false };
})()`));
await evaluate(`document.querySelector('.likes-row')?.click()`, true);
await sleep(1200);
console.log("likes view:", await evaluate(`({
  view: __mh.state.likesView,
  label: document.querySelector('#listLabel')?.textContent,
  meta: document.querySelector('#listMeta')?.textContent,
  rows: document.querySelectorAll('#trackList .track').length,
  first: __mh.state.currentList[0]?.title,
  backVisible: !document.querySelector('#backToPlaylists')?.hidden
})`));
await shot("122-likes-view");

// unlike from inside the likes view
await evaluate(`document.querySelector('#trackList .like.liked')?.click()`, true);
await sleep(1300);
console.log("after unlike:", await evaluate(`({
  count: __mh.state.likes.size,
  rows: document.querySelectorAll('#trackList .track').length,
  meta: document.querySelector('#listMeta')?.textContent
})`));

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
