# 大肥鱼音乐管家 · 打包说明

两种产物，按当前机器条件选：

## 1. 便携版（现在就能出，`scripts/package-portable.ps1`）

```
dist/大肥鱼音乐管家/
  electron.exe            ← 从 C:\DafeiyuMusicHub 复制
  resources/app/          ← desktop/ 同步过来的壳
  resources/backend/      ← music-hub-server.exe + web/ + data/（PyInstaller 产物）
  launch.ps1              ← 设置 MUSIC_HUB_ROOT 后启动
  大肥鱼音乐管家.vbs       ← 双击启动（无控制台窗口）
```

生成：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable.ps1
```

产物是一个可以直接压成 zip 分发的文件夹，不写注册表、不需要管理员权限。

## 2. 安装包（需要 npm + electron-builder，本机暂缺）

`package.json` 里的 `build` 段已经写好了 electron-builder 配置（NSIS、按用户安装、图标、`extraResources` 指向 `dist/music-hub-server`）。等装了 Node 工具链（`npm i -D electron-builder`）后：

```bash
npm run dist      # 产出 dist/大肥鱼音乐管家-Setup-0.2.0.exe
```

electron-builder 会把 `dist/music-hub-server/**` 复制到 `resources/backend/`，主进程在 `app.isPackaged` 时会启动这个 exe（见 `desktop/main.js` 的 `backendCommand()`），数据目录落在 `%APPDATA%/大肥鱼音乐管家/data`。

## 后端 sidecar 单独构建

```powershell
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onedir `
  --name music-hub-server --distpath dist --workpath build\pyi --specpath build `
  --paths . --collect-submodules server --collect-all uvicorn packaging\backend_entry.py

Copy-Item -Recurse -Force web dist\music-hub-server\web
```

入口是 `packaging/backend_entry.py`：`MUSIC_HUB_ROOT` 指向 exe 同级目录（`web/` 在那里），`MUSIC_HUB_DATA` 默认 `<exe>/data`，Electron 打包版会把它改到用户目录。

产物实测：`music-hub-server.exe --port 8799` 启动后 `/api/health` 返回 `{"ok":true,"tracks":44}`，`/` 和 `/assets/js/app.js` 都是 200。
