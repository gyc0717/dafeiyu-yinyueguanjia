/** Can you leave 星海? Esc (parent + iframe), tab click, and the 星海 toggle. */
import { setTimeout as sleep } from "node:timers/promises";

const port = process.env.MH_CDP_PORT || "9224";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
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
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const open = () => evaluate(`document.querySelector('#starfieldOverlay').classList.contains('open')`);

await send("Runtime.enable");
await send("Page.enable");

console.log("reload to pick up new JS");
await send("Page.reload");
await sleep(7000);
console.log("state:", await evaluate(`({
  starfield: document.querySelector('#starfieldOverlay').classList.contains('open'),
  tab: __mh.state.tab,
  playlists: __mh.state.remotePlaylists.length,
  roadmap: document.querySelector('#roadmapPct').textContent
})`));

if (!(await open())) {
  console.log("opening 星海 via top button");
  await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
  await sleep(2500);
}
console.log("starfield open:", await open());
console.log("body class:", await evaluate(`document.body.className`));

console.log("\n1) Esc in parent document");
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`, true);
await sleep(600);
console.log("   open after Esc:", await open());

console.log("\n2) Esc while focus is inside the iframe");
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(2500);
await evaluate(`(() => {
  const frame = document.querySelector('#starfieldFrame');
  const doc = frame.contentDocument;
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  return true;
})()`, true);
await sleep(600);
console.log("   open after iframe Esc:", await open());

console.log("\n3) click a sidebar tab");
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(2500);
console.log("   open before tab click:", await open());
await evaluate(`document.querySelector('[data-tab="recent"]').click()`, true);
await sleep(800);
console.log("   open after tab click:", await open(), "tab:", await evaluate(`__mh.state.tab`));

console.log("\n4) 星海 button toggles closed too");
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(2200);
console.log("   open:", await open());
await evaluate(`document.querySelector('#starfieldBtn').click()`, true);
await sleep(800);
console.log("   open after second click:", await open());

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
