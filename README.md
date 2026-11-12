# 大肥鱼 · 音乐管家（自研版）

独立界面的音乐管家。已跑通：

- **里程碑 1**：本地曲库扫描、播放、沉浸歌词、听歌记录
- **里程碑 2（QQ 音乐）**：在线搜索、取直链、后端代理播放、在线歌词/封面
- **路线图**：顶栏进度胶囊 + 里程碑面板；数据来自 `data/roadmap.json`，手动维护、非代码统计
- **外观**：`web/tokens.css` 令牌；默认平色深色，玻璃拟态为可选皮肤（右上角 / `G` 切换）

- 后端：Python 3.12 + FastAPI + SQLite（`server/`）
- 前端：原生 ESM + CSS，无构建步骤（`web/`）
- 端口：`127.0.0.1:8787`

---

## 快速开始

```powershell
cd D:\数据\deepseek-harness\default-workspace\music-hub

# 方式一
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8787

# 方式二（自动打开浏览器，推荐）
.\start.cmd

# 方式三（Edge App 窗口；旧入口，桌面快捷方式现在走 Electron 壳）
.\start-app.cmd

# 直接跑 PowerShell；系统执行策略会拦未签名脚本时用上面的 start.cmd
.\start.ps1
```

打开 <http://127.0.0.1:8787>。首次启动若本地库为空会自动扫描一次；日常扫描在「设置 → 立即扫描曲库」。
桌面快捷方式：**「大肥鱼音乐管家」** 指向 `C:\DafeiyuMusicHub` 的 Electron 桌面壳（旧 Edge App 入口备份为 `大肥鱼音乐管家-浏览器.lnk`）。

### 桌面壳（Electron）

- 便携目录：`C:\DafeiyuMusicHub`（Electron 运行时 + `app/`，体积约 260 MB）
- 桌面快捷方式：`大肥鱼音乐管家.lnk` → `C:\DafeiyuMusicHub\launch.ps1`（隐藏 PowerShell）
- 窗口/托盘/单实例/媒体键在 `desktop\main.js`；页面仍是 `web/`，不重写 UI
- 媒体键：`MediaPlayPause / MediaNextTrack / MediaPreviousTrack / MediaStop`（Electron 只认这四个名字，`MediaFastForward`、`MediaRewind` 注册会抛错）；页面侧 `navigator.mediaSession` 另挂了 `play / pause / stop / previoustrack / nexttrack / seekto / seekbackward / seekforward` 与 `setPositionState`，Windows 媒体浮层有歌名/封面/进度
- **Electron 不能从含中文的路径启动**（crashpad 崩溃）；必须用 ASCII 路径。改完 `desktop/main.js` 后跑 `desktop\sync-portable.ps1`，再双击快捷方式
- 后端仍用项目 `.venv`（`MUSIC_HUB_ROOT`）；PyInstaller sidecar/安装包还没做
- Tauri 需要 Rust + VS Build Tools，本机没有管理员权限，暂缓

**窗口行为（2026-11-12 修）**

| 动作 | 行为 |
|---|---|
| 启动 | 窗口化挂在**上次的大小和位置**（`profile\window-state.json`），不再自动铺满整屏；屏幕小于默认值时自动缩一圈 |
| 全屏按钮 | 只把**整个软件界面**铺满屏幕（自己实现：记住原位置 → 铺满 → 置顶盖住任务栏），不再跳进歌词页；`Esc` 退出并还原原来的大小/位置 |
| ✕ | **收进托盘**：窗口关掉、音乐继续放、后端不重启；第一次会弹系统气泡说明。再点桌面图标/双击托盘 → 窗口秒回，不用等后端 |
| 托盘右键「退出」 | 真正退出（`before-quit` 里停后端） |
| 铺满（□/全屏） | 任务栏自动隐藏时底部留 1px，免得弹出条被压住 |
| 点封面 | 窗口内整屏歌词；不劫持系统全屏 |

两个坑，别再踩：

- 透明无边框窗口 `hide()` 之后再 `show()`，Windows 上偶尔会留上一帧的「截图」或者干脆不重绘 → `showWindow()` / `hideWindow()` 里用一次 `setOpacity(0) → show/hide → setOpacity(1)` 逼它重新合成
- **`setFullScreen()` 在透明窗口上时灵时不灵**：`enter-full-screen` 事件会来、`body.mh-fullscreen` 也会亮，但窗口尺寸不变（实测 1452×911 一动不动）。所以全屏改成自己做：`setContentBounds(display.bounds)` + `setAlwaysOnTop(true)`，退出时还原并 `setAlwaysOnTop(false)`
- 窗口尺寸要存 **`getContentBounds()`** 并配 `useContentSize: true`：存 `getBounds()`（含不可见边框）每次启动会长 3–4px，几十次启动就自己铺满、压住任务栏；175% 缩放下 `setContentBounds` 还会多算 1px，所以 `applyContentBounds()` 会读回来补一次差值（实测连续 3 次进出全屏稳在 1444×904 ↔ 1647×1030）

### 首页 / 播放页 / 歌词页 / 星海

四个页面，名字就这么叫，别再混：

| 页面 | 是什么 | 怎么进 / 怎么回 |
|---|---|---|
| **首页** | 落地页：问候语、正在播放卡、四个快捷入口、今日数字、星海入口、最近播放 | 启动即这里；任何页面按 `Esc` 或顶栏都能回来 |
| **播放页** | 大封面 + 歌词预览 + 播放控制 | 首页「打开播放页」、侧栏点歌自动切过来 |
| **歌词页** | 整屏歌词（`F` / 点封面进） | `Esc` / 左上「返回」回播放页 |
| **星海** | 原生星图 | 首页「进入星海」或顶栏「星海」；顶栏变「返回首页」、`Esc` 都回首页 |

- 首页在 `web/index.html` 的 `#homeView`，逻辑在 `app.js` 的 `showView() / updateHome()`；「正在播放」卡、四个数字、最近播放都跟播放器实时同步
- 首页四个入口：星海探索（进星海）、搜歌点播（管家·搜歌）、曲库管理（回播放页 + 最近播放）、本周报告（管家·周报）
- 侧栏点一首歌会自动切到播放页；顶栏「星海」在星海内变成「返回首页」
### 星海（原生视图）

- 顶栏「星海」打开的是主界面里的**一个原生视图**：一块 canvas 星图 + 一条共用的播放底栏，不再是 iframe 套原型
- 播放、队列、当前曲目全部走主 `Player`：进星海不停播，点星 `playNow()` 不换队列，双击星直接播
- 导航只有一层：侧栏切内容、星海/管家在顶栏；原型那根 64px 图标栏随着 iframe 一起下线
- 退出：顶栏「星海」变「返回首页」、`Esc`、点侧栏任意 tab 都行
- 筛选（全部 / 本地 / QQ）、搜索、滚轮缩放、拖动平移、点星出卡（播放 / 下一首播放）都在
- 星图数据 = 本地曲库 + 队列里已经出现过的在线曲目；不额外发请求、不编造在线数据
- `web/js/starfield.js` 负责画和选中；原型 `web/prototype/starfield.html` 仍保留在 `/assets/prototype/starfield.html` 作为设计参考，但已不在任何入口里
- 截图：`_shots/132-starfield-native.png`、`133-starfield-card.png`

### 设置与备份

- 左下角齿轮打开设置：曲库目录、数据备份、玻璃皮肤、版本信息
- 「立即备份」把 `music_hub.db` 快照到 `data/backups/`；启动时每天自动一份 `auto-YYYYMMDD.db`
- 恢复前会先自动生成 `pre-restore-*.db`，再覆盖当前数据库；恢复后页面自动刷新
- 备份目录可直接打开；旧备份可删

### 星海原型（独立页面）

<http://127.0.0.1:8787/assets/prototype/starfield.html>

- 首页 / 星海 / 曲库 / 搜歌 / 周报 + 底部播放条 + 全屏歌词
- 星海按平台着色（本地橙 / QQ 蓝），点星出卡片，双击播放，滚轮缩放、拖拽平移
- 数据走现有 API：46 首本地 + 18 首 QQ（打开时自动搜「晴天」补在线星；断网会退回示意数据）
- 独立原型，不改 `/` 主界面；截图 `_shots/35..42-starfield-*`
- 已知：网易云/酷狗未接；星海位置目前按平台分区，不是按曲风语义聚类

### 网易云音乐（2026-11-12 接入）

- 侧栏「在线」tab 里多了 **QQ 音乐 / 网易云** 两个切换，选网易云后搜索、点播都走它
- 搜索 / 歌词 / 播放直链都走明文接口（`server/providers/netease.py`），**不需要登录**
- 免费歌能直接播 128k；少数 VIP / 地区限制歌接口返回 `code=404` + 空 url，界面提示「拿不到播放地址（可能是 VIP / 版权限制）」
- 在线曲目和 QQ 一样落进统一 `tracks` 表（`provider='netease'`），队列、最近播放、歌词、收藏全部复用
- `GET /api/online/search?provider=netease&q=晴天` 实测 24 条；`/api/stream/{id}` 返回 `audio/mpeg` 4.3 MB
- 酷狗还没接（`https` 有证书 hostname 不匹配，得走 `http` + `mid/dfid` cookie，下一步做）
### QQ 音乐登录

**不需要碰命令行**：首次启动会弹「首次启动」引导，第二步点「扫码登录」，后端会拉起 `qqmusic-mcp login` 打开浏览器窗口，扫码后自动回来；也能在左下角「账号与连接」里随时重登/退出。

- 登录态路径：`%LOCALAPPDATA%\QQMusicOrganizer\session.dpapi`（DPAPI，仅当前 Windows 用户可解密）
- 引导页允许「先跳过，进播放器」——本地曲库不需要登录
- 「账号与连接」显示脱敏账号、登录时间、已连接/未连接/已失效；失效时按钮变成「失效，点此重登」
- 登录态过期由搜索/播放的 401 触发标记，界面会提示重新登录，不用重启服务
- 换登录态路径可用 `MUSIC_HUB_QQ_SESSION`，换 CLI 路径可用 `MUSIC_HUB_QQ_CLI`

命令行兜底（仅调试用）：

```powershell
& D:\mcp\qqmusic-venv\Scripts\qqmusic-mcp.exe login
```

`GET /api/online/status` 额外返回 `session_updated_at / message / expired`：

```json
{"providers":[{"name":"qq","label":"QQ 音乐","ready":true,"account":"3613****80",
 "session_exists":true,"session_updated_at":"2026-11-09T23:29:29+08:00","message":null,"expired":false}],
 "login":{"running":false,"exit_code":null,"cli":"D:\\mcp\\qqmusic-venv\\Scripts\\qqmusic-mcp.exe"}}
```

### 曲库目录

`data/config.json` 的 `library_roots`，默认三处：

1. `C:\Users\gyc20\Music`
2. `D:\数据\xwechat_files\...\msg\file`（微信收到的音频）
3. `data/demo-music`（生成的演示曲）

也可以临时覆盖：

```powershell
$env:MUSIC_HUB_ROOTS = "D:\Music;E:\无损"
```

改完重启或到「设置 → 立即扫描曲库」。扫描是增量的（mtime + size），文件被删除后会从库里清掉。

### 演示曲

`scripts/make_demo_audio.py` 用正弦波合成三首原创曲，并生成封面、`.lrc`：

- 《夜航》150s，76 BPM，16 句时间轴歌词
- 《潮汐信》148s，84 BPM，16 句
- 《蓝色房间》132s，纯器乐（用来看无歌词状态）

```powershell
.\.venv\Scripts\python.exe scripts\make_demo_audio.py
# 只重画封面并回写 ID3：--covers-only
```

### 依赖

`requirements.txt` 固定版本。正常安装：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
```

这台机器上 pip 从镜像下载会卡住，`wheels/` 里已放好全部离线包：

```powershell
.\.venv\Scripts\python.exe -m pip install --no-index --find-links wheels -r requirements.txt
```

---

## 现在能做什么

### 本地

- 扫描 mp3 / flac / m4a / ogg / opus / wav / aac / wma / ape
- 读 ID3 / Vorbis / MP4 标签；无标签时按「歌手 - 歌名」拆文件名
- 内嵌封面提取到 `data/covers/`；无封面时用标题首字 + 渐变占位
- 同名 `.lrc` 解析：多时间戳、`[offset:]`、去重、排序
- 主界面**不显示「曲库」tab**：默认「最近播放」；本地歌通过搜索、队列、最近播放进入；扫描/目录管理在设置里
- 列表搜索（歌名/歌手/专辑）、最近播放、播放队列
- 播放 / 暂停 / 上一首 / 下一首 / 音量；**播放模式收成一个入口**（顺序播放 / 列表循环 / 单曲循环 / 随机播放），图标跟着当前模式变，收藏单独一颗心（走查 D-2）
- **删除键**：列表每行右侧悬停出现垃圾桶，点了先弹确认：本地曲目把文件**移到回收站**（可从回收站还原）并从曲库摘掉；在线曲目只从曲库移除、不动任何文件；只允许删曲库目录里的文件
- **跨平台同曲归并**：同一首歌在 QQ / 网易云 / 本地共用 `work_key`（`server/works.py`：全半角 + 小写 + 去括号注释 + 去标点，`歌名|歌手`）。收藏按首算：喜欢任一平台那条，三个平台一起点亮；从任一平台取消，一起取消；收藏列表每首只出一行（优先本地文件）
- **侧栏可收起**：侧栏底部 `←` 箭头收起，左边缘留一条 `→` 把手召回；状态存 `mh.sidebarHidden`，刷新/重启后保持
- 队列：插队（每行 `↳`）、拖动排序、循环 / 随机
- **断点续播**：关掉再开回到上次那首那个位置，显示「上次 1:23」
- 进度条拖动、点击跳转
- **全屏沉浸歌词**：`F` / 点封面 / 双击封面进入，自动跟随、拖动/滚轮浏览、松手**从那一句开始播放**（拖完直接出声，不用再点播放）
- **歌词页的控制条**：上一首 / 播放暂停 / 下一首 三个图标放在**进度条这一行**（QQ 音乐那种），时间在右侧；右上角只留歌词时钟补偿，桌面壳里也会给窗口按钮（− □ ✕）让位，避免误触 ✕
- **逐字高亮**：当前行按字推进（已唱亮、未唱暗）。有逐字时间轴（增强 LRC `<mm:ss.xx>`，如 `[00:12.34]<00:12.34>你<00:12.90>好`）就用真实时间；没有的话把这一行的时长按字宽铺到字上（估算，不改动行时间）
- **歌词时钟补偿**：`−0.5s / +0.5s`，按曲记忆，解决 LRC 整体快慢
- 播放记录：开始 → 每 5s 进度 → 结束；播放 ≥85% 记 `completed=1`
- 真实 M4A 兜底：部分微信文件 mutagen 读不出时长，用 MP4 `mvhd` 原子手算
- 浏览器拿到真实时长后回填数据库

### QQ 音乐在线

- 左侧第三个 tab「在线 QQ」，输入歌名/歌手直接搜（默认 24 条）
- 结果带封面、专辑、时长；点一首就能播
- 直链通过后端 `/api/stream/{id}` 代理（Range / HEAD，浏览器不需要碰 Referer）
- 在线歌词自动抓取并缓存到 `tracks.lyrics`，全屏歌词页与本地曲目一致
- 在线曲目落进同一张 `tracks` 表（`provider='qq'`），**队列、最近播放、播放记录、封面、歌词全部复用**
- 本地曲库默认只返回 `provider='local'`，不会被在线搜索结果污染
- 在线播放也写 `play_events`，`provider` 区分来源

### 歌单（登录后自动出现）

- 登录 QQ 后，左侧「歌单」tab **自动列出** QQ 自建歌单（含「我喜欢」），不需要手动导入
- 点开一个歌单才开始加载曲目；「我喜欢」2325 首第一次约 2 秒，之后走**服务端 24 小时快照**，刷新页面也不重新拉 QQ
- 列表先渲染 140 行，滚到底自动续 140 行，不再一次性创建 2000 多个 DOM
- 点开先出 8 行骨架屏，同一歌单 5 分钟内二次打开走内存缓存（约 10ms）
- 音频仍然在线播放（`/api/stream` 代理），**不是下载**；断网、登录失效、会员过期就播不了
- 旧版导入到本地的歌单仍保留在「已保存到本地」分组，可 `×` 移除；新流程不再需要它
- 「播放全部」直接把当前歌单送进队列
- 打开歌单后列表上方多一行「返回歌单 / 播放全部 / 同步」：右边小字显示快照时间（`同步于 3 分钟前`）
- **「同步」按钮**：强制从 QQ 重新读这个歌单并重写 24h 快照，结果用 toast 报差异（`已同步：+2 首，−1 首（共 2327 首）`）
- **「另存为我的歌单」**：把当前 QQ 歌单复制成本地可编辑歌单（同名重复另存是更新那一个，不会多出一堆；你自己改过的名字不会被覆盖）
- **编辑本地歌单**：拖行排序（HTML5 拖放，落点有蓝线）、「选择」进去后点多选、「全选 / 移除」、改名、新建空歌单、删歌单
- 只有本地歌单能编辑；QQ 歌单是只读快照，`另存为` 之后随便折腾都不影响 QQ 那边
- 快照曲目数和 QQ 报的数量不一致时，小字变琥珀色提示 `QQ 现为 2327 首 · 快照 2325 首，点「同步」`，不用等 24h 过期

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 + 本地曲目数 |
| GET | `/api/config` | 生效的曲库根 |
| GET | `/api/tracks?q=&provider=local&limit=&offset=` | 曲目列表；`provider=all` 可看全部 |
| GET | `/api/tracks/{id}` | 单曲 |
| GET | `/api/tracks/{id}/lyrics` | 解析后的歌词（`lines` / `synced` / `word_sync` / `offset_ms`）；在线曲目首次访问会抓取并缓存 |
| GET | `/api/tracks/{id}/cover` | 本地封面；在线 302 到 CDN |
| GET/HEAD | `/api/stream/{id}` | 本地/在线统一流接口，支持 Range（206） |
| POST | `/api/tracks/{id}/duration` | 浏览器回填真实时长 |
| POST | `/api/scan?force=` | 增量/强制扫描本地库 |
| GET | `/api/library/roots` | 已配置/生效的曲库目录 |
| POST | `/api/library/roots` | 添加一个目录并立即扫描（引导页用） |
| POST | `/api/library/roots/pick` | 弹系统目录选择框，返回所选路径（引导页用） |
| GET | `/api/online/status` | 在线源状态 + 脱敏账号 + 登录进程状态 |
| GET | `/api/online/login` | 登录进程进度（`running/exit_code/output`，前端 2s 轮询） |
| POST | `/api/online/login?force=` | 拉起 `qqmusic-mcp login`（`force` 会先清旧登录态） |
| POST | `/api/online/logout` | 退出登录（删除 DPAPI 登录态并刷新缓存） |
| GET | `/api/qq/playlists` | QQ 自建歌单列表（dirid 201 = 我喜欢） |
| GET | `/api/qq/playlists/{directory_id}` | 预览 QQ 歌单曲目（默认前 300 首） |
| POST | `/api/playlists` | 新建本地歌单（`name`，可带 `track_ids`） |
| PATCH | `/api/playlists/{id}` | 改名（只改本地，不动 QQ） |
| DELETE | `/api/playlists/{id}/tracks` | 批量移除曲目（body `{track_ids}`），位置自动补空 |
| POST | `/api/playlists/{id}/reorder` | 保存新顺序（`{track_ids}` 必须与现有集合一致，否则 400） |
| POST | `/api/playlists/from-qq` | 把 QQ 歌单另存为本地歌单（`{directory_id, name?}`，重复保存是更新） |
| GET | `/api/qq/playlists/{directory_id}/tracks` | 打开 QQ 歌单：upsert 曲目并返回可播放 track（最多 3000，`refresh=1` 绕过快照；返回 `cached` / `synced_at`） |
| POST | `/api/qq/playlists/{directory_id}/sync` | 强制重读并重写快照，返回 `added` / `removed` / `previous_total` / `synced_at` |
| POST | `/api/playlists/import/qq` | 旧版：按 `directory_id` 导入/更新本地歌单 |
| GET | `/api/playlists` | 本地歌单列表（含曲目数） |
| GET | `/api/playlists/{id}` | 本地歌单详情 + 曲目 |
| DELETE | `/api/playlists/{id}` | 移除本地歌单（不影响 QQ 音乐） |
| GET | `/api/online/search?q=&provider=qq&limit=` | QQ 搜索，落库后返回统一曲目对象 |
| POST | `/api/play/start` | 开一条播放事件 |
| POST | `/api/play/progress` | 更新累计播放时长 |
| POST | `/api/play/end` | 收尾（`completed` 可显式传） |
| GET | `/api/recent?limit=` | 最近播放（≥3s 或已播完） |
| GET | `/api/stats/today` | 今日首数/时长 |
| GET | `/api/stats/week?days=7` | 周报：`series`（逐日）/`totals`/`top_tracks`/`top_artists` |
| GET | `/api/library/duplicates` | 只读重复检查：`groups`/`group_count`/`track_count`/`scanned` |
| GET | `/api/likes` | 我的收藏：`count` / `ids` / `items`（带 `liked_at`） |
| POST | `/api/likes` | 收藏（body `{track_id}`，幂等） |
| DELETE | `/api/likes/{track_id}` | 取消收藏（幂等） |
| GET | `/api/tidy/plan?root=&layout=&limit=` | 只读整理计划（`dry_run: true`）：每首的目标路径 + 冲突分类 + 体积汇总 |
| POST | `/api/tidy/runs` | 冻结计划：写 `tidy_runs` + `tidy_items`，不移动 |
| GET | `/api/tidy/runs` | 最近任务列表 |
| GET | `/api/tidy/runs/{id}` | 单次任务进度 + 最近 20 条明细 |
| POST | `/api/tidy/runs/{id}/start` | **真移动**（默认后台线程，`background=false` 同步） |
| POST | `/api/tidy/runs/{id}/undo` | 按 run 撤销，逐条搬回 |
| GET | `/api/backups` | 备份目录 + 文件列表（名称/大小/时间） |
| POST | `/api/backups` | 立即生成一份 `manual-*.db` 快照 |
| POST | `/api/backups/restore` | 恢复指定备份；先自动生成 `pre-restore-*.db` |
| POST | `/api/backups/open` | 打开备份目录（Windows 资源管理器） |
| DELETE | `/api/backups/{name}` | 删除备份文件 |
| GET | `/api/roadmap` | 路线图（读 `data/roadmap.json`，返回总分与各里程碑） |

## 目录

```
music-hub/
├─ server/
│  ├─ config.py          路径、曲库根、QQ 登录态路径
│  ├─ db.py              schema + 轻量迁移（format 列）
│  ├─ library.py         扫描、标签、封面、LRC 解析、MP4 时长兜底
│  ├─ journal.py         play_events 读写、最近播放、今日统计
│  ├─ online.py          在线搜索结果落库（统一 tracks 表）
│  ├─ qqlogin.py         登录子进程（qqmusic-mcp login）+ 进度状态
│  ├─ playlists.py       本地歌单列表/详情/删除 + QQ 歌单导入
│  ├─ roadmap.py         路线图读取与总分计算
│  ├─ providers/
│  │  ├─ base.py         Provider 接口 + OnlineTrack 数据类
│  │  ├─ qq.py           DPAPI 登录态、搜索、vkey 直链、歌词
│  │  └─ __init__.py     注册表 + 状态 + 登录失效标记
│  └─ main.py            FastAPI 路由、Range 流、在线代理、静态托管
├─ web/
│  ├─ index.html
│  ├─ tokens.css            设计令牌 + 玻璃表面变量
│  ├─ app.css
│  ├─ onboard.css           首次引导 + 账号面板
│  └─ js/{app,player,lyrics,visualizer,api}.js
├─ scripts/
│  ├─ make_demo_audio.py   合成演示曲/封面/LRC
│  ├─ pick-folder.ps1      系统文件夹选择框（/api/library/roots/pick）
│  ├─ run-server-log.cmd   无窗口启动 + data/server.log（代理重启用）
│  ├─ cdp_probe*.mjs       本地播放验收
│  ├─ cdp_online.mjs       QQ 在线搜索/播放/歌词验收
│  ├─ cdp_gapless.mjs      预加载/无缝切歌验收
│  ├─ cdp_accounts.mjs     引导页/账号面板/失效态验收
│  ├─ cdp_playlists.mjs    歌单导入/播放全部验收（旧版）
│  ├─ cdp_qq_playlists.mjs 登录后自动列歌单/打开/播放验收
│  ├─ cdp_playlist_sync.mjs 歌单快照陈旧提示 + 「同步」按钮验收
│  ├─ cdp_lyrics_karaoke.mjs 逐字高亮验收（`MH_WIDTH` 可切手机宽度）
│  ├─ cdp_media_keys.mjs    媒体会话 8 个 action + 位置状态 + metadata 验收
│  ├─ cdp_playlist_edit.mjs 本地歌单：新建 / 另存为 / 拖拽排序 / 多选移除 验收
│  ├─ cdp_mobile_onboard.mjs  引导页手机宽度验收
│  ├─ test_player.mjs      播放器逻辑单测（无需浏览器）
│  ├─ cdp_roadmap.mjs      路线图胶囊/面板验收
│  └─ cdp_final.mjs        最终截图
├─ data/                   SQLite、封面缓存、演示曲、config.json、roadmap.json
├─ wheels/                 离线依赖（pip 抽风时用）
├─ _shots/                 验收截图
├─ start.ps1
└─ start.cmd              执行策略绕过包装（推荐入口）
```

## 管家抽屉（搜歌 / 整理 / 周报）

顶栏「管家」打开右侧抽屉，三张卡片各进一个面板，`Esc` 或再点一次「管家」关掉：

- **搜歌**：一个输入框直接搜 QQ 音乐，回车出 20 条，点一首就播（播完自动关抽屉）
- **整理**：只读体检，扫本地曲库里的重复曲目（歌名 + 歌手归一化后同名），按组列出，点条目可试听
- **整理计划（dry-run）**：「生成整理计划」按 `有标签→歌手/专辑`、`没标签→月份` 算出每首文件**将要**搬到哪里（默认根目录 `D:\音乐库`，`MUSIC_HUB_TIDY_ROOT` 可改），标出「会移动 / 目标撞车 / 目标已有 / 已就位 / 源文件没了」，可导出清单 CSV
- **真移动**：确认后点「开始整理（N 个）」→ 先冻一份计划（`tidy_runs`/`tidy_items`）→ 逐条移动、每 50ms 一个、每条都记状态和错误；完成后历史里能「撤销」，按 `run_id` 原样搬回（目标被改过或原位置又有同名文件就拒绝那一条）
- 安全线：只移动**曲库目录内**的文件；目标已存在就跳过，永不覆盖；数据库里的 `tracks.path` 跟着改，播放不中断
- **周报**：近 7 天的播放次数 / 分钟 / 有听歌的天数 / 不重复曲目，7 根日柱 + 听最多的 5 首 + 5 位歌手
- **周报导出**：`存成图片`（2000×1520 PNG，深色版式，可直接发）和 `存成 CSV`（带 BOM，Excel 双击不乱码）；有 `showSaveFilePicker` 就弹系统另存为，没有就退回普通下载
- 抽屉是不透明面板，开在星海上面也看得清；`Esc` 顺序是「先关抽屉，再关星海」

## 收藏（我喜欢）

- **播放器**控制条上多了一个 ♥（循环按钮右边）：亮了就是已收藏，再点取消
- **列表里**每行右侧有 ♥：鼠标移上去出现，已收藏的一直亮着；点它不会误触播放
- 收藏对**本地和 QQ 在线曲目都生效**，只存在本应用（`likes` 表），**不会写回 QQ 音乐的「我喜欢」**
- 侧栏「歌单」页顶部有「我的收藏 · 我喜欢」入口，点开是这张虚拟歌单，可「播放全部」
- 取消收藏：同一颗 ♥，或在我的收藏里直接点掉

## 外观与皮肤

**播放器为主，管家为辅**：默认就是播放页；搜歌、歌单、整理、周报退到次级入口，不做五页等权导航。

- 令牌：`web/tokens.css`（源文件 `design/tokens.css`），颜色/字号/间距/圆角/动效统一走 `var(--x)`
- 默认：平色深色，无 `backdrop-filter`、无 ambient、无霓虹；面板用 `--surface`
- 玻璃：右上角立方体按钮或 `G`；`localStorage["mh.glass"]` 持久化，即时生效不刷新
- 玻璃只作用于顶层面板（侧栏 / 队列抽屉 / 路线图卡片）：`blur(18px) saturate(140%)`
- 侧栏内的搜索框/页签不叠玻璃；整屏歌词页不开玻璃；手机默认关；`prefers-reduced-transparency` 自动关
- 设计定调与硬约束：`design/DECISIONS.md`

## 设计约定

- **播放器优先**：默认播放页；搜歌/歌单/整理/周报是次级管家入口，不与播放器抢主界面。
- **Provider 接口**：`search / resolve / lyrics / invalidate`，新音源只加一个文件并在注册表登记。
- **统一曲目表**：在线结果落 `tracks`，`provider_id` 存 mid、`cover` 存 CDN URL、`path` 为空；队列/记录/歌词不用分叉。
- **在线代理强制 IPv4**：QQ CDN 的 AAAA 记录会让 Windows 先等约 16s 才回退 IPv4。代理直接用 A 记录 + `Host` 头，实测 300ms 内出首字节。
- **vkey 缓存 5 分钟**：过期后上游 401/403/404/410 会触发一次强制重取。
- **可插拔视觉**：`web/js/visualizer.js` 只暴露
  `createVisualizer(canvas, audio) -> {ensure, resize}`。换背景动效只改这个文件。
- **歌词视图独立**：`LyricsView` 只依赖容器、行数据和 `onSeek`。
- **记录与播放解耦**：`Journal` 在 `app.js`，通过 `/api/play/*` 落库。
- **路线图数据化**：`data/roadmap.json` 是唯一事实源；改 percent/status/detail 后重新打开面板即可生效，不用重启。总分按里程碑等权计算。
- 调试句柄：控制台 `window.__mh` 可拿到 `player / journal / state / lyricsView`。

## 验证记录（2026-11-10）

本地（46 首：43 首真实文件 + 3 首演示）：

- Edge CDP：播放/暂停/空格、切歌、进度条 50% 跳转、歌词拖动 8.4s → 22.5s、播到结尾自动下一首并 `completed=1`
- 真实 M4A《晚安》播放正常，时长从 0 回填为 33.1s
- 切歌/关页后 `play_events` 全部闭合，无孤儿事件

QQ 在线：

- `/api/online/status`：`ready=true`，账号脱敏
- 搜索「晴天」返回 24 条，封面 300px、专辑/时长正常
- 点击第一首：4:29，封面/歌曲信息正常，`/api/stream` 返回 206 `audio/mp4`，约 0.3–0.8s 出首字节
- 在线歌词 API 返回 63 行，界面过滤制作名单后 51 行，全屏页从「前奏」进入正文
- 在线拖动到 120s：`currentTime` 122.5s、继续播放、无错误
- 前端 console 无报错

路线图（2026-11-11 更新到 58%）：

- 顶栏胶囊显示 `58%`，四段迷你条分别 100 / 55 / 45 / 30
- 面板总分 58%，四行里程碑与进度条正常，Esc / 背景点击可关闭，手机宽度不溢出
- 数据来自 `/api/roadmap` 与 `data/roadmap.json`；改文件后重开面板即更新

歌单自动出现（2026-11-10 下午）：

- `GET /api/qq/playlists` 返回 20 个歌单，其中 18 个可读（QZone/本地上传无 songmid，列表里不显示）
- 登录后「歌单」tab 自动出 18 个 QQ 歌单 + 本地旧歌单，页面无「导入」按钮
- 点开「沙一汀」9 首，播放第 1 首「楚门的世界」，`provider='qq'`、`playing=true`
- 「我喜欢」全量 2325 首：接口约 2.2s、675 KB、2325 条；打开即渲染，不需要导入
- 返回歌单列表正常；console 无报错
- 截图：`_shots/43-qq-playlists-auto.png`、`44-qq-playlist-tracks.png`、`45-qq-playlist-playing.png`

歌单快照同步（2026-11-10 晚）：
- `GET .../tracks` 首次写快照、二次返回 `cached=true`；「我喜欢」热开 0.08s，`POST .../sync` 1.5s
- `POST .../sync` 无旧快照 → `added=14`；人为注入一条假曲目 → `removed=1`（`previous_total=10`）
- 浏览器（`node scripts/cdp_playlist_sync.mjs`）：快照 10 首 / QQ 9 首时小字琥珀色提示 `QQ 现为 9 首 · 快照 10 首，点「同步」`；点同步后按钮变 `同步中…` 并禁用，632ms 完成，toast `已同步：9 首，没有变化`，小字回到 `同步于 刚刚`
- 「我喜欢」2325 首同步 1.5s，列表仍是 `已显示 140 / 2325 首`，不重排、不跳顶
- 返回歌单列表时同步按钮和小字一起隐藏；console 无报错
- `scripts/selfcheck.py` 11/11
- 截图：`_shots/98-playlist-sync-stale.png`、`99-playlist-sync-done.png`、`100-playlist-sync-big-stale.png`、`101-playlist-sync-big-done.png`

本地歌单编辑（2026-11-11 凌晨）：

- `POST /api/playlists/from-qq`：沙一汀 9 首 → 本地 #id、9 首、`created=true`；重复保存同一个 directory_id 是 `created=false` 且 `playlist_id` 不变；自己改名后再保存，名字保留
- `POST /api/playlists/{id}/reorder`：正常顺序 200；少一首的集合 400「曲目列表和现有歌单对不上」
- 浏览器（`node scripts/cdp_playlist_edit.mjs`）：
  - 歌单列表只有「新建歌单」；新建弹窗 → 输入「编辑测试」→ 0 首 → 按钮变「改名 / 返回歌单」
  - 打开 QQ「沙一汀」→「另存为我的歌单」→ 变成可编辑本地歌单（9 首，出现「选择」，消失「同步 / 另存为」）
  - 拖第 1 行到第 3 行后：`楚门的世界` 落到第 3 位，toast「顺序已保存」
  - 「选择」→ 点 2 行 → 批量条「已选 2 首」→「移除」→ 9 → 7 首，toast「已移除 2 首」
  - 刷新页面后仍是 7 首且顺序不变（`sameOrder: true`）
- `selfcheck.py` 11/11，console 无报错；截图 `_shots/105-playlist-list.png`、`106-playlist-saved-local.png`、`107-playlist-select.png`、`108-playlist-after-reload.png`

管家抽屉（2026-11-11 凌晨）：

- `GET /api/stats/week`：60 次 / 98.6 分钟 / 2 天 / Top5（潮汐信 17 次）；`GET /api/library/duplicates`：46 首里 7 组重复、涉及 16 首
- 浏览器（`node scripts/cdp_butler.mjs`）：顶栏「管家」开抽屉 → 三张卡片；搜歌「晴天」20 条 → 点第一首实际播放（`player.track=晴天`）并自动关抽屉；整理扫出 16 行；周报 4 个数字 + 7 根柱 + 10 行 Top；`Esc` 关上
- 修了两处：抽屉 z-index 145 与星海重叠（星海盖住抽屉）→ 提到 148；`.butler-home` 的 `display:grid` 压过 `[hidden]` → 加 `[hidden]{display:none}`
- 截图：`_shots/113-butler-home.png`、`114-butler-search.png`、`115-butler-tidy.png`、`116-butler-report.png`

周报导出（2026-11-11 凌晨）：

- 浏览器（`node scripts/cdp_report_export.mjs` + CDP 下载目录）：点「存成图片」得到 `大肥鱼周报-2026-11-05_2026-11-11.png`，2000×1520、425 KB、PNG 魔数正确；点「存成 CSV」得到同名 `.csv`，738 字节
- CSV 内容核对：汇总四行 + 7 行逐日 + 5 首 Top（次数/分钟）+ 5 位歌手，带 UTF-8 BOM
- 首版图片有两个版式问题已修：Top5 最后一行与导出时间重叠（画布 700→760，页脚 724）、零播放日画成胶囊（改成 2px 细线）
- 导出走 `showSaveFilePicker`（系统另存为），不支持时退回 `<a download>`；用户取消不报错
- 截图：`_shots/118-report-export.png`（导出的 PNG 原图）

整理计划（2026-11-11 凌晨，只读）：

- `GET /api/tidy/plan`：46 首 → 会移动 **39**、同名撞车 **7**（同歌名同歌手，落到同一目标）、已就位 0、源文件缺失 0、总计 39.8 MB
- 目标默认 `D:\音乐库`，目录**没有被创建**（`Test-Path` 为 False），确认是 dry-run
- 浏览器（`node scripts/cdp_tidy_plan.mjs`）：抽屉「整理」→ 生成计划 → 46 行、状态「会移动 / 目标撞车」、汇总行与根目录正确；「导出清单 CSV」落盘 9.7 KB，表头 `状态,动作,歌名,歌手,专辑,字节,源文件,目标`
- 顺带发现：这批微信来的 m4a 大多没有标签，全部落到「未知歌手/未知专辑」——这正是需要整理的原因
- 截图：`_shots/119-tidy-plan.png`

收藏（2026-11-11 晚）：

- 接口：`POST /api/likes {45}` → `count=1`；重复 POST 幂等仍为 1；不存在的 id → 404；`DELETE` 两次都成功且计数只减一次；`GET` 返回 `ids` + `items`（含 `liked_at`）
- 浏览器（`node scripts/cdp_likes.mjs`）：播放器 ♥ → 1 首、toast「已收藏」；列表里另一首 ♥ → 2 首；刷新页面后仍 2 首、两颗心都亮（持久化生效）；歌单页「我喜欢 2 首」→ 点开是 `我喜欢` 视图、2 行、「播放全部」「返回歌单」都在；在里面取消一首 → 1 首、行数同步
- 修了两处：`loadLikes()` 一开始插进了 `logoutQq()` 而不是 `boot()`（刷新后收藏「消失」）；`renderList()` 的 playlist 守卫把虚拟收藏视图弹回列表（补 `!state.likesView`）
- `selfcheck.py` 11/11；console 无报错；截图 `_shots/120-likes-player.png`、`121-likes-rows.png`、`122-likes-view.png`

整理真移动（2026-11-11 晚）：

- 沙箱测试（`scripts/test_tidy_executor.py`，临时目录 + 临时库行，跑完自动清理）：3 个文件里 2 个正常搬走、1 个因目标已存在失败 → run `partial`；`tracks.path` 跟着改；`undo` 搬回 2 个、`blocked=0`、路径改回
- 只动曲库内文件：源文件换到曲库外会报「不在曲库目录里，拒绝移动」
- 浏览器（`node scripts/cdp_tidy_exec.mjs`）：计划后出现「开始整理（39 个）」+ 提示「会把这 39 个文件搬到 D:\音乐库」；**确认框选「取消」不会创建任何任务**（前后 runs 都是 0）；冻结计划后历史出现「待执行 · 搬 0 / 失败 0 / 共 39」
- 接口：`POST /api/tidy/runs` 的 `total` 记可执行条数（39，不是 46）；没搬过文件的 run 点撤销返回「这次任务没有搬过文件」且不改状态
- **没有对你的真实曲库执行过移动**；测试用的 run 已清空（`tidy_runs` / `tidy_items` 均 0 行）；`selfcheck.py` 11/11
- 截图：`_shots/123-tidy-plan-ready.png`、`124-tidy-history.png`

体验走查第一批（2026-11-12，对应《体验走查与优化建议》）：

- **P0-1 统一搜索**：侧栏搜索框一次输入同时查本地与 QQ，结果按「本地曲库 · N / QQ 音乐 · M」分组；搜「潮汐」得 1 本地 + 12 在线；QQ 不可用时空态给「扫码登录」，两边都空时给「只搜 QQ 音乐」
- **P0-2 不再吞队列**：搜索结果（含管家抽屉、整理试听）点一首走 `player.playNow()`——已播只是跳过去，没播就插到当前曲后面；实测队列 46 → 47 而不是被换成 12/20。歌单/最近播放仍按「换队列」处理
- **P0-5 整屏歌词时长**：时长三级回退（播放器元数据 → `track.duration_ms` → 0），实测整屏与主播放器都显示 `0:02 / 4:29`
- 验收脚本 `scripts/cdp_p0_batch.mjs`、`scripts/cdp_search_states.mjs`；截图 `_shots/129-unified-search.png`、`130-lyrics-duration.png`、`131-search-empty.png`

逐字歌词（2026-11-10 晚）：

- `parse_lrc` 单测：`[00:01.00]<00:01.00>你<00:01.60>好…` → 行 `你好世界` + 4 个 word；混排 `Hello ` / `world` 也对；普通行不带 `words`，`word_sync` 只在有逐字时为 true
- 浏览器（`node scripts/cdp_lyrics_karaoke.mjs`）「潮汐信」：第 4 行 `放进涨潮的傍晚` 7 字，随播放 1→2→3→4 字变亮；`getComputedStyle` 确认字色 `rgb(244,249,255)`（已唱）vs `rgba(233,241,255,0.42)`（未唱）
- 注入带字时间的行（20.0/20.5/21.0/21.5s）后拖播放位置：20.2→2 字、20.7→3、21.2→4、21.7→4，走真实字时间
- 平色主题下逐字不加发光（保持「不用霓虹」）；手机 390×844 同一行明暗分明、不溢出；console 无报错；`selfcheck.py` 11/11
- 截图：`_shots/102-lyrics-karaoke-a.png`、`102-lyrics-karaoke-b.png`、`102b-lyrics-karaoke-crop.png`、`102-*-mobile.png`

媒体键（2026-11-11 凌晨）：

- Electron 加速键探测（独立实例）：`MediaPlayPause / MediaNextTrack / MediaPreviousTrack / MediaStop` 可注册；`MediaFastForward`、`MediaRewind`、`MediaPlay`、`MediaPause` 直接抛 `conversion failure`
- 桌面壳日志（`C:\DafeiyuMusicHub\profile\logs\desktop.log`）重启后四行全 `registered`，含新增的 `MediaStop`
- 浏览器（`node scripts/cdp_media_keys.mjs`，用 `addScriptToEvaluateOnNewDocument` 抓住真实 handler 再按 OS 的方式调用）：
  - 注册了 8 个 action：`play / pause / stop / previoustrack / nexttrack / seekto / seekbackward / seekforward`
  - `stop()` → 时间归 0 且暂停；`play()` → 续播；30s 处 `seekforward({seekOffset:10})` → 40.9s；`seekbackward({seekOffset:15})` → 26.4s
  - `setPositionState` 被调用 5 次，末条 `{d:148.0, p:30.9, r:1}`；`playbackState` 依次 `paused → playing → paused → playing → paused`
  - metadata：`潮汐信 / 大肥鱼 / 深海电台`，artwork 1 张；console 无报错

登录 / 引导（2026-11-10 下午）：

- 全新环境（0 首 + 未登录）自动弹首次引导；已有曲库 + 已登录时自动跳过并记 `mh.onboarded`
- 引导页三步：目录（选择/粘贴 + 添加并扫描）、QQ（扫码登录/等待扫码）、网易云（未接入）；可随时跳过
- 账号面板：QQ 音乐卡显示脱敏账号、登录时间、已连接；网易云/酷狗显示未接入
- 已连接时点登录不会重复拉窗口；重新登录前会确认（`--force` 会先清旧登录态）
- 过期态显示「已失效」+「重新登录/退出登录」，「失效，点此重登」文案可用
- 真机验证：`POST /api/online/login` 在已有有效登录态时直接返回 `already valid`，`exit_code=0`，不弹窗
- 无效目录返回 400（「找不到这个文件夹」）；前端 toast 标红
- 手机 390×844：引导卡不溢出，目录输入独占一行、按钮并排且不换行
- 截图：`_shots/36-onboarding.png`、`37-accounts.png`、`38-accounts-expired.png`、`39-onboarding-error.png`、`40-onboarding-mobile.png`
- 浏览器 console 无报错

外观：

- 默认：`body` 无背景图、侧栏 `backdrop-filter: none`、ambient 0
- 玻璃：侧栏 `rgba(20,29,40,.55)` + `blur(18px) saturate(140%)`，ambient 0.3，布局宽度不变
- 侧栏内搜索框/页签 `backdrop-filter: none`（不叠层）；整屏歌词页也不开玻璃
- 刷新后玻璃状态保留；关闭后无残留；手机默认关；console 无报错
- 截图：`_shots/26-skin-flat.png`、`27-skin-glass.png`、`28-skin-glass-lyrics.png`、`29-skin-mobile.png`

播放器：

- 播放 6s 后刷新：自动恢复上一首与位置，徽标显示「上次 0:06」
- 队列插队：把第 5 首的 `↳` 点一下，下一首立即变成它
- 队列拖动：把第 4 首拖到队首，顺序和当前索引都正确
- 歌词补偿：`+1.0s` 后写入 `localStorage`，下次打开同一首仍生效
- `F` 打开整屏并定位当前行；`Esc` 退出
- 无缝切歌：下一首在 standby 元素里提前缓冲，自动换歌 `ended → 起播` 约 1ms；预加载未就绪时回退线性加载
- 重跑验收：`node scripts/test_player.mjs`（逻辑）、`node scripts/cdp_gapless.mjs`（真浏览器）
- 截图：`_shots/31-resume.png`、`32-queue-insert.png`、`33-lyric-offset.png`、`34-f-full.png`、`35-gapless-next.png`

设置与备份：

- 左下角齿轮打开设置，曲库目录/备份/玻璃/版本一页可改
- 「立即备份」生成 `manual-*.db`；启动时每天自动生成 `auto-YYYYMMDD.db`
- 恢复会先自动生成 `pre-restore-*.db`，再覆盖数据库；API 实测恢复成功
- 桌面壳：`C:\DafeiyuMusicHub` 的 Electron 便携版；桌面快捷方式 → `launch.ps1`（隐藏 PowerShell）
- 截图：`_shots/50-settings.png`、`51-settings-backup.png`

星海改原生 + 桌面壳窗口（2026-11-12 下午）：

- 星海：iframe 换成原生 canvas，`heroDisplay=none`、canvas 1052×648、星图 46 颗；点星出卡「蓝色房间 / 大肥鱼 / 深海电台 / 本地 / 2:12」；卡片播放后 `queue 46 → 46`、`track 潮汐信 → 蓝色房间`；`Esc` 关回播放页；手机 390×844 `overflowX=0`；console 0 报错（`node scripts/cdp_starfield_native.mjs`）
- 导航：原型图标栏随 iframe 下线；侧栏「隐藏/显示」按钮与 `mh.sidebarHidden` 一并删除（它只为 iframe 让位存在）
- 拖动条：星海不再触发 `#winDragBar`，只有整屏歌词会（`node scripts/cdp_dragbar.mjs`）
- 桌面窗口（真 Electron，`MUSIC_HUB_DEBUG_PORT=9333` 起壳后 `node scripts/cdp_desktop_window.mjs`）：启动 `fullscreen=false`、viewport 1457×912 而不是整屏；点全屏 → `fullscreen=true` 且 `lyrics=false`；`Esc` → 退出全屏；点封面 → `lyrics=true` 且 `fullscreen=false`；点 ✕ → 窗口 `visible=false`、页面仍活着
- 窗口尺寸：连续重启 3 次记 `1444×904 / 1448×907 / 1444×904`，不再每次长大（之前是 +3~4px/次，几十次就会自己铺满）
- 收进托盘后再点桌面图标：窗口 `visible=True`，位置和大小不变，不用等后端

歌词页控制条（2026-11-12 14:30，`node scripts/cdp_lyrics_controls.mjs`）：

- 三个按钮落在页脚：`loPrev 1239,853 30×30` / `loPlay 1273,850 36×36` / `loNext 1313,853 30×30`；时间 `0:01 / 0:18` 在最右，不再挤在右上角
- 歌词头的补偿按钮 `1184,24 130×28` 与窗口按钮 `1334,10 106×28` **不重叠**（`overlapsWindowControls=false`）
- 点下一首：`潮汐信 → 夜航`、`playing=true`、图标 `#i-pause`；再点：`playing=false`、图标 `#i-play`
- 手机 390×844：`timeRight=372 / footRight=390`、`overflowX=0`
- 截图：`_shots/139-lyrics-controls.png`、`140-lyrics-controls-mobile.png`

歌词页拖动即播（2026-11-12 14:40，`node scripts/cdp_lyrics_drag.mjs`）：

- 暂停在 `1.47s`，在歌词区按住向上拖 180px 松手 → `currentTime` 变 `15.60s`、`playing=true`（原来只跳不播，暂停时看着像没反应）
- 落点就是松手时居中的那一句；滚轮翻句（`step`）走同一条 `onSeek`，同样会起播
- 提示文案改成「上下拖动歌词，松手从那一句开始放」；console 0 报错

播放模式菜单（2026-11-12 14:50，`node scripts/cdp_playmode.mjs`）：

- 控制条从 6 个圆钮收成 5 个：`playModeBtn / prevBtn / playBtn / nextBtn / likeBtn`，`#shuffleBtn`、`#repeatBtn` 已不在 DOM 里
- 菜单四项：选「单曲循环」→ `player.repeat='one'`、图标 `#i-repeat-one`；选「随机播放」→ `player.shuffle=true`、图标 `#i-shuffle`；选「顺序播放」→ `repeat='off'`、图标 `#i-order`；选「列表循环」→ `repeat='all'`、图标 `#i-repeat`
- 选完菜单自动关；`Esc` 先关菜单再管别的层；点菜单外也关；console 0 报错
- 菜单在浅色玻璃皮肤下原来会透出后面的歌词（`--surface-2` 是半透明的），改成实底 `#121a25`，玻璃皮肤下用 0.86 不透明度 + blur
- 截图：`_shots/142-playmode-menu.png`

侧栏收起（2026-11-12 15:00，`node scripts/cdp_sidebar_toggle.mjs`）：

- 初始：侧栏宽 318、主区 1104，把手隐藏
- 点 `#sidebarHideBtn`：`body.side-hidden`、侧栏 `opacity=0`（宽度 33 的残影被 transform 移出）、主区 1104 → **1440**，把手 22px 出现
- 点把手：侧栏回 318、主区回 1104
- 收起后强制刷新：仍是收起的（`localStorage mh.sidebarHidden=1`），把手还在
- 截图：`_shots/143-sidebar-hidden.png`

## 已知限制 / 下一步

- 在线源目前只接了 QQ；网易云/酷狗待接
- 播放器已做断点续播、队列插队/拖拽、歌词时钟补偿、下一首预加载/无缝切歌、逐字高亮（增强 LRC 用真实时间，其余按行估算）、完整媒体键（含 stop 与 seek ±）；断点续播多端同步还没做
- 逐字：QQ 的歌词接口只给行级 LRC；QRC（真·逐字）在 `music.musichallSong.PlayLyricInfo` 带 `qrc:1` 时返回的是加密二进制，密钥暂时没解开，所以在线曲目走估算
- QQ 已做搜索 + 单曲播放 + 登录后自动列出歌单；歌单编辑（拖拽排序/批量移除）、收藏未接（`playlists` 表已建）
- VIP/独家曲目可能拿不到 purl，会返回「没有返回播放地址（可能是版权/会员限制）」
- vkey 过期、CDN 切换时有一次自动重取；再失败需要重新登录
- 手机端基础布局，曲库在首屏上方；后续做抽屉/底部导航
- 桌面入口目前是 **Electron 便携壳**（窗口/托盘/单实例/媒体键），不是安装包；还没有内置 Python sidecar、自动更新、文件关联
- Electron 必须从 ASCII 路径启动；`C:\DafeiyuMusicHub` 不能改成中文目录，否则 crashpad 崩溃
- 高 DPI 屏幕下会按缩放自动 zoom 0.8；如果布局仍挤，先用 Ctrl+0 / 调整窗口
- 播放时长由前端累计活跃播放，后台标签页会少记
- 扫码登录依赖本机已安装 `qqmusic-mcp`（`MUSIC_HUB_QQ_CLI` 可覆盖）；没装时引导页会提示安装命令
- 「选择目录」依赖 PowerShell + 用户桌面会话；服务要用 `start.cmd` 在登录用户下启动，跑成服务会看不到对话框
- 桌面套壳、聊天 + 记忆、周报未做
