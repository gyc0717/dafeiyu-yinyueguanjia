/** Tidy UI: plan → exec bar → (cancelled) → history. Never actually moves files. */
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

await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8787/" });
await sleep(6500);

await evaluate(`__mh.openButler('tidy')`, true);
await sleep(500);
await evaluate(`document.querySelector('#butlerPlanRun').click()`, true);
await sleep(2200);
console.log("plan:", await evaluate(`({
  execVisible: !document.querySelector('#tidyExecBar').hidden,
  hint: document.querySelector('#tidyExecHint')?.textContent,
  btn: document.querySelector('#tidyStartBtn')?.textContent,
  progressHidden: document.querySelector('#tidyProgress').hidden,
  historyHidden: document.querySelector('#tidyHistory').hidden
})`));
await shot("123-tidy-plan-ready");

// say no to the confirm: nothing may be created
await evaluate(`window.confirm = () => false`, true);
const before = await evaluate(`__mh.api.tidyRuns().then((d) => d.items.length)`);
await evaluate(`document.querySelector('#tidyStartBtn').click()`, true);
await sleep(1200);
const after = await evaluate(`__mh.api.tidyRuns().then((d) => d.items.length)`);
console.log("cancelled:", { before, after, same: before === after });

// now actually create a run (freezes the plan, moves nothing) and check the history row
const created = await evaluate(`__mh.api.tidyRunCreate(null, 'hybrid').then((r) => r)`);
console.log("created run:", created?.run_id, "planned:", created?.summary?.planned);
await evaluate(`document.querySelector('#butlerPlanRun').click()`, true);
await sleep(2200);
console.log("history:", await evaluate(`({
  rows: document.querySelectorAll('#tidyHistory .th-row').length,
  first: document.querySelector('#tidyHistory .th-row')?.textContent?.replace(/\\s+/g, ' ').trim(),
  hasUndo: Boolean(document.querySelector('#tidyHistory .th-row button'))
})`));
await shot("124-tidy-history");

console.log("errors:", errors.slice(0, 4));
ws.close();
process.exit(0);
