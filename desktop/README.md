# 大肥鱼音乐管家 · 桌面壳（Electron）

## 为什么是 Electron

Tauri 是首选，但这台机器：

- 没有 Rust / cargo
- 没有 Visual Studio C++ Build Tools
- 当前用户不是管理员，装 VS Build Tools 会弹 UAC

所以先用 Electron 落地同一套桌面能力：窗口、托盘、单实例、媒体键、安装包/更新都有成熟方案，VS Code / Slack 也是 Electron。

## 已踩的坑（非常重要）

1. **Electron 不能从含中文的路径启动**
   - `D:\数据\...\desktop\node_modules\electron\dist\electron.exe` 会直接崩，错误 `crashpad_client_win.cc(867) not connected`
   - 复制到 `C:\etest`（纯 ASCII）后正常
   - 运行/打包必须用 ASCII 路径；安装包默认装到 `%LOCALAPPDATA%\Programs`，通常是 ASCII

2. **全局 `ELECTRON_RUN_AS_NODE=1`**
   - 这会把 Electron 当 Node 跑（`electron --version` 输出 Node 版本）
   - `launch.ps1` 和 `start.cmd` 都会先清空它

3. **DSH 作业对象会回收子进程**
   - 在 agent 里 `Start-Process electron`，命令结束进程就没了
   - 用后台常驻作业/用户双击才稳定；不要据此判断应用崩溃

4. **单实例锁**
   - 测试残留进程会占锁，新实例静默退出
   - 测试时可用 `MUSIC_HUB_NO_SINGLE=1`；正式运行不要设置

## 当前可运行版本

- 便携目录：`C:\DafeiyuMusicHub`
- 入口：`C:\DafeiyuMusicHub\launch.ps1`
- 桌面快捷方式：`大肥鱼音乐管家.lnk`（Electron）；旧 Edge 版已移到 `music-hub\_backup\shortcuts\大肥鱼音乐管家-浏览器.lnk`，需要时拖回桌面
- 后端仍指向：`D:\数据\deepseek-harness\default-workspace\music-hub`（`MUSIC_HUB_ROOT`）
- 窗口/托盘/单实例/媒体键在 `main.js`；页面还是 `web/` 那套，不重写 UI

## 开发流程

```powershell
# 改完 desktop/main.js 后同步到 ASCII 便携目录
.\scripts\sync-portable.ps1
# 双击桌面快捷方式，或：
C:\DafeiyuMusicHub\launch.ps1
```

> 直接跑 `desktop\start.cmd` 会先同步再启动；不要直接用 `node_modules\electron\dist\electron.exe` 从中文路径启动。

## 打包路线（下一步）

1. **PyInstaller 打包后端**
   - `music-hub-server.exe`，包含 FastAPI/uvicorn/mutagen
   - 设置 `MUSIC_HUB_DATA` 到 `%APPDATA%\DafeiyuMusicHub\data`，避免写 Program Files
2. `electron-builder --win nsis`，输出到 ASCII 目录（`C:\mh-dist`）
3. 安装包内置 `resources/backend/music-hub-server.exe`；`main.js` 已按这个路径查找
4. 代码签名、自动更新、文件关联

## 桌面透视

- 窗口：`transparent:true` + `frame:false` + `backgroundColor:"#00000000"`；带原生 frame 时客户区是黑的
- 设置页「桌面透视」三档：关闭 / 清晰（桌面清晰可见）/ 磨砂（Win11 亚克力，`setBackgroundMaterial("acrylic")`），不透明度 40–90%
- 窗口按钮页面自绘 `─ □ ✕`；透明窗口原生 maximize 不可靠，`□` 用 `setBounds(workArea)` 手动填充/还原，状态用 `filled` 布尔跟踪
- 星海 iframe：父页面 `syncPierceToStarfield()` 写 `data-pierce` / `--pierce-alpha`；`web/pierce.css` + `prototype/starfield.html` 同步透明
- 已知：清晰模式会透出后面所有窗口（不只是壁纸）；截图/录屏可能黑底

## 已验证

- 窗口加载 `http://127.0.0.1:8787`，标题「潮汐信 · 大肥鱼音乐管家」
- 托盘菜单：显示/播放暂停/上一首/下一首/设置/退出
- 单实例、关闭到托盘、媒体键注册
- 便携目录从 ASCII 路径启动正常；中文路径必崩
- 截图 `_shots/52-desktop-shell.png`、`53-desktop-portable.png`
