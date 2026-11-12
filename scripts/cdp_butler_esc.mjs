/** Why didn't Esc close the butler drawer? */
import { setTimeout as sleep } from "node:timers/promises";

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

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

console.log("open:", await evaluate(`(() => { __mh.openButler('report'); return { state: __mh.state.butlerOpen, cls: document.querySelector('#butlerDrawer').className }; })()`));
await sleep(500);
console.log("after open:", await evaluate(`({ state: __mh.state.butlerOpen, cls: document.querySelector('#butlerDrawer').className })`));

console.log("direct closeButler:", await evaluate(`(() => { __mh.closeButler(); return { state: __mh.state.butlerOpen, cls: document.querySelector('#butlerDrawer').className }; })()`));

console.log("reopen:", await evaluate(`(() => { __mh.openButler('home'); return { state: __mh.state.butlerOpen }; })()`));
await sleep(300);
console.log("activeElement:", await evaluate(`document.activeElement && document.activeElement.tagName`));
console.log("dispatch Escape on document:", await evaluate(`(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  return { state: __mh.state.butlerOpen, cls: document.querySelector('#butlerDrawer').className, active: document.activeElement?.tagName };
})()`, true));
await sleep(400);
console.log("after esc:", await evaluate(`({ state: __mh.state.butlerOpen, cls: document.querySelector('#butlerDrawer').className })`));
console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
