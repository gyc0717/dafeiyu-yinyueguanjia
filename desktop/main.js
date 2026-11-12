/**
 * 大肥鱼音乐管家 · Electron 桌面壳
 *
 * 长期结构：
 *  - 开发时 spawn 项目 .venv 里的 uvicorn；
 *  - 打包时改为 resources/backend/music-hub-server.exe（PyInstaller sidecar）；
 *  - 窗口/托盘/单实例/媒体键在这里；网页本身仍是 web/ 那套。
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, dialog, shell, screen, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// 无窗口/后台方式启动时，stdout 可能是已关闭的管道；EPIPE 不能把主进程带崩。
process.stdout?.on("error", () => {});
process.stderr?.on("error", () => {});

// 验收脚本要用 CDP 驱动真实窗口（不是 headless 浏览器），默认不开。
if (process.env.MUSIC_HUB_DEBUG_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", String(process.env.MUSIC_HUB_DEBUG_PORT));
}

const PROJECT_ROOT = process.env.MUSIC_HUB_ROOT || path.resolve(__dirname, "..");
const BACKEND_URL = "http://127.0.0.1:8787";
const HEALTH_URL = `${BACKEND_URL}/api/health`;
const ICON_PNG = path.join(__dirname, "assets", "icon.png");
const ICON_ICO = path.join(__dirname, "assets", "icon.ico");

let win = null;
let normalBounds = null;
let filled = false;
let tray = null;
let backend = null;
let backendOwned = false;
let backendStarting = false;
let quitting = false;
let logStream = null;
let healthTimer = null;
let saveTimer = 0;
let hideHintShown = false;
let fullscreenMode = false;
let suppressMove = false;
let preFullscreenBounds = null;

ipcMain.on("mh:material", (_event, material) => {
  if (!win || win.isDestroyed()) return;
  try {
    win.setBackgroundMaterial(material === "acrylic" ? "acrylic" : "none");
    log(`background material: ${material}`);
  } catch (error) {
    log(`background material failed: ${error.message}`);
  }
});

ipcMain.on("mh:window", (_event, action) => {
  if (!win || win.isDestroyed()) return;
  if (action === "minimize") win.minimize();
  else if (action === "hide") hideWindow();
  else if (action === "quit") {
    quitting = true;
    app.quit();
  } else if (action === "maximize") toggleFill();
  else if (action === "close") win.close();
});

ipcMain.handle("mh:is-maximized", () => isFilled());

/* 右键按住空白处拖窗口：按下时记住「光标 - 窗口原点」的偏移，之后每 16ms 跟着系统光标挪。
 * 只改位置不改尺寸，窗口不会被边框撑大。 */
let dragState = null;

function beginWindowDrag() {
  if (!win || win.isDestroyed() || fullscreenMode) return;
  const [winX, winY] = win.getPosition();
  // 窗口被隐藏时 getPosition 会返回 -18286，别拿它算
  if (winX < -10000 || winY < -10000) return;
  const cursor = screen.getCursorScreenPoint();
  stopWindowDrag();
  dragState = {
    offsetX: cursor.x - winX,
    offsetY: cursor.y - winY,
    timer: 0,
  };
  dragState.timer = setInterval(() => {
    if (!win || win.isDestroyed() || !dragState) {
      stopWindowDrag();
      return;
    }
    const now = screen.getCursorScreenPoint();
    win.setPosition(Math.round(now.x - dragState.offsetX), Math.round(now.y - dragState.offsetY));
  }, 16);
  log(`window drag start ${JSON.stringify(win.getPosition())} cursor=${cursor.x},${cursor.y}`);
}

function stopWindowDrag() {
  if (!dragState) return;
  clearInterval(dragState.timer);
  dragState = null;
  saveWindowState();
  log("window drag end");
}

ipcMain.on("mh:drag-start", () => beginWindowDrag());
ipcMain.on("mh:drag-end", () => stopWindowDrag());
ipcMain.on("mh:fullscreen", (_event, on) => setAppFullscreen(Boolean(on)));

ipcMain.handle("mh:is-fullscreen", () => fullscreenMode);
ipcMain.handle("mh:bounds", () => (win && !win.isDestroyed() ? win.getBounds() : null));

/* setContentBounds 在 175% 缩放下会多算 1px；读回来补一次差值，反复进出全屏也不会越长越大。 */
function applyContentBounds(target) {
  win.setContentBounds(target);
  const actual = win.getContentBounds();
  const dx = actual.width - target.width;
  const dy = actual.height - target.height;
  if (dx || dy) {
    win.setContentBounds({
      x: target.x,
      y: target.y,
      width: Math.max(1100, target.width - dx),
      height: Math.max(700, target.height - dy),
    });
  }
}

/* 系统全屏（setFullScreen）在透明无边框窗口上时灵时不灵：事件会来，窗口却没变大。
 * 这里自己做：记下原位置 → 铺满整块屏幕 → 压到最上层（盖住任务栏）→ Esc 还原。 */
function setAppFullscreen(on) {
  if (!win || win.isDestroyed()) return;
  if (on === fullscreenMode) return;
  if (on) {
    suppressMove = true;
    preFullscreenBounds = win.getContentBounds();
    const display = screen.getDisplayMatching(win.getBounds());
    log(`fullscreen target ${JSON.stringify(display.bounds)} from ${JSON.stringify(preFullscreenBounds)}`);
    win.setContentBounds(display.bounds);
    win.setAlwaysOnTop(true);
    fullscreenMode = true;
    log(`app fullscreen on ${JSON.stringify(win.getContentBounds())} visible=${win.isVisible()}`);
  } else {
    suppressMove = true;
    win.setAlwaysOnTop(false);
    if (preFullscreenBounds) {
      applyContentBounds(preFullscreenBounds);
      preFullscreenBounds = null;
    }
    fullscreenMode = false;
    log(`app fullscreen off ${JSON.stringify(win.getContentBounds())} visible=${win.isVisible()}`);
  }
  win.webContents.send("mh:fullscreen-changed", fullscreenMode);
  setTimeout(() => { suppressMove = false; }, 120);
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

/* 窗口位置/大小记在 profile 里：下次打开还是上次那块地方，不用再拖一次。
 * 任务栏若是自动隐藏，workArea 会和整屏一样高，所以默认窗口要比整屏小一圈，
 * 底部留出 64px，任务栏才叫得出来。 */
function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function defaultBounds() {
  const area = workArea();
  const width = Math.min(1440, Math.max(1100, area.width - 64));
  const height = Math.min(900, Math.max(700, area.height - 64));
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
}

function visibleBounds(bounds) {
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null;
  // 取偶数：这台机器是 175% 缩放，内容尺寸换算会差 ±1px，落在同一个偶数上就不再累积。
  const width = Math.max(1100, Math.round(bounds.width / 2) * 2);
  const height = Math.max(700, Math.round(bounds.height / 2) * 2);
  const onScreen = screen.getAllDisplays().some((display) => {
    const a = display.workArea;
    return (
      bounds.x < a.x + a.width - 120 &&
      bounds.x + width > a.x + 120 &&
      bounds.y < a.y + a.height - 80 &&
      bounds.y + height > a.y + 40
    );
  });
  if (!onScreen) return null;
  return { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height };
}

function readSavedBounds() {
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return null;
  }
  const bounds = visibleBounds(saved);
  if (!bounds) return null;
  // 上次是铺满（或者比屏幕还大）就把这一条当脏数据丢掉：
  // 否则下次启动又把整屏盖住，任务栏还是叫不出来。
  const area = workArea();
  if (bounds.width >= area.width - 8 || bounds.height >= area.height - 8) return null;
  return bounds;
}

function saveWindowState() {
  if (!win || win.isDestroyed() || quitting) return;
  // 全屏中的尺寸不是用户想要的尺寸，别记它。
  if (fullscreenMode) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || fullscreenMode) return;
    try {
      // 铺满时记「还原后的大小」，否则下次启动又变成压住任务栏的整屏。
      // 用内容尺寸而不是窗口尺寸：无边框窗口的窗口尺寸含不可见边框，
      // 每次读写都会长大几像素，几十次启动就会自己铺满整屏。
      const bounds = filled && normalBounds ? normalBounds : win.getContentBounds();
      // 进程被杀 / 窗口正在销毁时读到的是 -18286 和 0×0，别把它写进状态文件。
      if (!(bounds.width > 200 && bounds.height > 200) || bounds.x < -10000) return;
      // DPI 换算会带 ±1px 的来回抖动；差得很少就保留原值，别让窗口一点点长大。
      const prev = readSavedBounds();
      const keys = ["x", "y", "width", "height"];
      const same = prev && keys.every((key) => Math.abs(prev[key] - bounds[key]) <= 2);
      fs.writeFileSync(stateFile(), JSON.stringify({ ...(same ? prev : bounds), filled }, null, 2));
    } catch (error) {
      log(`save window state failed: ${error.message}`);
    }
  }, 400);
}

/* 点 X 只是收进托盘，音乐不断。第一次这么做的时候用系统气泡说一声，
 * 免得用户以为软件已经关了、实际还在后台放歌。 */
function hintHiddenToTray() {
  if (hideHintShown || !tray) return;
  hideHintShown = true;
  try {
    tray.displayBalloon({
      title: "大肥鱼已收进托盘",
      content: "音乐继续播放。双击托盘图标唤回窗口，托盘右键 →「退出」才会真的关掉。",
    });
  } catch (error) {
    log(`tray balloon failed: ${error.message}`);
  }
}

function isFilled() {
  return filled;
}

function toggleFill() {
  if (!win || win.isDestroyed()) return;
  if (!filled) {
    normalBounds = win.getContentBounds();
    const area = workArea();
    // 自动隐藏的任务栏不占 workArea，铺满会把弹出条压住；留 1px 让它能被激活。
    const display = screen.getPrimaryDisplay();
    const autoHide = area.height >= display.bounds.height;
    win.setContentBounds(autoHide ? { ...area, height: area.height - 1 } : area);
    filled = true;
  } else {
    const area = workArea();
    const target = normalBounds || {
      x: area.x + Math.round((area.width - 1440) / 2),
      y: area.y + Math.round((area.height - 900) / 2),
      width: Math.min(1440, area.width),
      height: Math.min(900, area.height),
    };
    win.setContentBounds(target);
    filled = false;
  }
  log(`window fill: ${filled} ${JSON.stringify(win.getBounds())}`);
  saveWindowState();
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (!logStream) {
      const dir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(dir, { recursive: true });
      logStream = fs.createWriteStream(path.join(dir, "desktop.log"), { flags: "a" });
      logStream.on("error", () => {
        logStream = null;
      });
    }
    logStream.write(line);
  } catch {
    /* ignore */
  }
  try {
    console.log(line.trim());
  } catch {
    /* stdout may be a closed pipe */
  }
}

async function isBackendUp() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body && body.ok);
  } catch {
    return false;
  }
}

async function waitForBackend(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isBackendUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function backendCommand() {
  // 便携版 / 安装版都按「sidecar 存在就用它」判断，不只看 app.isPackaged：
  // 便携版是 electron.exe + app/ 直接跑，isPackaged 是 false。
  const sidecar = path.join(process.resourcesPath, "backend", "music-hub-server.exe");
  if (app.isPackaged || fs.existsSync(sidecar)) {
    const exe = sidecar;
    // 打包版：数据写到用户目录，安装目录可能是只读的 Program Files
    const dataDir = path.join(app.getPath("userData"), "data");
    return {
      command: exe,
      args: [],
      cwd: path.dirname(exe),
      env: { MUSIC_HUB_DATA: dataDir, MUSIC_HUB_ROOT: path.dirname(exe) },
    };
  }
  const python = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  return {
    command: python,
    args: ["-m", "uvicorn", "server.main:app", "--host", "127.0.0.1", "--port", "8787"],
    cwd: PROJECT_ROOT,
  };
}

async function ensureBackend() {
  if (await isBackendUp()) {
    log("backend already running; reuse");
    return true;
  }
  const { command, args, cwd, env: extraEnv } = backendCommand();
  if (!fs.existsSync(command)) {
    log(`backend command missing: ${command}`);
    return false;
  }
  log(`spawn backend: ${command} ${args.join(" ")}`);
  backend = spawn(command, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(extraEnv || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backendOwned = true;
  backend.stdout.on("data", (chunk) => log(`backend: ${chunk.toString().trim()}`));
  backend.stderr.on("data", (chunk) => log(`backend! ${chunk.toString().trim()}`));
  backend.on("exit", (code) => {
    log(`backend exited: ${code}`);
    backend = null;
    backendOwned = false;
  });
  backend.on("error", (error) => {
    log(`backend spawn error: ${error.message}`);
    backendOwned = false;
  });
  return waitForBackend();
}

function stopBackend() {
  if (!backend || !backendOwned) return;
  log("stop backend");
  const proc = backend;
  const pid = backend.pid;
  backend = null;
  backendOwned = false;
  try {
    if (process.platform === "win32") {
      // 不能依赖 PATH（无窗口启动时可能缺 System32），用绝对路径并接住异步 error。
      const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
      if (pid) {
        const child = spawn(taskkill, ["/pid", String(pid), "/t", "/f"], { windowsHide: true });
        child.on("error", (error) => {
          log(`taskkill failed: ${error.message}`);
          try {
            proc.kill();
          } catch {
            /* ignore */
          }
        });
      }
    } else {
      proc.kill("SIGTERM");
    }
  } catch (error) {
    log(`stop backend failed: ${error.message}`);
  }
}

async function playerCommand(code) {
  if (!win || win.isDestroyed()) return;
  try {
    await win.webContents.executeJavaScript(`window.__mh && (${code})`, true);
  } catch (error) {
    log(`player command failed: ${error.message}`);
  }
}

function buildTray() {
  const icon = nativeImage.createFromPath(ICON_PNG).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("大肥鱼音乐管家");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示主窗口", click: () => showWindow() },
      { type: "separator" },
      { label: "播放 / 暂停", click: () => playerCommand("window.__mh.player.toggle()") },
      { label: "停止", click: () => playerCommand("window.__mh.player.stop()") },
      { label: "上一首", click: () => playerCommand("window.__mh.player.prev()") },
      { label: "下一首", click: () => playerCommand("window.__mh.player.next()") },
      { type: "separator" },
      { label: "打开设置", click: () => showWindow().then(() => playerCommand("window.__mh.openSettings()")) },
      { label: "星海面板", click: () => showWindow().then(() => playerCommand("window.__mh.openStarfieldPanel()")) },
      { label: "退出", click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on("click", () => showWindow());
  tray.on("double-click", () => showWindow());
}

function showWindow() {
  if (!win || win.isDestroyed()) return Promise.resolve();
  if (win.isMinimized()) win.restore();
  // 透明窗口从隐藏状态 show() 回来时，DWM 有时会留下上一帧的「截图」，
  // 或者干脆不重绘；用一次 0 → 1 的不透明度跳变逼它重新合成。
  try {
    win.setOpacity(0);
    win.show();
    win.setOpacity(1);
  } catch {
    win.show();
  }
  win.focus();
  log(`showWindow -> visible=${win.isVisible()} minimized=${win.isMinimized()} pos=${JSON.stringify(win.getPosition())}`);
  return Promise.resolve();
}

function hideWindow() {
  if (!win || win.isDestroyed()) return;
  stopWindowDrag();
  if (fullscreenMode) setAppFullscreen(false);
  saveWindowState();
  try {
    win.setOpacity(0);
    win.hide();
    win.setOpacity(1);
  } catch {
    win.hide();
  }
  hintHiddenToTray();
}

async function createWindow() {
  const saved = readSavedBounds();
  const bounds = saved || defaultBounds();
  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    // 存的是内容尺寸：无边框窗口的窗口尺寸含不可见边框，反复读写会一启动大几像素。
    useContentSize: true,
    minWidth: 1100,
    minHeight: 700,
    // 透明透视：客户区必须无边框；关闭透视时由页面铺不透明底，避免桌面从侧栏误透。
    transparent: true,
    frame: false,
    backgroundColor: "#00000000",
    hasShadow: false,
    title: "大肥鱼音乐管家",
    icon: ICON_ICO,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => {
    showWindow();
    log("window shown (ready-to-show)");
  });
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideWindow();
  });
  win.on("resize", saveWindowState);
  win.on("move", saveWindowState);
  // 全屏时按住往下拖 = 想把它变回普通窗口：立刻还原尺寸，再把窗口挂到光标下面继续拖。
  win.on("move", () => {
    if (!fullscreenMode || suppressMove) return;
    const cursor = screen.getCursorScreenPoint();
    setAppFullscreen(false);
    const b = win.getContentBounds();
    win.setPosition(Math.round(cursor.x - b.width / 2), Math.max(8, Math.round(cursor.y - 28)));
    log(`fullscreen drag-out -> ${JSON.stringify(win.getBounds())}`);
    saveWindowState();
  });
  win.on("enter-full-screen", () => {
    log("fullscreen on");
    win.webContents.send("mh:fullscreen-changed", true);
  });
  win.on("leave-full-screen", () => {
    log("fullscreen off");
    win.webContents.send("mh:fullscreen-changed", false);
    saveWindowState();
  });
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // 页面里如果有外链，别把整个应用窗口导航走；交给系统浏览器。
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(BACKEND_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on("did-fail-load", () => {
    if (!win || win.isDestroyed()) return;
    setTimeout(() => win.loadURL(BACKEND_URL), 800);
  });

  try {
    // 开发期前端改动频繁，启动时清一次 HTTP 缓存，避免 Electron 吃旧 app.js。
    await win.webContents.session.clearCache();
  } catch (error) {
    log(`clear cache failed: ${error.message}`);
  }
  await win.loadURL(BACKEND_URL);
  // 透明窗口的 ready-to-show 偶尔不来（页面没触发首帧），窗口就会一直藏着；
  // 加载完成再兜一次，避免“点了图标没反应”。
  if (!win.isVisible()) {
    showWindow();
    log("window shown (load fallback)");
  }
  // 旧版本把 0.8 缩放写进了 profile，按 origin 持久化；显式改回 1x，避免新窗口继续被放大。
  win.webContents.setZoomFactor(1);
  // 启动用「上次的大小、或者比整屏小一圈的默认窗口」，不再自动铺满整屏：
  // 铺满会压住自动隐藏的任务栏，看起来像一张贴在桌面上的截图。
  log(`window bounds: ${JSON.stringify(win.getContentBounds())}`);
  normalBounds = win.getContentBounds();
  filled = false;
  log("window loaded");
}

async function main() {
  app.setAppUserModelId("com.dafeiyu.musichub");
  const ok = await ensureBackend();
  if (!ok) {
    dialog.showErrorBox(
      "后端没有启动",
      app.isPackaged
        ? "找不到内置的 music-hub-server.exe，安装包不完整。"
        : "请确认 .venv 存在，或先运行 start.cmd 看错误日志。"
    );
    app.quit();
    return;
  }
  await createWindow();
  buildTray();

  // The backend can disappear (crashed, killed, port stolen). Poll it and bring it
  // back, otherwise the window silently turns into an empty list.
  healthTimer = setInterval(async () => {
    if (quitting || backendStarting) return;
    if (await isBackendUp()) return;
    log("backend is down; restarting");
    backendStarting = true;
    try {
      const back = await ensureBackend();
      log(back ? "backend restarted" : "backend restart failed");
    } catch (error) {
      log(`backend restart error: ${error.message}`);
    } finally {
      backendStarting = false;
    }
  }, 8000);

  // Media keys: Electron only accepts these four names (MediaFastForward/MediaRewind
  // throw at registration), so forward/rewind live on the page's Media Session handlers.
  const shortcuts = [
    ["MediaPlayPause", "window.__mh.player.toggle()"],
    ["MediaNextTrack", "window.__mh.player.next()"],
    ["MediaPreviousTrack", "window.__mh.player.prev()"],
    ["MediaStop", "window.__mh.player.stop()"],
  ];
  for (const [name, code] of shortcuts) {
    try {
      const ok = globalShortcut.register(name, () => playerCommand(code));
      log(`media key ${name}: ${ok ? "registered" : "rejected (already taken?)"}`);
    } catch (error) {
      log(`media key ${name} failed: ${error.message}`);
    }
  }
}

const gotLock = process.env.MUSIC_HUB_NO_SINGLE === "1" ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(main).catch((error) => {
    log(`main failed: ${error.stack || error.message}`);
    dialog.showErrorBox("启动失败", String(error.message || error));
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (quitting) app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (healthTimer) clearInterval(healthTimer);
  globalShortcut.unregisterAll();
  stopBackend();
});
