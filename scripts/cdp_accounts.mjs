/** Verify the onboarding and accounts screens against the live backend. */
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
  if (msg.method === "Page.javascriptDialogOpening") {
    send("Page.handleJavaScriptDialog", { accept: false }, sessionId).catch(() => {});
  }
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
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
await sleep(700);
await call("Page.reload", { ignoreCache: true });
await sleep(3500);

console.log(
  "boot:",
  await evaluate(`(() => ({
    onboarded: localStorage.getItem('mh.onboarded'),
    onboardOpen: document.querySelector('#onboardOverlay').classList.contains('open'),
    accountBtn: Boolean(document.querySelector('#accountBtn')),
    qqReady: window.__mh.state.online?.providers?.[0]?.ready,
    tracks: window.__mh.state.tracks.length,
  }))()`)
);

// first run (no library, no login) auto-opens the setup screen
console.log(
  "first-run gate:",
  await evaluate(`(async () => {
    localStorage.removeItem('mh.onboarded');
    const s = window.__mh;
    window.__savedTracks = s.state.tracks;
    s.state.tracks = [];
    s.state.online.providers[0].ready = false;
    s.state.online.providers[0].expired = false;
    await s.maybeShowOnboard();
    await new Promise((r) => setTimeout(r, 900));
    const opened = document.querySelector('#onboardOverlay').classList.contains('open');
    s.state.tracks = window.__savedTracks;
    await s.loadOnlineStatus();
    return opened;
  })()`)
);
await evaluate(`document.querySelector('#onboardOverlay').classList.remove('open')`);

// the setup screen is reachable from the accounts panel even after first run
await evaluate(`window.__mh.openOnboard()`, true);
await sleep(700);
console.log(
  "onboarding:",
  await evaluate(`(() => {
    const text = (sel) => (document.querySelector(sel)?.textContent || '').trim();
    return {
      open: document.querySelector('#onboardOverlay').classList.contains('open'),
      libState: text('#obLibState'),
      libHint: text('#obLibHint'),
      qqState: text('#obQqState'),
      qqNote: text('#obLoginNote'),
      loginLabel: text('#obLogin'),
      netease: text('#obStepNetease .ob-pill'),
    };
  })()`)
);
await shot("36-onboarding");

await evaluate(`document.querySelector('#obSkip').click()`, true);
await sleep(400);

await evaluate(`document.querySelector('#accountBtn').click()`, true);
await sleep(900);
console.log(
  "accounts:",
  await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.account-card')].map((card) => ({
      name: (card.querySelector('strong')?.textContent || '').trim(),
      meta: (card.querySelector('.account-id span')?.textContent || '').trim(),
      status: (card.querySelector('.ob-pill')?.textContent || '').trim(),
      actions: [...card.querySelectorAll('.account-actions button')].map((b) => b.textContent.trim()),
    }));
    return {
      open: document.querySelector('#accountOverlay').classList.contains('open'),
      cards,
      footer: document.querySelector('#accountUpdated').textContent.trim(),
    };
  })()`)
);
await shot("37-accounts");

// expired login must turn into “已失效” + a relogin action, not a console error
console.log(
  "expired state:",
  await evaluate(`(() => {
    const s = window.__mh;
    s.state.online = {
      providers: [{ name: 'qq', label: 'QQ 音乐', ready: false, expired: true,
        message: 'QQ 音乐登录已失效，请重新登录', account: null,
        session_updated_at: '2026-11-09T23:29:29+08:00' }],
      login: { running: false },
    };
    s.renderAccountList();
    s.renderOnlineState();
    const card = document.querySelector('.account-card');
    return {
      status: card.querySelector('.ob-pill')?.textContent,
      meta: card.querySelector('.account-id span')?.textContent,
      buttons: [...card.querySelectorAll('.account-actions button')].map((b) => b.textContent.trim()),
    };
  })()`)
);
await shot("38-accounts-expired");

// “waiting for scan” disables the button and shows the busy pill
console.log(
  "waiting state:",
  await evaluate(`(() => {
    const s = window.__mh;
    s.state.online.login = { running: true };
    s.renderOnlineState();
    s.renderAccountList();
    return {
      pill: document.querySelector('#obQqState').textContent,
      label: document.querySelector('#obLogin').textContent,
      disabled: document.querySelector('#obLogin').disabled,
      cardButton: document.querySelector('.account-card .account-actions button')?.textContent,
      cardDisabled: document.querySelector('.account-card .account-actions button')?.disabled,
    };
  })()`)
);
await evaluate(`(() => {
  const s = window.__mh;
  s.state.online.login = { running: false };
  s.renderOnlineState();
  s.loadOnlineStatus();
})()`);

// login when already connected must not spawn another window
await sleep(900);
const readyNow = await evaluate(`Boolean(window.__mh.state.online?.providers?.[0]?.ready)`);
if (readyNow) {
  const before = await evaluate(`window.__mh.state.online.login.running`);
  await evaluate(`window.__mh.startQqLogin()`, true);
  await sleep(800);
  console.log(
    "already-connected guard:",
    await evaluate(`({
      before: ${Boolean(before)},
      running: window.__mh.state.online.login.running,
      toast: document.querySelector('#toast').textContent,
    })`)
  );
} else {
  console.log("already-connected guard: skipped (status did not refresh in time)");
}

// invalid folder path keeps the onboarding step honest
await evaluate(`window.__mh.openOnboard()`, true);
await sleep(300);
await evaluate(`(() => {
  document.querySelector('#obPath').value = 'D:\\\\definitely-not-here';
  document.querySelector('#obAddFolder').click();
  return true;
})()`, true);
await sleep(1500);
console.log(
  "bad folder:",
  await evaluate(`({
    toast: document.querySelector('#toast').textContent,
    error: document.querySelector('#toast').classList.contains('error'),
  })`)
);
await shot("39-onboarding-error");

console.log("errors:", errors.slice(0, 6));
await send("Target.closeTarget", { targetId });
ws.close();
process.exit(0);
