import { api, fmtTime, fmtWhen, hueOf } from "./api.js";
import { Player } from "./player.js";
import { LyricsView, activeLineIndex } from "./lyrics.js";
import { createVisualizer } from "./visualizer.js";
import { createStarfield } from "./starfield.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const initialOf = (track) => (track?.title || "").trim().charAt(0) || "♪";
const TRACK_BATCH = 140;
const PROVIDER_LABELS = { qq: "QQ 音乐", netease: "网易云" };
const esc = (value) =>
  String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));


const audio = $("#audio");
const audioB = $("#audio-b");
const player = new Player(audio, audioB || undefined);
const viz = createVisualizer($("#viz"), player);
const lyricsView = new LyricsView($("#loStage"), $("#loLines"), {
  onSeek: (ms) => {
    player.seek(ms);
    // 拖到哪一句就从那一句开始放：原来只跳不播，暂停状态下拖完像是没反应
    if (!player.playing) player.play();
  },
});

const el = {
  search: $("#search"),
  trackList: $("#trackList"),
  listLabel: $("#listLabel"),
  listMeta: $("#listMeta"),
  todayStats: $("#todayStats"),
  settingsScan: $("#settingsScan"),
  tabs: $$(".tab"),
  queueBtn: $("#queueBtn"),
  queueCount: $("#queueCount"),
  glassBtn: $("#glassBtn"),
  roadmapBtn: $("#roadmapBtn"),
  roadmapPct: $("#roadmapPct"),
  roadmapMini: $("#roadmapMini"),
  roadmapOverlay: $("#roadmapOverlay"),
  roadmapBig: $("#roadmapBig"),
  roadmapFill: $("#roadmapFill"),
  roadmapList: $("#roadmapList"),
  roadmapUpdated: $("#roadmapUpdated"),
  roadmapNext: $("#roadmapNext"),
  closeRoadmap: $("#closeRoadmap"),
  ambient: $("#ambient"),
  artGlow: $("#artGlow"),
  cover: $("#cover"),
  coverImg: $("#coverImg"),
  coverEmpty: $("#coverEmpty"),
  formatBadge: $("#formatBadge"),
  eyebrow: $("#eyebrow"),
  nowTitle: $("#nowTitle"),
  nowArtist: $("#nowArtist"),
  nowAlbum: $("#nowAlbum"),
  peekPrev: $('[data-slot="prev"]'),
  peekCur: $('[data-slot="cur"]'),
  peekNext: $('[data-slot="next"]'),
  curTime: $("#curTime"),
  durTime: $("#durTime"),
  seekBar: $("#seekBar"),
  barFill: $("#barFill"),
  barKnob: $("#barKnob"),
  playBtn: $("#playBtn"),
  playIcon: $("#playIcon"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  playModeBtn: $("#playModeBtn"),
  sidebarHideBtn: $("#sidebarHideBtn"),
  sidebarShowBtn: $("#sidebarShowBtn"),
  playModeIcon: $("#playModeIcon"),
  playModeMenu: $("#playModeMenu"),
  playModeWrap: $("#playModeWrap"),
  likeBtn: $("#likeBtn"),
  muteBtn: $("#muteBtn"),
  volume: $("#volume"),
  eventState: $("#eventState"),
  queuePanel: $("#queuePanel"),
  queueList: $("#queueList"),
  queueMeta: $("#queueMeta"),
  closeQueue: $("#closeQueue"),
  overlay: $("#lyricsOverlay"),
  loTitle: $("#loTitle"),
  loArtist: $("#loArtist"),
  loBackdrop: $("#loBackdrop"),
  loPlay: $("#loPlay"),
  loPlayIcon: $("#loPlayIcon"),
  loPrev: $("#loPrev"),
  loNext: $("#loNext"),
  lyrMinus: $("#lyrMinus"),
  lyrPlus: $("#lyrPlus"),
  lyrOffsetLabel: $("#lyrOffsetLabel"),
  loTime: $("#loTime"),
  loProgress: $("#loProgress"),
  closeLyrics: $("#closeLyrics"),
  toast: $("#toast"),
  accountBtn: $("#accountBtn"),
  accountOverlay: $("#accountOverlay"),
  accountList: $("#accountList"),
  accountUpdated: $("#accountUpdated"),
  closeAccount: $("#closeAccount"),
  settingsBtn: $("#settingsBtn"),
  settingsOverlay: $("#settingsOverlay"),
  closeSettings: $("#closeSettings"),
  closeSettings2: $("#closeSettings2"),
  settingsRoots: $("#settingsRoots"),
  settingsRootCount: $("#settingsRootCount"),
  settingsPath: $("#settingsPath"),
  settingsPick: $("#settingsPick"),
  settingsAdd: $("#settingsAdd"),
  backupNow: $("#backupNow"),
  openBackups: $("#openBackups"),
  backupList: $("#backupList"),
  settingsBackupDir: $("#settingsBackupDir"),
  settingsAbout: $("#settingsAbout"),
  settingsGlass: $("#settingsGlass"),
  settingsVolume: $("#settingsVolume"),
  settingsVolumeLabel: $("#settingsVolumeLabel"),
  settingsLyric: $("#settingsLyric"),
  settingsLyricLabel: $("#settingsLyricLabel"),
  shortcutList: $("#shortcutList"),
  settingsRoadmapPct: $("#settingsRoadmapPct"),
  settingsRoadmapNext: $("#settingsRoadmapNext"),
  settingsRoadmapOpen: $("#settingsRoadmapOpen"),
  pierceSection: $("#pierceSection"),
  pierceModes: $("#pierceModes"),
  pierceAlpha: $("#pierceAlpha"),
  pierceAlphaLabel: $("#pierceAlphaLabel"),
  pierceClear: $("#pierceClear"),
  pierceToggleBtn: $("#pierceToggleBtn"),
  pierceHint: $("#pierceHint"),
  pierceNote: $("#pierceNote"),
  winControls: $("#winControls"),
  starfieldBtn: $("#starfieldBtn"),
  winDragBar: $("#winDragBar"),
  starfieldView: $("#starfieldView"),
  starfieldOverlay: $("#starfieldView"),
  providerSwitch: $("#providerSwitch"),
  mobileNav: $("#mobileNav"),
  sidebar: $(".sidebar"),
  providerLoginBtn: $("#providerLoginBtn"),
  qrOverlay: $("#qrOverlay"),
  qrImg: $("#qrImg"),
  qrStatus: $("#qrStatus"),
  qrRefresh: $("#qrRefresh"),
  qrClose: $("#qrClose"),
  confirmOverlay: $("#confirmOverlay"),
  confirmTitle: $("#confirmTitle"),
  confirmText: $("#confirmText"),
  confirmOk: $("#confirmOk"),
  confirmCancel: $("#confirmCancel"),
  homeView: $("#homeView"),
  homeGreeting: $("#homeGreeting"),
  homeHello: $("#homeHello"),
  homeLocalCount: $("#homeLocalCount"),
  homeQqCount: $("#homeQqCount"),
  homeTracks: $("#homeTracks"),
  homeQqTracks: $("#homeQqTracks"),
  homeCover: $("#homeCover"),
  homeNowLabel: $("#homeNowLabel"),
  homeNowTitle: $("#homeNowTitle"),
  homeNowArtist: $("#homeNowArtist"),
  homeNowFill: $("#homeNowFill"),
  homeNowTime: $("#homeNowTime"),
  homeNowDur: $("#homeNowDur"),
  homePlay: $("#homePlay"),
  homePlayIcon: $("#homePlayIcon"),
  homePrev: $("#homePrev"),
  homeNext: $("#homeNext"),
  homeOpenPlayer: $("#homeOpenPlayer"),
  homeEnterStarfield: $("#homeEnterStarfield"),
  homeRecentList: $("#homeRecentList"),
  homeTeaserCanvas: $("#homeTeaserCanvas"),
  homePlays: $("#homePlays"),
  homeMinutes: $("#homeMinutes"),
  replayOnboard: $("#replayOnboard"),
  onboard: $("#onboardOverlay"),
  closeOnboard: $("#closeOnboard"),
  obLibState: $("#obLibState"),
  obLibHint: $("#obLibHint"),
  obPath: $("#obPath"),
  obAddFolder: $("#obAddFolder"),
  obPickFolder: $("#obPickFolder"),
  obQqState: $("#obQqState"),
  obLogin: $("#obLogin"),
  obLoginNote: $("#obLoginNote"),
  obSkip: $("#obSkip"),
  obDone: $("#obDone"),
  playlistCount: $("#playlistCount"),
  listActions: $("#listActions"),
  backToPlaylists: $("#backToPlaylists"),
  playAllBtn: $("#playAllBtn"),
  syncPlaylistBtn: $("#syncPlaylistBtn"),
  syncNote: $("#syncNote"),
  saveQqBtn: $("#saveQqBtn"),
  renamePlaylistBtn: $("#renamePlaylistBtn"),
  selectBtn: $("#selectBtn"),
  cancelSelectBtn: $("#cancelSelectBtn"),
  newPlaylistBtn: $("#newPlaylistBtn"),
  batchBar: $("#batchBar"),
  batchInfo: $("#batchInfo"),
  selectAllBtn: $("#selectAllBtn"),
  removeSelectedBtn: $("#removeSelectedBtn"),
  nameOverlay: $("#nameOverlay"),
  nameInput: $("#nameInput"),
  nameTitle: $("#nameTitle"),
  nameOk: $("#nameOk"),
  closeName: $("#closeName"),
  nameHint: $("#nameHint"),
  butlerBtn: $("#butlerBtn"),
  butlerDrawer: $("#butlerDrawer"),
  closeButler: $("#closeButler"),
  butlerHome: $("#butlerHome"),
  butlerPanel: $("#butlerPanel"),
  butlerBack: $("#butlerBack"),
  bvSearch: $("#bvSearch"),
  bvTidy: $("#bvTidy"),
  bvReport: $("#bvReport"),
  butlerSearchInput: $("#butlerSearchInput"),
  butlerSearchResults: $("#butlerSearchResults"),
  butlerTidyRun: $("#butlerTidyRun"),
  butlerTidyBody: $("#butlerTidyBody"),
  butlerPlanRun: $("#butlerPlanRun"),
  planActions: $("#planActions"),
  tidyExecBar: $("#tidyExecBar"),
  tidyExecHint: $("#tidyExecHint"),
  tidyStartBtn: $("#tidyStartBtn"),
  tidyProgress: $("#tidyProgress"),
  tidyProgressFill: $("#tidyProgressFill"),
  tidyProgressText: $("#tidyProgressText"),
  tidyHistory: $("#tidyHistory"),
  planCsvBtn: $("#planCsvBtn"),
  reportNumbers: $("#reportNumbers"),
  reportBars: $("#reportBars"),
  reportTop: $("#reportTop"),
  reportPngBtn: $("#reportPngBtn"),
  reportCsvBtn: $("#reportCsvBtn"),
  importQQBtn: $("#importQQBtn"),
  qqImportOverlay: $("#qqImportOverlay"),
  closeQqImport: $("#closeQqImport"),
  qqPlaylistList: $("#qqPlaylistList"),
  qqPlaylistPreview: $("#qqPlaylistPreview"),
  qqImportStatus: $("#qqImportStatus"),
};

const state = {
  tracks: [],
  recent: [],
  currentList: [],
  tab: "recent",
  onlineQuery: "",
  lyrics: null,
  lyricsToken: 0,
  activeId: null,
  queueOpen: false,
  lyricsOpen: false,
  roadmapOpen: false,
  roadmap: null,
  lyricOffset: 0,
  peekKey: null,
  duration: 0,
  online: null,
  playlists: [],
  qqPlaylists: [],
  remotePlaylists: [],
  playlistCache: new Map(),
  remoteAt: 0,
  renderLimit: 0,
  qqDetail: null,
  playlistId: null,
  remotePlaylistId: null,
  playlistName: "",
  selectMode: false,
  selected: new Set(),
  dragId: null,
  nameAction: null,
  butlerOpen: false,
  butlerPanel: "home",
  weekReport: null,
  searchLocal: [],
  searchOnline: [],
  searchOnlineError: null,
  onlineProvider: "qq",
  likes: new Set(),
  likeItems: [],
  likesView: false,
  neteasePlaylists: [],
  neteasePlaylistId: null,
  tidyPlan: null,
  tidyRunId: null,
  tidyTimer: 0,
  qqImportOpen: false,
  playModeOpen: false,
  sidebarHidden: localStorage.getItem("mh.sidebarHidden") === "1",
  pierceMode: localStorage.getItem("mh.pierceMode") || "off",
  pierceAlpha: Number(localStorage.getItem("mh.pierceAlpha") || 62),
};
const desktopShell = Boolean(window.mhDesktop?.isDesktop);

// 一次性恢复不透明（透明降到 0）；之后用户自己切模式不会再被覆盖。
if (!localStorage.getItem("mh.pierceOpaqueV1")) {
  state.pierceMode = "off";
  localStorage.setItem("mh.pierceMode", "off");
  localStorage.setItem("mh.pierceOpaqueV1", "1");
}
let onlineToken = 0;

let toastTimer = 0;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle("error", isError);
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.toast.classList.remove("show"), 3200);
}

function setBadge(text, recording = false) {
  el.eventState.textContent = text;
  el.eventState.classList.toggle("recording", recording);
}

/* --------------------------------------------------------------- journal */
class Journal {
  constructor() {
    this.eventId = null;
    this.trackId = null;
    this.played = 0;
    this.lastPos = 0;
    this.sent = 0;
    this.lastFlushAt = 0;
    this.starting = false;
    this.seq = 0;
  }

  reset() {
    this.eventId = null;
    this.trackId = null;
    this.played = 0;
    this.lastPos = 0;
    this.starting = false;
    this.seq += 1;
  }

  async begin(track, position = 0) {
    if (!track) return;
    if (this.trackId === track.id && (this.eventId || this.starting)) return;

    // Claim the track synchronously so the play event cannot start a second row.
    const previous = { id: this.eventId, played: this.played };
    const seq = ++this.seq;
    this.trackId = track.id;
    this.starting = true;
    this.eventId = null;
    this.played = Math.max(0, position || 0);
    this.lastPos = this.played;
    this.sent = 0;
    this.lastFlushAt = performance.now();
    setBadge("记录中 · 0:00", true);

    try {
      if (previous.id) {
        await api
          .playEnd({ event_id: previous.id, played_ms: Math.round(previous.played), completed: false })
          .catch(() => {});
      }
      const res = await api.playStart({
        track_id: track.id,
        source: "web",
        position_ms: Math.round(this.played),
      });
      if (this.trackId !== track.id || seq !== this.seq) {
        // The listener skipped ahead while the row was being created.
        api.playEnd({ event_id: res.event_id, played_ms: 0, completed: false }).catch(() => {});
        return;
      }
      this.eventId = res.event_id;
    } catch {
      if (seq === this.seq) setBadge("记录失败");
    } finally {
      if (seq === this.seq) this.starting = false;
    }
  }

  tick(ms) {
    if (!this.eventId) return;
    const delta = ms - this.lastPos;
    if (player.playing && delta > 0 && delta < 2000) this.played += delta;
    this.lastPos = ms;
    if (performance.now() - this.lastFlushAt > 5000) {
      this.lastFlushAt = performance.now();
      this.flush();
    }
  }

  flush() {
    if (!this.eventId) return;
    this.sent = this.played;
    api.playProgress({ event_id: this.eventId, played_ms: Math.round(this.played) }).catch(() => {});
    setBadge(`记录中 · ${fmtTime(this.played)}`, true);
  }

  async finish(completed = false) {
    if (!this.eventId) return;
    const eventId = this.eventId;
    const played = Math.round(this.played);
    this.eventId = null;
    setBadge(`已记录 · ${fmtTime(played)}`);
    try {
      await api.playEnd({ event_id: eventId, played_ms: played, completed: Boolean(completed) });
    } catch {
      /* offline is fine, the row stays open */
    }
    refreshStats();
  }

  beacon() {
    if (!this.eventId) return;
    const payload = {
      event_id: this.eventId,
      played_ms: Math.round(this.played),
      completed: false,
    };
    try {
      navigator.sendBeacon(
        "/api/play/end",
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    } catch {
      /* ignore */
    }
    this.eventId = null;
  }
}
const journal = new Journal();

/* -------------------------------------------------------------------- art */
function applyArt(track) {
  const hue = hueOf(track.id);
  el.cover.style.background = `linear-gradient(140deg, hsl(${hue} 48% 30%), hsl(${(hue + 46) % 360} 52% 16%) 58%, hsl(${(hue + 96) % 360} 46% 20%))`;
  el.artGlow.style.background = `radial-gradient(circle at 50% 45%, hsla(${hue}, 78%, 62%, 0.42), hsla(${(hue + 52) % 360}, 78%, 60%, 0.14) 46%, transparent 70%)`;
  el.coverImg.hidden = true;
  el.coverImg.removeAttribute("src");
  el.coverEmpty.style.display = "grid";
  el.coverEmpty.textContent = initialOf(track);
  el.coverEmpty.classList.add("glyph");

  if (track.cover_url) {
    el.coverImg.onload = () => {
      if (player.track && player.track.id !== track.id) return;
      el.coverImg.hidden = false;
      el.coverEmpty.style.display = "none";
    };
    el.coverImg.onerror = () => {
      el.coverImg.hidden = true;
      el.coverEmpty.style.display = "grid";
      el.coverEmpty.classList.add("glyph");
    };
    el.coverImg.src = track.cover_url;
    el.ambient.style.backgroundImage = `url("${track.cover_url}")`;
    el.loBackdrop.style.backgroundImage = `url("${track.cover_url}")`;
    document.body.classList.add("has-art");
  } else {
    el.ambient.style.backgroundImage = "";
    el.loBackdrop.style.backgroundImage = `radial-gradient(70% 70% at 50% 40%, hsl(${hue} 60% 26%), #060a12 75%)`;
    document.body.classList.remove("has-art");
  }
}

function updateHero(track) {
  const isLocal = !track.provider || track.provider === "local";
  const providerLabel = track.provider_label || "在线";
  el.eyebrow.textContent = isLocal
    ? `本地曲库 · ${track.format || "AUDIO"} 文件`
    : `${providerLabel} · ${track.format || "AUDIO"} 在线`;
  el.nowTitle.textContent = track.title;
  el.nowArtist.textContent = track.artist || "未知歌手";
  el.nowAlbum.textContent = track.album || (isLocal ? "未命名专辑" : providerLabel);
  el.formatBadge.textContent = `${track.format || "AUDIO"} · ${isLocal ? "LOCAL" : "ONLINE"}`;
  el.durTime.textContent = fmtTime(track.duration_ms);
  el.loTitle.textContent = track.title;
  el.loArtist.textContent = `${track.artist || "未知歌手"} · ${
    track.album || (isLocal ? "本地曲库" : providerLabel)
  }`;
  document.title = `${track.title} · 大肥鱼音乐管家`;
  updateMediaSession(track);
  syncLikeButton();
}

/* ------------------------------------------------------------- favourites */
function isLiked(trackId) {
  return state.likes.has(Number(trackId));
}

function paintLikes() {
  for (const node of el.trackList.querySelectorAll(".like")) {
    const liked = isLiked(node.dataset.id);
    node.classList.toggle("liked", liked);
    node.setAttribute("aria-pressed", String(liked));
    node.title = liked ? "取消收藏" : "收藏";
  }
  syncLikeButton();
}

function syncLikeButton() {
  if (!el.likeBtn) return;
  const liked = Boolean(player.track && isLiked(player.track.id));
  el.likeBtn.classList.toggle("liked", liked);
  el.likeBtn.setAttribute("aria-pressed", String(liked));
  el.likeBtn.title = liked ? "取消收藏" : "收藏这首";
}

/* 删除一首歌：本地文件丢进回收站（可还原）再从曲库摘掉；在线曲目只摘列表，不动文件。 */
let confirmResolve = null;

function settleConfirm(value) {
  if (!el.confirmOverlay) return;
  el.confirmOverlay.classList.remove("open");
  el.confirmOverlay.setAttribute("aria-hidden", "true");
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(Boolean(value));
}

function askConfirm({ title, text, okLabel = "确定" }) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    el.confirmTitle.textContent = title;
    el.confirmText.textContent = text;
    el.confirmOk.textContent = okLabel;
    el.confirmOverlay.classList.add("open");
    el.confirmOverlay.setAttribute("aria-hidden", "false");
    el.confirmOk.focus({ preventScroll: true });
  });
}

/* 在线源切换：QQ / 网易云 */
if (el.providerSwitch) {
  for (const button of el.providerSwitch.querySelectorAll("[data-provider]")) {
    button.addEventListener("click", () => {
      const provider = button.dataset.provider;
      if (!PROVIDER_LABELS[provider] || provider === state.onlineProvider) return;
      state.onlineProvider = provider;
      for (const other of el.providerSwitch.querySelectorAll("[data-provider]")) {
        other.classList.toggle("on", other.dataset.provider === provider);
      }
      const badge = el.tabs.find((tab) => tab.dataset.tab === "online")?.querySelector("em");
      if (badge) badge.textContent = provider === "netease" ? "网易云" : "QQ";
      el.search.placeholder = `搜 ${PROVIDER_LABELS[provider]} 里的歌`;
      updateProviderLoginBtn();
      state.onlineQuery = "";
      state.currentList = [];
      renderList();
      el.search.focus();
      const q = el.search.value.trim();
      if (q) el.search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}
if (el.confirmOk) el.confirmOk.addEventListener("click", () => settleConfirm(true));
if (el.confirmCancel) el.confirmCancel.addEventListener("click", () => settleConfirm(false));
if (el.confirmOverlay) {
  el.confirmOverlay.addEventListener("click", (event) => {
    if (event.target === el.confirmOverlay) settleConfirm(false);
  });
}

async function deleteSong(track) {
  const online = (track.provider || "local") !== "local";
  const ok = await askConfirm({
    title: online ? "从曲库移除这首歌？" : "删除这首歌？",
    text: online
      ? `《${track.title}》是在线曲目，只会从曲库列表里移除，不动任何文件。`
      : `《${track.title}》的文件会移到 Windows 回收站（能从回收站还原），同时从曲库移除。`,
    okLabel: online ? "移除" : "移到回收站",
  });
  if (!ok) return;
  try {
    await api.deleteTrack(track.id, online ? "library" : "trash");
    state.currentList = state.currentList.filter((item) => item.id !== track.id);
    state.tracks = state.tracks.filter((item) => item.id !== track.id);
    if (state.current && state.current.id === track.id) state.current = null;
    if (player.track && player.track.id === track.id) player.stop();
    renderList();
    if (state.mainView === "home") updateHome();
    toast(online ? "已从曲库移除" : "已移到回收站");
  } catch (error) {
    toast(error.message || "删除失败", true);
  }
}

async function loadLikes() {
  try {
    const data = await api.likes();
    state.likes = new Set((data.ids || []).map(Number));
    state.likeItems = data.items || [];
    paintLikes();
    if (state.likesView) renderLikesView(state.likeItems);
  } catch {
    /* offline: keep whatever we had */
  }
}

async function toggleLike(trackId, force) {
  const id = Number(trackId);
  if (!Number.isFinite(id)) return;
  const wasLiked = isLiked(id);
  const next = typeof force === "boolean" ? force : !wasLiked;
  if (next === wasLiked) return;
  if (next) state.likes.add(id);
  else state.likes.delete(id);
  paintLikes();
  try {
    const result = next ? await api.like(id) : await api.unlike(id);
    state.likeCount = result.count;
    toast(next ? "已收藏" : "已取消收藏");
    if (state.likesView) {
      const data = await api.likes();
      state.likeItems = data.items || [];
      state.likes = new Set((data.ids || []).map(Number));
      renderLikesView(state.likeItems);
      paintLikes();
    }
  } catch (error) {
    if (next) state.likes.delete(id);
    else state.likes.add(id);
    paintLikes();
    toast(`没存上：${error.message}`, true);
  }
}

function renderLikesView(items) {
  state.currentList = items || [];
  el.listLabel.textContent = "我喜欢";
  el.listMeta.textContent = `${state.currentList.length} 首`;
  renderList();
  updateListActions();
}

function openLikesView() {
  state.playlistId = null;
  state.remotePlaylistId = null;
  state.likesView = true;
  state.tab = "playlists";
  for (const btn of el.tabs) btn.classList.toggle("active", btn.dataset.tab === "playlists");
  renderLikesView(state.likeItems);
  loadLikes();
}

function setStarfieldButton(open) {
  if (!el.starfieldBtn) return;
  const label = el.starfieldBtn.querySelector("span");
  const use = el.starfieldBtn.querySelector("use");
  if (label) label.textContent = open ? "返回首页" : "星海";
  if (use) use.setAttribute("href", open ? "#i-back" : "#i-star");
  el.starfieldBtn.title = open ? "回到首页（关闭星海）" : "星海面板";
  el.starfieldBtn.classList.toggle("sfp-open", open);
}

function syncDragBar() {
  if (!el.winDragBar) return;
  // 只有整屏歌词会盖住顶栏；星海在顶栏下面，不需要额外的拖动条
  el.winDragBar.hidden = !(document.body.classList.contains("mh-desktop") && state.lyricsOpen);
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  try {
    const artwork = track.cover_url
      ? [{ src: track.cover_url, sizes: "512x512", type: "image/jpeg" }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || "未知歌手",
      album: track.album || "本地曲库",
      artwork,
    });
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- list UI */
function trackRow(track, recent = false) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "track";
  row.dataset.id = String(track.id);
  row.setAttribute("role", "listitem");

  const thumb = document.createElement("span");
  thumb.className = "thumb";
  const hue = hueOf(track.id);
  thumb.style.setProperty("--c1", `hsl(${hue} 52% 30%)`);
  thumb.style.setProperty("--c2", `hsl(${(hue + 50) % 360} 55% 15%)`);
  const fallback = document.createElement("span");
  fallback.className = "thumb-fallback";
  fallback.textContent = initialOf(track);
  thumb.append(fallback);
  if (track.cover_url) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = track.cover_url;
    img.addEventListener("error", () => img.remove());
    thumb.append(img);
  }

  const text = document.createElement("span");
  text.className = "track-text";
  const title = document.createElement("span");
  title.className = "t";
  title.textContent = track.title;
  const artist = document.createElement("span");
  artist.className = "a";
  if (recent) {
    artist.textContent = `${track.artist || "未知歌手"} · ${fmtWhen(track.last_played_at)}`;
  } else if (track.provider && track.provider !== "local") {
    artist.textContent = `${track.artist || "未知歌手"} · ${track.album || track.provider_label || "在线"}`;
  } else {
    artist.textContent = track.artist || "未知歌手";
  }
  text.append(title, artist);

  const tail = document.createElement("span");
  tail.className = "tail";
  const dur = document.createElement("span");
  dur.className = "dur";
  dur.textContent = recent ? `${track.plays} 次` : fmtTime(track.duration_ms);
  const eq = document.createElement("span");
  eq.className = "eq";
  eq.innerHTML = "<i></i><i></i><i></i>";
  const like = document.createElement("span");
  like.className = "like" + (isLiked(track.id) ? " liked" : "");
  like.dataset.id = String(track.id);
  like.setAttribute("role", "button");
  like.setAttribute("aria-pressed", String(isLiked(track.id)));
  like.title = isLiked(track.id) ? "取消收藏" : "收藏";
  like.innerHTML = '<svg class="icon"><use href="#i-heart"/></svg>';
  like.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    toggleLike(track.id);
  });
  const trash = document.createElement("span");
  trash.className = "trash";
  trash.setAttribute("role", "button");
  trash.title = "删除这首歌";
  trash.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
  trash.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    deleteSong(track);
  });
  tail.append(like, trash, dur, eq);

  row.append(thumb, text, tail);
  return row;
}

function listMoreButton(total) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "list-more";
  button.id = "listMore";
  button.textContent = `继续加载（已显示 ${state.renderLimit} / ${total} 首）`;
  button.addEventListener("click", appendTrackBatch);
  return button;
}

function appendTrackBatch() {
  const list = state.currentList;
  if (!list.length || state.renderLimit >= list.length) return;
  const old = $("#listMore", el.trackList);
  if (old) old.remove();
  const next = Math.min(list.length, state.renderLimit + TRACK_BATCH);
  const frag = document.createDocumentFragment();
  for (let i = state.renderLimit; i < next; i += 1) {
    frag.append(trackRow(list[i], state.tab === "recent"));
  }
  el.trackList.append(frag);
  state.renderLimit = next;
  if (next < list.length) el.trackList.append(listMoreButton(list.length));
  el.listMeta.textContent = next < list.length ? `已显示 ${next} / ${list.length} 首` : `${list.length} 首`;
}

function renderList() {
  if (state.tab === "playlists" && !state.playlistId && !state.remotePlaylistId && !state.likesView && !state.neteasePlaylistId) {
    renderPlaylistList();
    return;
  }
  if (state.tab === "search" && state.searchQuery) {
    renderSearch();
    return;
  }
  el.trackList.innerHTML = "";
  const list = state.currentList;
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    if (state.tab === "recent") empty.textContent = "还没有听歌记录，播一首就有了";
    else if (state.tab === "online") {
      if (state.onlineQuery) {
        empty.textContent = "QQ 音乐没有找到这首歌";
      } else if (qqReady()) {
        empty.textContent = "在上面搜一首歌\n从 QQ 音乐直接播";
      } else {
        empty.append(document.createTextNode("还没连接 QQ 音乐\n"));
        const login = document.createElement("button");
        login.className = "solid compact";
        login.textContent = "扫码登录";
        login.addEventListener("click", () => startQqLogin());
        empty.append(login);
      }
    } else empty.textContent = "没有找到歌曲";
    el.trackList.append(empty);
  } else {
    state.renderLimit = Math.min(list.length, TRACK_BATCH);
    const frag = document.createDocumentFragment();
    for (const track of list.slice(0, state.renderLimit)) {
      frag.append(trackRow(track, state.tab === "recent"));
    }
    el.trackList.append(frag);
    if (state.renderLimit < list.length) {
      el.trackList.append(listMoreButton(list.length));
    }
  }
  el.listMeta.textContent =
    state.renderLimit < list.length
      ? `已显示 ${state.renderLimit} / ${list.length} 首`
      : `${list.length} 首`;
  paintListMode();
  markActive();
  animateListIn();
}

/** Selection + drag affordances belong to editable (local) playlists only. */
function paintListMode() {
  const editable = isEditablePlaylist();
  for (const row of el.trackList.querySelectorAll(".track")) {
    row.classList.toggle("selectable", editable && state.selectMode);
    row.classList.toggle("selected", editable && state.selected.has(Number(row.dataset.id)));
    const canDrag = editable && !state.selectMode;
    row.draggable = canDrag;
    row.classList.toggle("draggable", canDrag);
  }
}

function isEditablePlaylist() {
  return state.tab === "playlists" && Boolean(state.playlistId) && !state.remotePlaylistId;
}

function refreshBatchBar() {
  if (!el.batchBar) return;
  const show = isEditablePlaylist() && state.selectMode;
  el.batchBar.hidden = !show;
  if (!show) return;
  el.batchInfo.textContent = state.selected.size
    ? `已选 ${state.selected.size} 首`
    : "点曲目多选，选好点「移除」";
}

/* -------------------------------------------------------------- playlists */
function updateListActions() {
  const onPlaylists = state.tab === "playlists";
  const inPlaylist = Boolean(state.playlistId || state.remotePlaylistId || state.likesView);
  const editable = isEditablePlaylist();
  const backVisible = onPlaylists && inPlaylist;
  const playAllVisible = backVisible && state.currentList.length > 0;
  if (el.importQQBtn) el.importQQBtn.hidden = true;
  if (el.backToPlaylists) el.backToPlaylists.hidden = !backVisible;
  if (el.playAllBtn) el.playAllBtn.hidden = !playAllVisible || (editable && state.selectMode);
  const syncVisible = onPlaylists && Boolean(state.remotePlaylistId);
  if (el.syncPlaylistBtn) el.syncPlaylistBtn.hidden = !syncVisible;
  if (el.saveQqBtn) el.saveQqBtn.hidden = !syncVisible;
  if (el.renamePlaylistBtn) el.renamePlaylistBtn.hidden = !editable || state.selectMode;
  if (el.selectBtn) el.selectBtn.hidden = !editable || state.selectMode || !state.currentList.length;
  if (el.cancelSelectBtn) el.cancelSelectBtn.hidden = !editable || !state.selectMode;
  if (el.newPlaylistBtn) el.newPlaylistBtn.hidden = !onPlaylists || inPlaylist;
  if (el.syncNote && !syncVisible) el.syncNote.hidden = true;
  if (el.listActions) el.listActions.hidden = !backVisible && !(onPlaylists && !inPlaylist);
  refreshBatchBar();
}

function fmtSyncedAt(ts) {
  const seconds = Number(ts);
  if (!seconds) return "";
  return fmtWhen(new Date(seconds * 1000).toISOString());
}

/** Snapshot age, or a nudge when QQ reports a different song count than the snapshot. */
function setSyncNote(item, data) {
  if (!el.syncNote) return;
  const live = Number(item?.song_count ?? data?.playlist?.song_count ?? 0);
  const stale = Boolean(live && data?.total && live !== data.total);
  let text;
  if (stale) {
    text = `QQ 现为 ${live} 首 · 快照 ${data.total} 首，点「同步」`;
  } else {
    const when = fmtSyncedAt(data?.synced_at);
    text = when ? `同步于 ${when}` : "本地快照";
  }
  el.syncNote.textContent = text;
  el.syncNote.title = text;
  el.syncNote.classList.toggle("stale", stale);
  el.syncNote.classList.toggle("wrap", stale);
  el.syncNote.hidden = false;
}

function readableRemotePlaylists() {
  return state.remotePlaylists.filter((item) => item.playlist_id);
}

async function loadPlaylists({ force = false } = {}) {
  const canRemote = qqReady();
  const remoteFresh = canRemote && !force && state.remoteAt && Date.now() - state.remoteAt < 30000;
  const remotePromise = canRemote
    ? remoteFresh
      ? Promise.resolve({ items: state.remotePlaylists })
      : api.qqPlaylists()
    : Promise.resolve({ items: [] });
  const [localResult, remoteResult] = await Promise.allSettled([api.playlists(), remotePromise]);
  if (localResult.status === "fulfilled") {
    state.playlists = localResult.value.items || [];
  }
  if (remoteResult.status === "fulfilled") {
    state.remotePlaylists = remoteResult.value.items || [];
    if (canRemote && !remoteFresh) state.remoteAt = Date.now();
  } else {
    state.remotePlaylists = [];
    state.remoteAt = 0;
  }
  state.qqPlaylists = state.remotePlaylists;
  if (el.playlistCount) {
    el.playlistCount.textContent = String(readableRemotePlaylists().length + state.playlists.length);
  }
  if (state.tab === "playlists" && !state.playlistId && !state.remotePlaylistId && !state.likesView && !state.neteasePlaylistId) {
    renderPlaylistList();
  }
  return { local: state.playlists, remote: state.remotePlaylists };
}

function playlistRow(item, remote = false) {
  const row = document.createElement("div");
  row.className = "pl-row" + (remote ? " remote" : "");
  row.tabIndex = 0;
  if (remote) row.dataset.directoryId = String(item.directory_id);
  const cover = document.createElement("div");
  cover.className = "pl-cover";
  const hue = hueOf(item.name);
  cover.style.background = `linear-gradient(140deg, hsl(${hue} 46% 30%), hsl(${(hue + 52) % 360} 48% 15%))`;
  cover.textContent = "♪";
  const text = document.createElement("div");
  text.className = "pl-text";
  const name = document.createElement("div");
  name.className = "pl-name";
  name.textContent = item.name;
  const meta = document.createElement("div");
  meta.className = "pl-meta";
  const count = remote ? item.song_count : item.track_count;
  meta.textContent = remote
    ? `${count || 0} 首 · 点开即加载${item.liked ? " · 我喜欢" : ""}`
    : `${count || 0} 首 · ${item.source === "qq" ? "已保存到本地" : "本地"}`;
  text.append(name, meta);
  const badge = document.createElement("span");
  badge.className = "pl-badge";
  badge.textContent = remote ? "QQ" : item.source === "qq" ? "QQ" : "本地";
  row.append(cover, text, badge);
  if (!remote) {
    const remove = document.createElement("button");
    remove.className = "pl-del";
    remove.type = "button";
    remove.title = "删除这个歌单（不会删歌）";
    remove.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removePlaylist(item);
    });
    row.append(remove);
  }
  row.addEventListener("click", () => (remote ? openRemotePlaylist(item) : openPlaylist(item.id)));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (remote) openRemotePlaylist(item);
      else openPlaylist(item.id);
    }
  });
  return row;
}

async function removePlaylist(item) {
  const ok = await askConfirm({
    title: "删除这个歌单？",
    text: `「${item.name}」（${item.track_count || 0} 首）\n歌单会从本地列表删掉，歌曲文件和 QQ 音乐里的歌单都不受影响。`,
    okLabel: "删除",
  });
  if (!ok) return;
  try {
    await api.deletePlaylist(item.id);
    toast(`已删除歌单「${item.name}」`);
    if (state.playlistId === item.id) {
      state.playlistId = null;
      state.playlistName = "";
      state.currentList = [];
    }
    await loadPlaylists();
  } catch (error) {
    toast(`删除失败：${error.message}`, true);
  }
}

function playlistSection(title, count) {
  const head = document.createElement("div");
  head.className = "pl-section";
  const label = document.createElement("span");
  label.textContent = title;
  const badge = document.createElement("em");
  badge.textContent = String(count);
  head.append(label, badge);
  return head;
}

async function loadNeteasePlaylists() {
  try {
    const data = await api.neteasePlaylists();
    state.neteasePlaylists = data.items || [];
  } catch {
    state.neteasePlaylists = [];
  }
  if (state.tab === "playlists" && !state.playlistId && !state.remotePlaylistId && !state.likesView && !state.neteasePlaylistId) {
    renderPlaylistList();
  }
}

async function openNeteasePlaylist(item) {
  // 先占位，避免「读取中」时别的渲染把列表抢回去
  const playlistId = String(item.id);
  state.neteasePlaylistId = playlistId;
  el.listLabel.textContent = `网易云 ·「${item.name}」`;
  el.listMeta.textContent = "读取中…";
  el.trackList.innerHTML = '<div class="list-empty">正在读取网易云歌单…</div>';
  const PAGE = 500;
  try {
    const first = await api.neteasePlaylistTracks(playlistId, PAGE, 0);
    if (state.neteasePlaylistId !== playlistId) return;
    const total = first.total || (first.items || []).length;
    state.currentList = first.items || [];
    state.playlistName = item.name;
    state.playlistId = null;
    state.remotePlaylistId = null;
    state.likesView = false;
    state.onlineQuery = "";
    renderList();
    el.listMeta.textContent = `${state.currentList.length} / ${total} 首`;
    if (first.has_more) {
      toast(`大歌单：先显示 ${state.currentList.length} 首，后面的正在后台加载`);
      let offset = PAGE;
      while (offset < total) {
        const page = await api.neteasePlaylistTracks(playlistId, PAGE, offset);
        if (state.neteasePlaylistId !== playlistId) return;
        const batch = page.items || [];
        if (!batch.length) break;
        state.currentList = state.currentList.concat(batch);
        offset += batch.length;
        if (state.neteasePlaylistId === playlistId) {
          el.listMeta.textContent = `${state.currentList.length} / ${total} 首`;
          renderList();
        }
      }
    }
  } catch (error) {
    if (state.neteasePlaylistId !== playlistId) return;
    el.trackList.innerHTML = "";
    el.listMeta.textContent = "读取失败";
    toast(error.message || "网易云歌单读取失败", true);
  }
}

function neteasePlaylistRow(item) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "pl-row";
  const cover = document.createElement("span");
  cover.className = "pl-cover nd";
  cover.textContent = "网";
  const text = document.createElement("span");
  text.className = "pl-text";
  const name = document.createElement("strong");
  name.textContent = item.name;
  const meta = document.createElement("span");
  meta.textContent = `网易云 · ${item.count} 首`;
  text.append(name, meta);
  row.append(cover, text);
  row.addEventListener("click", () => openNeteasePlaylist(item));
  return row;
}

function renderPlaylistList() {
  el.trackList.innerHTML = "";
  const remote = readableRemotePlaylists();
  const local = state.playlists;
  const frag = document.createDocumentFragment();

  if (remote.length) {
    frag.append(playlistSection("QQ 音乐 · 登录后自动出现", remote.length));
    for (const item of remote) frag.append(playlistRow(item, true));
  }

  const ne = state.neteasePlaylists || [];
  if (ne.length) {
    frag.append(playlistSection("网易云 · 我的歌单", ne.length));
    for (const item of ne) frag.append(neteasePlaylistRow(item));
  }

  if (!qqReady()) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.append(document.createTextNode("登录 QQ 音乐后\n歌单会自动出现在这里，不用导入"));
    const login = document.createElement("button");
    login.className = "solid compact";
    login.textContent = "扫码登录";
    login.addEventListener("click", () => startQqLogin());
    empty.append(login);
    frag.append(empty);
  } else if (!remote.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.append(document.createTextNode("QQ 音乐里还没有自建歌单\n"));
    const retry = document.createElement("button");
    retry.className = "solid compact";
    retry.textContent = "重新读取";
    retry.addEventListener("click", () => loadPlaylists().catch((e) => toast(e.message, true)));
    empty.append(retry);
    frag.append(empty);
  }

  if (local.length) {
    frag.append(playlistSection("已保存到本地", local.length));
    for (const item of local) frag.append(playlistRow(item, false));
  }

  // 本地收藏：一张虚拟歌单，不占 playlists 表
  const likesRow = document.createElement("button");
  likesRow.type = "button";
  likesRow.className = "pl-row likes-row";
  likesRow.innerHTML = `<span class="pl-cover">♥</span>
    <span class="pl-text"><span class="pl-name">我喜欢</span>
    <span class="pl-meta">${state.likes.size} 首 · 只存在本地</span></span>
    <span class="pl-badge">本地</span>`;
  likesRow.addEventListener("click", openLikesView);
  frag.prepend(likesRow);
  const likesSection = playlistSection("我的收藏", 1);
  frag.insertBefore(likesSection, likesRow);

  el.trackList.append(frag);
  el.listLabel.textContent = "我的歌单";
  el.listMeta.textContent = `${remote.length + local.length} 个`;
  updateListActions();
  animateListIn();
}

function animateListIn() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!el.trackList.animate) return;
  el.trackList.animate(
    [{ opacity: 0.35, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }],
    { duration: 170, easing: "cubic-bezier(.3,.8,.3,1)" }
  );
}

async function openPlaylist(playlistId) {
  try {
    const data = await api.playlist(playlistId);
    if (state.playlistId !== playlistId) {
      state.selectMode = false;
      state.selected = new Set();
    }
    state.playlistId = playlistId;
    state.remotePlaylistId = null;
    state.playlistName = data.playlist?.name || "歌单";
    state.currentList = data.items || [];
    el.listLabel.textContent = `歌单 · ${state.playlistName}`;
    el.listMeta.textContent = `${data.total} 首`;
    renderList();
    updateListActions();
    el.trackList.scrollTop = 0;
  } catch (error) {
    toast(`打开歌单失败：${error.message}`, true);
  }
}

function showPlaylistSkeleton() {
  el.trackList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 8; i += 1) {
    const row = document.createElement("div");
    row.className = "skeleton-row";
    const thumb = document.createElement("span");
    thumb.className = "skeleton-thumb";
    const text = document.createElement("span");
    text.className = "skeleton-text";
    const line1 = document.createElement("i");
    const line2 = document.createElement("i");
    text.append(line1, line2);
    const tail = document.createElement("span");
    tail.className = "skeleton-tail";
    row.append(thumb, text, tail);
    frag.append(row);
  }
  el.trackList.append(frag);
}

async function openRemotePlaylist(item) {
  if (!item?.playlist_id) {
    toast("这个歌单没有可读的歌曲 id", true);
    return;
  }
  const cached = state.playlistCache.get(item.directory_id);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
    applyRemotePlaylist(item, cached.data);
    return;
  }
  el.listMeta.textContent = "加载中…";
  el.listLabel.textContent = `载入 ${item.name}…`;
  showPlaylistSkeleton();
  try {
    const data = await api.qqPlaylistTracks(item.directory_id);
    state.playlistCache.set(item.directory_id, { data, at: Date.now() });
    applyRemotePlaylist(item, data);
    if (data.total > data.items.length) {
      toast(`已加载前 ${data.items.length} 首，共 ${data.total} 首`);
    }
  } catch (error) {
    renderPlaylistList();
    if (error.status === 401) {
      await loadOnlineStatus();
      toast("QQ 音乐登录已失效，重新登录即可", true);
    } else {
      toast(`加载歌单失败：${error.message}`, true);
    }
  }
}

/** Force a QQ re-read for the open playlist and refresh the 24h snapshot. */
async function syncRemotePlaylist() {
  const directoryId = state.remotePlaylistId;
  if (!directoryId) return;
  const btn = el.syncPlaylistBtn;
  const idleLabel = btn?.textContent || "同步";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "同步中…";
  }
  if (el.syncNote) {
    el.syncNote.textContent = "正在从 QQ 重新读取…";
    el.syncNote.classList.remove("stale");
    el.syncNote.classList.add("wrap");
    el.syncNote.hidden = false;
  }
  const item = state.remotePlaylists.find((entry) => entry.directory_id === directoryId);
  try {
    const data = await api.syncQqPlaylist(directoryId);
    state.playlistCache.set(directoryId, { data, at: Date.now() });
    const live = Number(data.playlist?.song_count);
    if (item && Number.isFinite(live) && live > 0) item.song_count = live;
    if (state.remotePlaylistId === directoryId) {
      applyRemotePlaylist(item || { directory_id: directoryId }, data, { keepScroll: true });
    }
    const diff = [];
    if (data.added) diff.push(`+${data.added} 首`);
    if (data.removed) diff.push(`−${data.removed} 首`);
    toast(
      diff.length
        ? `已同步：${diff.join("，")}（共 ${data.total} 首）`
        : `已同步：${data.total} 首，没有变化`
    );
  } catch (error) {
    setSyncNote(item, state.playlistCache.get(directoryId)?.data ?? null);
    if (error.status === 401) {
      await loadOnlineStatus();
      toast("QQ 音乐登录已失效，重新登录即可", true);
    } else {
      toast(`同步失败：${error.message}`, true);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = idleLabel;
    }
  }
}

function sameTrackIds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

function applyRemotePlaylist(item, data, { keepScroll = false } = {}) {
  const nextList = data.items || [];
  const unchanged = keepScroll && sameTrackIds(state.currentList, nextList);
  state.playlistId = null;
  state.remotePlaylistId = item.directory_id;
  state.playlistName = data.playlist?.name || item.name;
  state.currentList = nextList;
  el.listLabel.textContent = `歌单 · ${state.playlistName}`;
  if (!unchanged) {
    el.listMeta.textContent = `${data.total} 首`;
    renderList();
  }
  setSyncNote(item, data);
  updateListActions();
  if (!keepScroll) el.trackList.scrollTop = 0;
}

function backToPlaylists() {
  state.playlistId = null;
  state.likesView = false;
  state.remotePlaylistId = null;
  state.playlistName = "";
  state.currentList = [];
  state.selectMode = false;
  state.selected = new Set();
  loadPlaylists().catch((error) => toast(error.message, true));
}

/* ----------------------------------------------------- playlist editing (local) */
function toggleSelectMode(on) {
  state.selectMode = on === undefined ? !state.selectMode : Boolean(on);
  if (!state.selectMode) state.selected = new Set();
  paintListMode();
  updateListActions();
  refreshBatchBar();
}

function toggleSelected(trackId) {
  if (state.selected.has(trackId)) state.selected.delete(trackId);
  else state.selected.add(trackId);
  const row = el.trackList.querySelector(`.track[data-id="${trackId}"]`);
  if (row) row.classList.toggle("selected", state.selected.has(trackId));
  refreshBatchBar();
}

function selectAllTracks() {
  if (!isEditablePlaylist()) return;
  const all = state.selected.size >= state.currentList.length;
  state.selected = all ? new Set() : new Set(state.currentList.map((track) => track.id));
  paintListMode();
  refreshBatchBar();
}

async function removeSelectedTracks() {
  const ids = [...state.selected];
  if (!ids.length) {
    toast("先在列表里点几首");
    return;
  }
  const name = state.playlistName || "这个歌单";
  if (!window.confirm(`从「${name}」里移除 ${ids.length} 首？QQ 音乐里的原歌单不受影响。`)) return;
  try {
    const result = await api.removePlaylistTracks(state.playlistId, ids);
    state.selected = new Set();
    await openPlaylist(state.playlistId);
    await loadPlaylists();
    toast(`已移除 ${result.removed} 首`);
  } catch (error) {
    toast(`删除失败：${error.message}`, true);
  }
}

function clearDropMarks() {
  for (const row of el.trackList.querySelectorAll(".drop-before, .drop-after")) {
    row.classList.remove("drop-before", "drop-after");
  }
}

function cleanupDrag() {
  state.dragId = null;
  clearDropMarks();
  for (const row of el.trackList.querySelectorAll(".dragging")) row.classList.remove("dragging");
}

async function persistOrder(next) {
  const previous = state.currentList;
  state.currentList = next;
  renderList();
  try {
    await api.reorderPlaylist(state.playlistId, next.map((track) => track.id));
    toast("顺序已保存");
  } catch (error) {
    state.currentList = previous;
    renderList();
    toast(`排序没保存：${error.message}`, true);
  }
}

function bindRowDrag() {
  el.trackList.addEventListener("dragstart", (event) => {
    const row = event.target.closest?.(".track");
    if (!row || !isEditablePlaylist() || state.selectMode) {
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "none";
      return;
    }
    state.dragId = Number(row.dataset.id);
    row.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", String(state.dragId));
      } catch {
        /* ignore */
      }
    }
  });

  el.trackList.addEventListener("dragover", (event) => {
    if (!state.dragId) return;
    const row = event.target.closest?.(".track");
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDropMarks();
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    row.classList.add(after ? "drop-after" : "drop-before");
  });

  el.trackList.addEventListener("drop", (event) => {
    if (!state.dragId) return;
    const row = event.target.closest?.(".track");
    event.preventDefault();
    if (!row) {
      cleanupDrag();
      return;
    }
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const targetId = Number(row.dataset.id);
    const from = state.currentList.findIndex((track) => track.id === state.dragId);
    let to = state.currentList.findIndex((track) => track.id === targetId) + (after ? 1 : 0);
    cleanupDrag();
    if (from < 0 || to < 0) return;
    const next = state.currentList.slice();
    const [moved] = next.splice(from, 1);
    if (from < to) to -= 1;
    next.splice(Math.min(to, next.length), 0, moved);
    if (next.every((track, index) => track.id === state.currentList[index].id)) return;
    persistOrder(next);
  });

  el.trackList.addEventListener("dragend", cleanupDrag);
  el.trackList.addEventListener("dragleave", (event) => {
    if (!el.trackList.contains(event.relatedTarget)) clearDropMarks();
  });
}

function openNameDialog({ title, value = "", hint, confirmText = "确定" }, onConfirm) {
  state.nameAction = onConfirm;
  el.nameTitle.textContent = title;
  el.nameInput.value = value;
  el.nameHint.textContent = hint || "只存在本地，不会改动 QQ 音乐";
  el.nameOk.textContent = confirmText;
  el.nameOverlay.classList.add("open");
  el.nameOverlay.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    el.nameInput.focus();
    el.nameInput.select();
  }, 30);
}

function closeNameDialog() {
  el.nameOverlay.classList.remove("open");
  el.nameOverlay.setAttribute("aria-hidden", "true");
  state.nameAction = null;
}

async function submitNameDialog() {
  const name = el.nameInput.value.trim();
  if (!name) {
    toast("名字不能为空", true);
    return;
  }
  const action = state.nameAction;
  closeNameDialog();
  if (action) await action(name);
}

async function newPlaylist() {
  openNameDialog(
    { title: "新建歌单", hint: "建好后可以从 QQ 歌单另存，或者手动加歌" },
    async (name) => {
      try {
        const result = await api.createPlaylist(name);
        await loadPlaylists();
        await openPlaylist(result.playlist_id);
        toast(`已建「${name}」`);
      } catch (error) {
        toast(`新建失败：${error.message}`, true);
      }
    }
  );
}

async function renameCurrentPlaylist() {
  const id = state.playlistId;
  if (!id) return;
  openNameDialog(
    { title: "改名", value: state.playlistName, hint: "只改本地的名字，QQ 里的歌单不变" },
    async (name) => {
      try {
        await api.renamePlaylist(id, name);
        state.playlistName = name;
        el.listLabel.textContent = `歌单 · ${name}`;
        await loadPlaylists();
        toast("已改名");
      } catch (error) {
        toast(`改名失败：${error.message}`, true);
      }
    }
  );
}

async function saveQqPlaylistAsLocal() {
  const directoryId = state.remotePlaylistId;
  if (!directoryId) return;
  const btn = el.saveQqBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
  }
  try {
    const result = await api.saveQqPlaylist(directoryId);
    await loadPlaylists();
    await openPlaylist(result.playlist_id);
    toast(
      result.created
        ? `已另存为「${result.name}」· ${result.saved} 首`
        : `已更新「${result.name}」· ${result.saved} 首`
    );
  } catch (error) {
    if (error.status === 401) {
      await loadOnlineStatus();
      toast("QQ 音乐登录已失效，重新登录即可", true);
    } else {
      toast(`另存失败：${error.message}`, true);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "另存为我的歌单";
    }
  }
}

/* ------------------------------------------------------- QQ playlist import */
function openQqImport() {
  state.qqImportOpen = true;
  state.qqDetail = null;
  el.qqImportOverlay.classList.add("open");
  el.qqImportOverlay.setAttribute("aria-hidden", "false");
  el.qqImportStatus.textContent = "只复制到本地歌单，不会改动 QQ 音乐里的内容";
  el.qqPlaylistPreview.innerHTML = '<p class="import-empty">在左边选一个歌单，先看看曲目</p>';
  loadQqPlaylists();
  el.closeQqImport.focus({ preventScroll: true });
}

function closeQqImport() {
  state.qqImportOpen = false;
  el.qqImportOverlay.classList.remove("open");
  el.qqImportOverlay.setAttribute("aria-hidden", "true");
}

async function loadQqPlaylists() {
  el.qqPlaylistList.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "import-empty";
  loading.textContent = "正在读取 QQ 歌单…";
  el.qqPlaylistList.append(loading);
  try {
    const data = await api.qqPlaylists();
    state.qqPlaylists = data.items || [];
    renderQqPlaylistRows();
  } catch (error) {
    el.qqPlaylistList.innerHTML = "";
    const fail = document.createElement("p");
    fail.className = "import-empty";
    fail.textContent =
      error.status === 401
        ? "QQ 音乐登录已失效，去「账号与连接」重新登录"
        : `读取失败：${error.message}`;
    el.qqPlaylistList.append(fail);
    if (error.status === 401) loadOnlineStatus();
  }
}

function renderQqPlaylistRows() {
  el.qqPlaylistList.innerHTML = "";
  if (!state.qqPlaylists.length) {
    const empty = document.createElement("p");
    empty.className = "import-empty";
    empty.textContent = "QQ 音乐里还没有自建歌单";
    el.qqPlaylistList.append(empty);
    return;
  }
  for (const item of state.qqPlaylists) {
    const row = document.createElement("button");
    row.className = "qq-row";
    row.type = "button";
    row.dataset.directoryId = String(item.directory_id);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name;
    row.append(name);
    if (item.liked) {
      const badge = document.createElement("span");
      badge.className = "pl-badge";
      badge.textContent = "喜欢";
      row.append(badge);
    }
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(item.song_count || 0);
    row.append(count);
    if (!item.playlist_id) {
      row.disabled = true;
      row.title = "这个列表没有可读的歌曲 id";
    }
    row.addEventListener("click", () => selectQqPlaylist(item));
    el.qqPlaylistList.append(row);
  }
}

async function selectQqPlaylist(item) {
  for (const row of el.qqPlaylistList.querySelectorAll(".qq-row")) {
    row.classList.toggle("active", row.dataset.directoryId === String(item.directory_id));
  }
  el.qqPlaylistPreview.innerHTML = '<p class="import-empty">正在读取曲目…</p>';
  try {
    const data = await api.qqPlaylist(item.directory_id);
    state.qqDetail = data;
    renderQqPreview(data);
  } catch (error) {
    el.qqPlaylistPreview.innerHTML = "";
    const fail = document.createElement("p");
    fail.className = "import-empty";
    fail.textContent = error.status === 401 ? "登录已失效，请重新登录" : `读取失败：${error.message}`;
    el.qqPlaylistPreview.append(fail);
    if (error.status === 401) loadOnlineStatus();
  }
}

function renderQqPreview(data) {
  el.qqPlaylistPreview.innerHTML = "";
  const head = document.createElement("div");
  head.className = "preview-head";
  const info = document.createElement("div");
  info.className = "preview-text";
  const title = document.createElement("h3");
  title.textContent = data.playlist.name;
  const sub = document.createElement("span");
  sub.className = "muted";
  sub.textContent =
    data.total > data.items.length
      ? `${data.total} 首 · 先预览前 ${data.items.length} 首`
      : `${data.total} 首`;
  info.append(title, sub);
  const importButton = document.createElement("button");
  importButton.className = "solid";
  importButton.textContent = "导入到本地";
  importButton.addEventListener("click", () => importQqPlaylist(data.playlist, importButton));
  head.append(info, importButton);

  const songs = document.createElement("div");
  songs.className = "preview-songs";
  data.items.forEach((song, index) => {
    const row = document.createElement("div");
    row.className = "pv-song";
    const no = document.createElement("span");
    no.className = "n";
    no.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "t";
    name.textContent = song.title;
    const artist = document.createElement("span");
    artist.className = "a";
    artist.textContent = song.artist;
    row.append(no, name, artist);
    songs.append(row);
  });
  el.qqPlaylistPreview.append(head, songs);
  if (window.matchMedia("(max-width: 720px)").matches) {
    el.qqPlaylistPreview.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

async function importQqPlaylist(playlist, button) {
  if (!playlist?.playlist_id) {
    toast("这个歌单没有可读的歌曲 id", true);
    return;
  }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "导入中…";
  el.qqImportStatus.textContent = "正在复制曲目，大歌单可能要几十秒…";
  try {
    const result = await api.importQqPlaylist(playlist.directory_id);
    toast(`已导入「${result.name}」${result.imported} 首`);
    closeQqImport();
    await loadPlaylists();
    await openPlaylist(result.playlist_id);
  } catch (error) {
    el.qqImportStatus.textContent =
      error.status === 401 ? "登录已失效，请重新登录" : `导入失败：${error.message}`;
    toast(`导入失败：${error.message}`, true);
    button.disabled = false;
    button.textContent = label;
    if (error.status === 401) loadOnlineStatus();
  }
}

function markActive() {
  let activeRow = null;
  for (const row of $$(".track", el.trackList)) {
    const active = Number(row.dataset.id) === state.activeId;
    row.classList.toggle("active", active);
    if (active) activeRow = row;
  }
  if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
}

/* ------------------------------------------------------------------ queue */
function renderQueue() {
  el.queueCount.textContent = String(player.queue.length);
  el.queueList.innerHTML = "";
  const total = player.queue.reduce((sum, t) => sum + (t.duration_ms || 0), 0);
  el.queueMeta.textContent = `${player.queue.length} 首 · ${Math.round(total / 60000)} 分钟`;

  if (!player.queue.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = "队列是空的";
    el.queueList.append(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  player.queue.forEach((track, i) => {
    const item = document.createElement("div");
    item.className = "queue-item" + (player.track && track.id === player.track.id ? " active" : "");
    item.dataset.index = String(i);
    item.dataset.id = String(track.id);
    item.draggable = true;
    item.setAttribute("role", "button");
    item.tabIndex = 0;

    const no = document.createElement("span");
    no.className = "no";
    no.textContent = String(i + 1).padStart(2, "0");

    const thumb = document.createElement("span");
    thumb.className = "thumb";
    const hue = hueOf(track.id);
    thumb.style.setProperty("--c1", `hsl(${hue} 52% 30%)`);
    thumb.style.setProperty("--c2", `hsl(${(hue + 50) % 360} 55% 15%)`);
    const fallback = document.createElement("span");
    fallback.className = "thumb-fallback";
    fallback.textContent = initialOf(track);
    thumb.append(fallback);
    if (track.cover_url) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = track.cover_url;
      img.addEventListener("error", () => img.remove());
      thumb.append(img);
    }

    const text = document.createElement("span");
    text.className = "track-text";
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = track.title;
    const a = document.createElement("span");
    a.className = "a";
    a.textContent = track.artist || "未知歌手";
    text.append(t, a);

    const dur = document.createElement("span");
    dur.className = "dur";
    dur.textContent = fmtTime(track.duration_ms);

    const insert = document.createElement("button");
    insert.type = "button";
    insert.className = "queue-insert";
    insert.title = "下一首播放";
    insert.textContent = "↳";

    item.append(no, thumb, text, dur, insert);
    frag.append(item);
  });
  el.queueList.append(frag);
}

function openQueue() {
  state.queueOpen = true;
  el.queuePanel.classList.add("open");
  el.queuePanel.setAttribute("aria-hidden", "false");
  renderQueue();
  const active = $(".queue-item.active", el.queueList);
  if (active) active.scrollIntoView({ block: "center" });
}

function closeQueue() {
  state.queueOpen = false;
  el.queuePanel.classList.remove("open");
  el.queuePanel.setAttribute("aria-hidden", "true");
}

/* ----------------------------------------------------------------- lyrics */
function updatePeek(ms) {
  const data = state.lyrics;
  let key;
  if (data === null) key = "loading";
  else if (!data.lines.length) key = "none";
  else key = data.synced ? activeLineIndex(data.lines, ms) : 0;
  if (state.peekKey === key) return;
  state.peekKey = key;

  el.peekPrev.classList.remove("active");
  el.peekNext.classList.remove("active");
  el.peekCur.classList.add("active");

  if (key === "loading") {
    el.peekPrev.textContent = "";
    el.peekCur.textContent = "正在找歌词…";
    el.peekNext.textContent = "";
    el.peekCur.classList.add("empty");
    return;
  }
  if (key === "none") {
    el.peekPrev.textContent = "";
    el.peekCur.textContent = "这首歌没有歌词，听会儿曲子";
    el.peekNext.textContent = "";
    el.peekCur.classList.add("empty");
    return;
  }

  el.peekCur.classList.remove("empty");
  const lines = data.lines;
  const idx = key;
  if (idx < 0) {
    el.peekPrev.textContent = "";
    el.peekCur.textContent = "♪ 前奏";
    el.peekNext.textContent = lines[0]?.text || "";
  } else {
    el.peekPrev.textContent = idx > 0 ? lines[idx - 1]?.text || "" : "";
    el.peekCur.textContent = lines[idx]?.text || "—";
    el.peekNext.textContent = idx + 1 < lines.length ? lines[idx + 1]?.text || "" : "♪ 尾奏";
  }
}

async function loadLyrics(track) {
  const token = ++state.lyricsToken;
  state.lyrics = null;
  state.peekKey = null;
  updatePeek(lyricTimeMs());
  try {
    const data = await api.lyrics(track.id);
    if (token !== state.lyricsToken) return;
    if (data.synced && data.lines.length) {
      // QQ/网易的 LRC 开头常塞制作名单，别让它们占着歌词页。
      const credit = /^(作词|作曲|编曲|制作人|词|曲|合声编写|合声|和声|吉他|贝斯|鼓|录音助理|录音工程|录音|混音工程|混音|母带后期|母带|人声|弦乐|监制|策划|统筹|发行|出品|配唱|音频编辑|OP|SP|制作)\s*[:：]/i;
      const cleaned = data.lines.filter((line) => {
        const text = (line.text || "").trim();
        if (!text) return false;
        if (credit.test(text)) return false;
        if (text.includes(" - ") && text.includes(track.title)) return false;
        return true;
      });
      if (cleaned.length) data.lines = cleaned;
    }
    if (data.synced && data.lines.length && data.lines[0].t > 5000) {
      data.lines = [{ t: 0, text: "♪ 前奏" }, ...data.lines];
    }
    state.lyrics = data;
    state.peekKey = null;
    lyricsView.setLines(data.lines, data.synced);
    if (state.lyricsOpen) {
      lyricsView.setOpen(true);
      lyricsView.update(lyricTimeMs(), true);
      lyricsView.setProgress(lyricTimeMs());
    }
    updatePeek(lyricTimeMs());
  } catch {
    if (token !== state.lyricsToken) return;
    state.lyrics = { lines: [], synced: false };
    state.peekKey = null;
    lyricsView.setLines([], false);
    updatePeek(lyricTimeMs());
  }
}

function openLyrics() {
  if (!player.track) {
    toast("先挑一首歌吧");
    return;
  }
  state.lyricsOpen = true;
  el.overlay.classList.add("open");
  syncDragBar();
  el.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("lyrics-open");
  lyricsView.setOpen(true);
  lyricsView.update(lyricTimeMs(), true);
  lyricsView.setProgress(lyricTimeMs());
  syncOverlayPlayLabel();
}

function closeLyrics() {
  state.lyricsOpen = false;
  el.overlay.classList.remove("open");
  syncDragBar();
  el.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lyrics-open");
  lyricsView.setOpen(false);
}

function toggleLyrics() {
  if (state.lyricsOpen) closeLyrics();
  else openLyrics();
}

function syncOverlayPlayLabel() {
  if (!el.loPlay) return;
  const playing = player.playing;
  el.loPlay.setAttribute("aria-label", playing ? "暂停" : "播放");
  el.loPlay.title = playing ? "暂停" : "播放";
  if (el.loPlayIcon) el.loPlayIcon.setAttribute("href", playing ? "#i-pause" : "#i-play");
}

/* --------------------------------------------------------- lyric clock */
function lyricTimeMs() {
  return player.currentTimeMs + state.lyricOffset;
}

function updateLyricOffsetLabel() {
  const seconds = state.lyricOffset / 1000;
  el.lyrOffsetLabel.textContent = `${seconds > 0 ? "+" : ""}${seconds.toFixed(1)}s`;
}

function loadLyricOffset(track) {
  let value = 0;
  try {
    value = Number(localStorage.getItem(`mh.lyr.${track.id}`) || 0);
  } catch {
    value = 0;
  }
  state.lyricOffset = Number.isFinite(value) ? clamp(value, -5000, 5000) : 0;
  updateLyricOffsetLabel();
}

function setLyricOffset(ms, persist = true) {
  state.lyricOffset = clamp(Math.round(ms / 500) * 500, -5000, 5000);
  updateLyricOffsetLabel();
  if (persist && player.track) {
    try {
      localStorage.setItem(`mh.lyr.${player.track.id}`, String(state.lyricOffset));
    } catch {
      /* ignore */
    }
  }
  state.peekKey = null;
  const time = lyricTimeMs();
  updatePeek(time);
  lyricsView.update(time, true);
  lyricsView.setProgress(time);
}

/* ------------------------------------------------------------- resume */
const RESUME_KEY = "mh.resume";
let lastResumeSave = 0;

function readResume() {
  try {
    const raw = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
    return raw && Number.isFinite(raw.id) && Number.isFinite(raw.position) ? raw : null;
  } catch {
    return null;
  }
}

function saveResume(trackId = player.track?.id, position = player.currentTimeMs) {
  if (!trackId) return;
  try {
    localStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ id: trackId, position: Math.max(0, Math.round(position)), at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

function clearResume() {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------- time */
let barDragging = false;
let barPct = 0;

function paintBar(pct, ms) {
  el.barFill.style.width = `${pct * 100}%`;
  el.barKnob.style.left = `${pct * 100}%`;
  el.curTime.textContent = fmtTime(ms);
}

function updateTime(ms) {
  // 时长三级回退：播放器元数据 → 曲目自带时长 → 0，避免整屏歌词读到 00:00
  const duration =
    player.durationMs || player.track?.duration_ms || state.duration || 0;
  const pct = duration > 0 ? clamp(ms / duration, 0, 1) : 0;
  if (!barDragging) {
    paintBar(pct, ms);
  }
  el.loProgress.style.width = `${pct * 100}%`;
  el.loTime.textContent = `${fmtTime(ms)} / ${fmtTime(duration)}`;
  const lyricTime = ms + state.lyricOffset;
  updatePeek(lyricTime);
  lyricsView.update(lyricTime);
  lyricsView.setProgress(lyricTime);
  journal.tick(ms);
  updatePositionState(ms);
  if (ms > 1000 && performance.now() - lastResumeSave > 3000) {
    lastResumeSave = performance.now();
    saveResume();
  }
}

function loop() {
  if (player.playing || barDragging) updateTime(player.currentTimeMs);
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- player UI */
function setPlayIcon(playing) {
  el.playIcon.innerHTML = `<use href="#i-${playing ? "pause" : "play"}"></use>`;
  document.body.classList.toggle("playing", playing);
  syncOverlayPlayLabel();
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }
}

/* 播放模式：随机 + 循环合并成一个入口（走查 D-2：三个圆钮权重一样，分不清主次） */
const PLAY_MODES = {
  order: { label: "顺序播放", icon: "#i-order" },
  all: { label: "列表循环", icon: "#i-repeat" },
  one: { label: "单曲循环", icon: "#i-repeat-one" },
  shuffle: { label: "随机播放", icon: "#i-shuffle" },
};

function playModeOf() {
  if (player.shuffle) return "shuffle";
  if (player.repeat === "one") return "one";
  if (player.repeat === "all") return "all";
  return "order";
}

function updatePlayModeUI() {
  const mode = playModeOf();
  const meta = PLAY_MODES[mode];
  if (el.playModeIcon) el.playModeIcon.setAttribute("href", meta.icon);
  if (el.playModeBtn) {
    el.playModeBtn.title = `播放模式：${meta.label}`;
    el.playModeBtn.setAttribute("aria-label", `播放模式：${meta.label}`);
    el.playModeBtn.classList.toggle("active", mode !== "order");
  }
  if (el.playModeMenu) {
    for (const item of el.playModeMenu.querySelectorAll("[data-mode]")) {
      const on = item.dataset.mode === mode;
      item.classList.toggle("on", on);
      item.setAttribute("aria-checked", String(on));
    }
  }
}

function setPlayMode(mode, { quiet = false } = {}) {
  if (!PLAY_MODES[mode]) return;
  if (mode === "shuffle") {
    if (!player.shuffle) player.toggleShuffle();
    player.repeat = "all";
  } else {
    if (player.shuffle) player.toggleShuffle();
    player.repeat = mode === "one" ? "one" : mode === "all" ? "all" : "off";
  }
  updatePlayModeUI();
  if (!quiet) toast(`播放模式：${PLAY_MODES[mode].label}`);
}

function openPlayModeMenu() {
  if (!el.playModeMenu) return;
  updatePlayModeUI();
  el.playModeMenu.hidden = false;
  el.playModeBtn?.setAttribute("aria-expanded", "true");
  state.playModeOpen = true;
}

function closePlayModeMenu() {
  if (!el.playModeMenu) return;
  el.playModeMenu.hidden = true;
  el.playModeBtn?.setAttribute("aria-expanded", "false");
  state.playModeOpen = false;
}

function togglePlayModeMenu() {
  if (state.playModeOpen) closePlayModeMenu();
  else openPlayModeMenu();
}

function updateVolumeUI(value) {
  el.volume.value = String(value);
  el.volume.style.setProperty("--vol", `${value}%`);
  const icon = player.audio.muted || value === 0 ? "#i-mute" : "#i-volume";
  el.muteBtn.querySelector("use").setAttribute("href", icon);
}

/* ------------------------------------------------------------------ glass */
const GLASS_KEY = "mh.glass";

function applyGlass(on, persist = true) {
  document.documentElement.dataset.glass = on ? "on" : "off";
  el.glassBtn.classList.toggle("active", on);
  el.glassBtn.setAttribute("aria-pressed", String(on));
  el.glassBtn.title = on ? "玻璃拟态：开（G）" : "玻璃拟态：关（G）";
  if (persist) localStorage.setItem(GLASS_KEY, on ? "on" : "off");
}

function toggleGlass() {
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) {
    toast("系统开启了「减少透明度」，玻璃皮肤已禁用");
    return;
  }
  applyGlass(document.documentElement.dataset.glass !== "on");
}

function initGlass() {
  const stored = localStorage.getItem(GLASS_KEY);
  const reduced = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  let on = stored === "on";
  if (stored === null && mobile) on = false;
  if (reduced) on = false;
  applyGlass(on, false);
}

/* ------------------------------------------------------------------- data */
async function loadLibrary(query = "") {
  const data = await api.tracks(query);
  state.tracks = data.items;
  if (el.libCount) el.libCount.textContent = String(data.total);
  if (state.tab !== "library" && state.tab !== "search") return;
  state.currentList = data.items;
  el.listLabel.textContent = query ? `搜索「${query}」` : "全部歌曲";
  renderList();
}

/* ------------------------------------------------------------- unified search */
/* 一次输入同时查本地与 QQ，结果分组呈现：本地命中直接播，在线结果单独一段。 */
async function runSearch(query) {
  const q = String(query || "").trim();
  state.searchQuery = q;
  if (!q) {
    state.searchLocal = [];
    state.searchOnline = [];
    setTab("recent");
    return;
  }
  state.tab = "search";
  state.playlistId = null;
  state.remotePlaylistId = null;
  state.likesView = false;
  for (const btn of el.tabs) btn.classList.remove("active");
  el.search.placeholder = "搜索本地 / QQ 音乐";
  el.listLabel.textContent = `搜索「${q}」`;
  el.listMeta.textContent = "搜索中…";
  el.trackList.innerHTML = '<div class="list-empty">正在本地和 QQ 音乐里找…</div>';
  updateListActions();

  const [localResult, onlineResult] = await Promise.allSettled([
    api.tracks(q),
    qqReady() ? api.onlineSearch(q, 12) : Promise.resolve({ items: [] }),
  ]);
  if (state.searchQuery !== q) return; // a newer keystroke won
  state.searchLocal = localResult.status === "fulfilled" ? localResult.value.items || [] : [];
  state.searchOnline = onlineResult.status === "fulfilled" ? onlineResult.value.items || [] : [];
  state.searchOnlineError = onlineResult.status === "rejected" ? onlineResult.reason : null;
  state.currentList = [...state.searchLocal, ...state.searchOnline];
  renderSearch();
}

function renderSearch() {
  const q = state.searchQuery;
  const local = state.searchLocal || [];
  const online = state.searchOnline || [];
  el.trackList.innerHTML = "";
  el.listLabel.textContent = `搜索「${q}」`;
  el.listMeta.textContent = `${local.length} 本地 · ${online.length} 在线`;

  const section = (label, count) => {
    const head = document.createElement("div");
    head.className = "search-section";
    head.textContent = `${label} · ${count}`;
    return head;
  };

  if (local.length) {
    el.trackList.append(section("本地曲库", local.length));
    for (const track of local) el.trackList.append(trackRow(track, false));
  }
  if (online.length) {
    el.trackList.append(section("QQ 音乐", online.length));
    for (const track of online) el.trackList.append(trackRow(track, false));
  }

  if (!local.length && !online.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    const reason = state.searchOnlineError
      ? `QQ 音乐这次没搜成（${state.searchOnlineError.message || "网络或登录问题"}）`
      : qqReady()
        ? "本地和 QQ 音乐都没有这首歌"
        : "本地没有，登录 QQ 音乐后能一起搜";
    empty.append(document.createTextNode(`${reason}\n`));
    if (qqReady()) {
      const again = document.createElement("button");
      again.className = "solid compact";
      again.textContent = "只搜 QQ 音乐";
      again.addEventListener("click", () => {
        setTab("online");
        el.search.value = q;
        loadOnline(q);
      });
      empty.append(again);
    } else {
      const login = document.createElement("button");
      login.className = "solid compact";
      login.textContent = "扫码登录";
      login.addEventListener("click", () => startQqLogin());
      empty.append(login);
    }
    el.trackList.append(empty);
  }
  if (local.length && !online.length && qqReady()) {
    const hint = document.createElement("div");
    hint.className = "search-hint";
    hint.textContent = "QQ 音乐没有更多结果";
    el.trackList.append(hint);
  }
  markActive();
  animateListIn();
}

async function loadRecent() {
  const data = await api.recent();
  state.recent = data.items;
  state.currentList = data.items;
  el.listLabel.textContent = "最近播放";
  renderList();
}

async function loadOnline(query = "") {
  const q = query.trim();
  if (!q) {
    state.onlineQuery = "";
    state.currentList = [];
    el.listLabel.textContent = "QQ 音乐";
    el.listMeta.textContent = "在线";
    renderList();
    return;
  }
  const token = ++onlineToken;
  const onlineLabel = PROVIDER_LABELS[state.onlineProvider] || "QQ 音乐";
  el.listLabel.textContent = `${onlineLabel} ·「${q}」`;
  el.listMeta.textContent = "搜索中…";
  try {
    const data = await api.onlineSearch(q, 24, state.onlineProvider);
    if (token !== onlineToken) return;
    state.onlineQuery = q;
    state.currentList = data.items;
    renderList();
    if (!data.items.length) el.listMeta.textContent = "0 首";
  } catch (error) {
    if (token !== onlineToken) return;
    state.onlineQuery = q;
    state.currentList = [];
    renderList();
    el.listMeta.textContent = "搜索失败";
    if (error.status === 401) {
      toast("QQ 音乐登录已失效，在「账号与连接」里点重新登录", true);
      loadOnlineStatus();
    } else {
      toast(`${error.message}`, true);
    }
  }
}

async function refreshStats() {
  try {
    const stats = await api.statsToday();
    state.todayStats = stats;
    updateHome();
    if (!stats.plays) {
      el.todayStats.textContent = "今天还没开始听";
    } else {
      const minutes = Math.round(stats.played_ms / 60000);
      el.todayStats.textContent = `今天 ${stats.plays} 首 · ${
        minutes > 0 ? `${minutes} 分钟` : "不到 1 分钟"
      }`;
    }
  } catch {
    /* ignore */
  }
}

function setTab(tab) {
  state.likesView = false;
  // 侧栏任意 tab 都表示「回管家」，先退出星海整页
  if (el.starfieldOverlay?.classList.contains("open")) closeStarfieldPanel();
  state.tab = tab;
  state.playlistId = null;
  state.remotePlaylistId = null;
  state.neteasePlaylistId = null;
  state.playlistName = "";
  for (const btn of el.tabs) btn.classList.toggle("active", btn.dataset.tab === tab);
  const onlineLabel = PROVIDER_LABELS[state.onlineProvider] || "QQ 音乐";
  el.search.placeholder =
    tab === "online" ? `搜 ${onlineLabel} 里的歌` : tab === "playlists" ? "我的歌单" : "搜索歌曲、歌手";
  if (el.providerSwitch) el.providerSwitch.hidden = tab !== "online";
  if (tab === "online") updateProviderLoginBtn();
  updateListActions();
  if (tab === "library") {
    loadLibrary(el.search.value.trim()).catch((e) => toast(e.message, true));
  } else if (tab === "recent") {
    loadRecent().catch((e) => toast(e.message, true));
  } else if (tab === "playlists") {
    if (state.remotePlaylists.length || state.playlists.length) renderPlaylistList();
    loadPlaylists().catch((e) => toast(e.message, true));
    loadNeteasePlaylists();
  } else {
    loadOnline(el.search.value.trim()).catch((e) => toast(e.message, true));
  }
}

/* ---------------------------------------------------------------- roadmap */
function renderRoadmapPill(data) {
  el.roadmapPct.textContent = `${data.overall}%`;
  const segments = el.roadmapMini.children;
  data.milestones.slice(0, 4).forEach((item, index) => {
    if (segments[index]) segments[index].style.setProperty("--p", `${item.percent}%`);
  });
  el.roadmapBtn.title = `项目路线图 · ${data.overall}%（R）`;
}

function renderRoadmapModal(data) {
  el.roadmapBig.textContent = `${data.overall}%`;
  el.roadmapUpdated.textContent = data.updated_at || "—";
  el.roadmapNext.textContent = data.next || "—";
  el.roadmapFill.style.width = "0%";
  requestAnimationFrame(() => {
    el.roadmapFill.style.width = `${data.overall}%`;
  });

  el.roadmapList.innerHTML = "";
  const frag = document.createDocumentFragment();
  data.milestones.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = `rm-item ${item.status}`;

    const top = document.createElement("div");
    top.className = "rm-top";
    const no = document.createElement("span");
    no.className = "rm-no";
    no.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "rm-name";
    name.textContent = item.name;
    const pct = document.createElement("span");
    pct.className = "rm-pct";
    pct.textContent = `${item.percent}%`;
    top.append(no, name, pct);

    const bar = document.createElement("div");
    bar.className = "rm-bar";
    const fill = document.createElement("i");
    bar.append(fill);

    const detail = document.createElement("p");
    detail.textContent = item.detail || "";
    row.append(top, bar, detail);
    frag.append(row);

    requestAnimationFrame(() => {
      fill.style.width = `${item.percent}%`;
    });
  });
  el.roadmapList.append(frag);
}

async function loadRoadmap() {
  try {
    const data = await api.roadmap();
    state.roadmap = data;
    renderRoadmapPill(data);
    if (state.roadmapOpen) renderRoadmapModal(data);
  } catch {
    el.roadmapPct.textContent = "—";
  }
}

function openRoadmap() {
  state.roadmapOpen = true;
  el.roadmapOverlay.classList.add("open");
  el.roadmapOverlay.setAttribute("aria-hidden", "false");
  if (state.roadmap) renderRoadmapModal(state.roadmap);
  loadRoadmap();
  el.closeRoadmap.focus({ preventScroll: true });
}

function closeRoadmap() {
  state.roadmapOpen = false;
  el.roadmapOverlay.classList.remove("open");
  el.roadmapOverlay.setAttribute("aria-hidden", "true");
  el.roadmapBtn.focus({ preventScroll: true });
}

/* ------------------------------------------------------- accounts / login */
const ONBOARD_KEY = "mh.onboarded";
let loginTimer = 0;
let loginStartedAt = 0;

function qqProvider() {
  return (state.online?.providers || []).find((provider) => provider.name === "qq") || null;
}

function qqReady() {
  return Boolean(qqProvider()?.ready);
}

function setPill(node, text, tone = "") {
  if (!node) return;
  node.textContent = text;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

async function loadOnlineStatus() {
  try {
    state.online = await api.onlineStatus();
  } catch {
    return state.online;
  }
  renderOnlineState();
  renderAccountList();
  if (state.tab === "online" && !state.onlineQuery && !state.currentList.length) renderList();
  if (state.online?.login?.running) startLoginPolling();
  return state.online;
}

function renderOnlineState() {
  const qq = qqProvider();
  const login = state.online?.login || {};
  const waiting = Boolean(login.running);
  const count = state.tracks.length;

  setPill(el.obLibState, count ? `${count} 首` : "未扫描", count ? "ok" : "");
  if (el.obLibHint) {
    el.obLibHint.textContent = count
      ? `当前曲库 ${count} 首；要加别的文件夹就填在下面。`
      : "本地曲库不需要登录，扫完就能播。";
  }

  const qqState = waiting ? "等待扫码…" : qq?.ready ? "已连接" : qq?.expired ? "已失效" : "未连接";
  const qqTone = qq?.ready ? "ok" : waiting ? "busy" : qq?.expired ? "bad" : "";
  setPill(el.obQqState, qqState, qqTone);
  if (el.obLogin) {
    el.obLogin.disabled = waiting;
    el.obLogin.textContent = waiting
      ? "等待扫码…"
      : qq?.ready
        ? "重新扫码"
        : qq?.expired
          ? "失效，点此重登"
          : "扫码登录";
  }
  if (el.obLoginNote) {
    el.obLoginNote.textContent = waiting
      ? "在打开的浏览器窗口里扫码，完成后自动返回"
      : qq?.expired
        ? "登录态已过期，重新扫码即可恢复"
        : qq?.ready && qq.account
          ? `已登录 ${qq.account}`
          : "";
  }
  if (el.accountUpdated) {
    el.accountUpdated.textContent = qq?.ready
      ? `QQ 音乐已连接${qq.account ? ` · ${qq.account}` : ""}`
      : qq?.expired
        ? "QQ 音乐登录已失效"
        : "QQ 音乐未连接";
  }
}

function accountCard({ badge, name, meta, status, tone = "", actions = [] }) {
  const card = document.createElement("div");
  card.className = "account-card" + (tone === "off" ? " is-disabled" : "");
  const top = document.createElement("div");
  top.className = "account-top";
  const logo = document.createElement("div");
  logo.className = "account-logo";
  logo.textContent = badge;
  const identity = document.createElement("div");
  identity.className = "account-id";
  const title = document.createElement("strong");
  title.textContent = name;
  const detail = document.createElement("span");
  detail.textContent = meta;
  identity.append(title, detail);
  const pill = document.createElement("span");
  pill.className = "ob-pill";
  pill.textContent = status;
  if (tone) pill.dataset.tone = tone;
  top.append(logo, identity, pill);
  card.append(top);
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "account-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "ghost" + (action.danger ? " danger" : "");
      button.textContent = action.label;
      button.disabled = Boolean(action.disabled);
      button.addEventListener("click", action.onClick);
      row.append(button);
    }
    card.append(row);
  }
  return card;
}

function renderAccountList() {
  if (!el.accountList) return;
  el.accountList.innerHTML = "";
  const qq = qqProvider();
  const login = state.online?.login || {};
  const waiting = Boolean(login.running);
  const metaParts = [];
  if (qq?.ready) {
    if (qq.account) metaParts.push(qq.account);
    if (qq.session_updated_at) metaParts.push(`登录于 ${fmtWhen(qq.session_updated_at)}`);
  } else if (qq?.expired) {
    metaParts.push("登录已失效，点「重新登录」");
  } else {
    metaParts.push(qq?.message || "还没有登录");
  }
  const canManage = Boolean(qq?.ready || qq?.expired);
  const actions = waiting
    ? [{ label: "等待扫码…", disabled: true }]
    : canManage
      ? [
          { label: "重新登录", onClick: reloginQq },
          { label: "退出登录", danger: true, onClick: logoutQq },
        ]
      : [{ label: "扫码登录", onClick: () => startQqLogin() }];
  el.accountList.append(
    accountCard({
      badge: "QQ",
      name: "QQ 音乐",
      meta: metaParts.join(" · "),
      status: waiting ? "等待扫码…" : qq?.ready ? "已连接" : qq?.expired ? "已失效" : "未连接",
      tone: qq?.ready ? "ok" : waiting ? "busy" : qq?.expired ? "bad" : "",
      actions,
    })
  );
  const ne = (state.online?.providers || []).find((item) => item.name === "netease") || {};
  el.accountList.append(
    accountCard({
      badge: "网",
      name: "网易云音乐",
      meta: ne.ready ? [ne.account, ne.session_updated_at ? `登录于 ${fmtWhen(ne.session_updated_at)}` : "", ne.message || ""].filter(Boolean).join(" · ") : ne.message || "还没登录",
      status: ne.account ? "已连接" : "未登录",
      tone: ne.account ? "ok" : "",
      actions: ne.account
        ? [{ label: "退出登录", danger: true, onClick: logoutNetease }]
        : [{ label: "扫码登录", onClick: openNeteaseQr }],
    })
  );
  el.accountList.append(accountCard({ badge: "酷", name: "酷狗音乐", meta: "接口要签名，登录还没打通", status: "未接入", tone: "off", actions: [{ label: "扫码登录", onClick: () => toast("酷狗登录接口要签名（20010），还在攻；搜索已经能用", true) }] }));
}

/* 网易云扫码登录：拿 unikey → 显示二维码 → 每 2 秒问一次状态 */
let neQrKey = null;
let neQrTimer = 0;

function stopNeteaseQrPoll() {
  if (neQrTimer) clearInterval(neQrTimer);
  neQrTimer = 0;
}

function closeNeteaseQr() {
  stopNeteaseQrPoll();
  if (!el.qrOverlay) return;
  el.qrOverlay.classList.remove("open");
  el.qrOverlay.setAttribute("aria-hidden", "true");
}

async function refreshNeteaseQr() {
  try {
    const data = await api.neteaseQr();
    neQrKey = data.key;
    if (el.qrImg) el.qrImg.src = `${data.png}&t=${Date.now()}`;
    if (el.qrStatus) el.qrStatus.textContent = "打开网易云 App → 扫一扫";
    stopNeteaseQrPoll();
    neQrTimer = setInterval(async () => {
      if (!neQrKey) return;
      try {
        const result = await api.neteaseQrCheck(neQrKey);
        if (el.qrStatus) el.qrStatus.textContent = result.message || "";
        if (result.code === 803) {
          stopNeteaseQrPoll();
          closeNeteaseQr();
          toast("网易云登录成功");
          await loadOnlineStatus();
          renderAccountList();
        } else if (result.code === 800) {
          stopNeteaseQrPoll();
        }
      } catch {
        /* 网络抖动就等下一轮 */
      }
    }, 2000);
  } catch (error) {
    toast(error.message || "拿二维码失败", true);
  }
}

async function openNeteaseQr() {
  if (!el.qrOverlay) return;
  // 先把「账号与连接」这层关掉，二维码单独一层，不会被别的弹窗压住
  if (el.accountOverlay?.classList.contains("open")) closeAccount();
  el.qrOverlay.classList.add("open");
  el.qrOverlay.setAttribute("aria-hidden", "false");
  await refreshNeteaseQr();
}

async function logoutNetease() {
  try {
    await api.neteaseLogout();
    toast("网易云已退出");
    await loadOnlineStatus();
    renderAccountList();
  } catch (error) {
    toast(error.message || "退出失败", true);
  }
}

/* 音源切换栏里的「扫码登录」：按当前选中的音源决定走哪套登录 */
function updateProviderLoginBtn() {
  if (!el.providerLoginBtn) return;
  const provider = state.onlineProvider;
  const entry = (state.online?.providers || []).find((item) => item.name === provider);
  const logged = Boolean(entry && entry.account);
  el.providerLoginBtn.textContent = logged ? "已登录" : "扫码登录";
  el.providerLoginBtn.classList.toggle("done", logged);
  el.providerLoginBtn.disabled = false;
}

if (el.providerLoginBtn) {
  el.providerLoginBtn.addEventListener("click", () => {
    const provider = state.onlineProvider;
    if (provider === "netease") openNeteaseQr();
    else if (provider === "qq") startQqLogin();
    else toast("酷狗登录接口还没接完（二维码接口要签名，正在攻）", true);
  });
}

if (el.qrClose) el.qrClose.addEventListener("click", closeNeteaseQr);
if (el.qrRefresh) el.qrRefresh.addEventListener("click", () => refreshNeteaseQr());
if (el.qrOverlay) {
  el.qrOverlay.addEventListener("click", (event) => {
    if (event.target === el.qrOverlay) closeNeteaseQr();
  });
}

async function startQqLogin({ force = false, silent = false } = {}) {
  if (!force && qqReady()) {
    if (!silent) {
      const account = qqProvider()?.account;
      toast(`QQ 音乐已连接${account ? `（${account}）` : ""}`);
    }
    return;
  }
  try {
    const res = await api.onlineLogin(force);
    if (res?.error) {
      toast(res.error, true);
      return;
    }
    if (!silent) toast("已打开登录窗口，扫码后会自动返回");
    loginStartedAt = Date.now();
    await loadOnlineStatus();
    startLoginPolling();
  } catch (error) {
    toast(`登录启动失败：${error.message}`, true);
  }
}

function startLoginPolling() {
  if (loginTimer) return;
  if (!loginStartedAt) loginStartedAt = Date.now();
  const tick = async () => {
    const data = await loadOnlineStatus();
    if (!data) return;
    const login = data.login || {};
    if (login.running) {
      if (Date.now() - loginStartedAt > 6 * 60 * 1000) {
        stopLoginPolling();
        toast("登录等待超时，可以再试一次", true);
      }
      return;
    }
    stopLoginPolling();
    if (qqReady()) {
      toast("QQ 音乐已连接");
      if (state.tab === "online") renderList();
      state.playlistCache.clear();
      state.remoteAt = 0;
      loadPlaylists().catch(() => {});
    } else if (login.error) {
      toast(`登录没有完成：${login.error}`, true);
    }
  };
  loginTimer = window.setInterval(tick, 2000);
  tick();
}

function stopLoginPolling() {
  if (!loginTimer) return;
  window.clearInterval(loginTimer);
  loginTimer = 0;
  loginStartedAt = 0;
}

async function reloginQq() {
  if (!window.confirm("重新登录会先清除当前 QQ 音乐登录态，然后打开扫码窗口。继续？")) return;
  await startQqLogin({ force: true });
}

async function logoutQq() {
  if (!window.confirm("退出后在线歌曲和 QQ 歌单会不可用，本地曲库不受影响。继续？")) return;
  try {
    const res = await api.onlineLogout();
    if (!res.ok) {
      toast(res.error || "退出失败", true);
      return;
    }
    toast("已退出 QQ 音乐");
    await loadOnlineStatus();
    state.playlistCache.clear();
    state.remoteAt = 0;
    await loadPlaylists().catch(() => {});
  } catch (error) {
    toast(`退出失败：${error.message}`, true);
  }
}

function openOnboard() {
  if (!el.onboard) return;
  el.onboard.classList.add("open");
  el.onboard.setAttribute("aria-hidden", "false");
  renderOnlineState();
  loadOnlineStatus();
  el.closeOnboard?.focus({ preventScroll: true });
}

function closeOnboard() {
  if (!el.onboard) return;
  el.onboard.classList.remove("open");
  el.onboard.setAttribute("aria-hidden", "true");
  localStorage.setItem(ONBOARD_KEY, "1");
}

async function maybeShowOnboard() {
  if (localStorage.getItem(ONBOARD_KEY) === "1") return;
  const needsSetup = state.tracks.length === 0 || !qqReady();
  if (!needsSetup) {
    localStorage.setItem(ONBOARD_KEY, "1");
    return;
  }
  window.setTimeout(openOnboard, 700);
}

async function addLibraryRoot() {
  const path = (el.obPath?.value || "").trim();
  if (!path) {
    toast("先填一个文件夹路径", true);
    el.obPath?.focus();
    return;
  }
  const button = el.obAddFolder;
  if (button) {
    button.disabled = true;
    button.textContent = "扫描中…";
  }
  try {
    const res = await api.addRoot(path);
    await loadLibrary(el.search.value.trim());
    await refreshStats();
    renderOnlineState();
    if (el.obPath) el.obPath.value = "";
    toast(`已添加并扫描：新增 ${res.scan.added} 首，共 ${res.scan.total} 首`);
  } catch (error) {
    toast(`添加失败：${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "添加并扫描";
    }
  }
}

async function pickLibraryRoot() {
  const button = el.obPickFolder;
  const label = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "等待选择…";
  }
  try {
    const res = await api.pickRoot();
    if (res?.ok && res.path) {
      if (el.obPath) el.obPath.value = res.path;
      await addLibraryRoot();
    }
  } catch (error) {
    toast(`选择目录失败：${error.message}`, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label || "选择目录";
    }
  }
}

function openAccount() {
  el.accountOverlay.classList.add("open");
  el.accountOverlay.setAttribute("aria-hidden", "false");
  renderAccountList();
  loadOnlineStatus();
  el.closeAccount.focus({ preventScroll: true });
}

function closeAccount() {
  el.accountOverlay.classList.remove("open");
  el.accountOverlay.setAttribute("aria-hidden", "true");
  el.accountBtn.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------- 首页 */
/* 软件打开的落地页：现在播放 / 快捷入口 / 今日数字 / 星海入口 / 最近。
 * 播放页、歌词页、星海都从这一页进，也都能回到这一页。 */

function homeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return { en: "GOOD NIGHT", zh: "夜深了" };
  if (hour < 11) return { en: "GOOD MORNING", zh: "早上好" };
  if (hour < 14) return { en: "GOOD NOON", zh: "中午好" };
  if (hour < 18) return { en: "GOOD AFTERNOON", zh: "下午好" };
  return { en: "GOOD EVENING", zh: "晚上好" };
}

/* 手机端底部导航：首页 / 曲库（抽屉）/ 歌词 / 星海 */
function closeLibrarySheet() {
  el.sidebar?.classList.remove("sheet-open");
  for (const button of el.mobileNav?.querySelectorAll("[data-mnav]") || []) {
    if (button.dataset.mnav === "library") button.classList.remove("on");
  }
}

function openLibrarySheet() {
  el.sidebar?.classList.add("sheet-open");
  for (const button of el.mobileNav?.querySelectorAll("[data-mnav]") || []) {
    button.classList.toggle("on", button.dataset.mnav === "library");
  }
}

function paintMobileNav(name) {
  for (const button of el.mobileNav?.querySelectorAll("[data-mnav]") || []) {
    button.classList.toggle("on", button.dataset.mnav === name);
  }
}

if (el.mobileNav) {
  el.mobileNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mnav]");
    if (!button) return;
    const action = button.dataset.mnav;
    if (action === "library") {
      if (el.sidebar?.classList.contains("sheet-open")) closeLibrarySheet();
      else openLibrarySheet();
      return;
    }
    closeLibrarySheet();
    paintMobileNav(action);
    if (action === "home") {
      if (el.starfieldOverlay?.classList.contains("open")) closeStarfieldPanel();
      showView("home");
    } else if (action === "lyrics") {
      openLyrics();
    } else if (action === "starfield") {
      openStarfieldPanel();
    }
  });
}

function showView(name) {
  state.mainView = name === "player" ? "player" : "home";
  document.body.classList.toggle("view-home", state.mainView === "home");
  if (el.homeView) el.homeView.hidden = state.mainView !== "home";
  if (state.mainView === "home") updateHome();
}

function homeCoverSet(track) {
  const box = el.homeCover;
  if (!box) return;
  box.innerHTML = "";
  if (track && track.cover_url) {
    const img = document.createElement("img");
    img.src = track.cover_url;
    img.alt = "";
    img.onerror = () => img.remove();
    box.append(img);
    return;
  }
  const span = document.createElement("span");
  span.className = "hn-fallback";
  span.textContent = track ? (track.title || "♪").trim().charAt(0) || "♪" : "♪";
  box.append(span);
}

function updateHome() {
  if (!el.homeView) return;
  const greet = homeGreeting();
  if (el.homeGreeting) el.homeGreeting.textContent = greet.en;
  if (el.homeHello) el.homeHello.textContent = `${greet.zh}，大肥鱼`;

  const localCount = state.tracks.length;
  const qqSeen = new Set();
  for (const track of [...player.queue, ...(state.recent || [])]) {
    if (track && track.provider === "qq") qqSeen.add(track.id);
  }
  if (el.homeLocalCount) el.homeLocalCount.textContent = String(localCount);
  if (el.homeQqCount) el.homeQqCount.textContent = String(qqSeen.size);
  if (el.homeTracks) el.homeTracks.textContent = String(localCount);
  if (el.homeQqTracks) el.homeQqTracks.textContent = String(qqSeen.size);

  const track = player.track;
  homeCoverSet(track);
  if (el.homeNowLabel) {
    el.homeNowLabel.textContent = track
      ? `正在播放 · ${track.provider === "qq" ? "QQ 音乐" : "本地"}`
      : "还没有在播的歌";
  }
  if (el.homeNowTitle) el.homeNowTitle.textContent = track ? track.title || "未命名" : "还没有在播的歌";
  if (el.homeNowArtist) {
    el.homeNowArtist.textContent = track
      ? `${track.artist || "未知歌手"} · ${track.album || "未命名专辑"}`
      : "在左边挑一首，或者进星海点一颗";
  }
  const duration = player.durationMs || track?.duration_ms || 0;
  const current = player.currentTimeMs || 0;
  if (el.homeNowFill) el.homeNowFill.style.width = `${duration ? Math.min((current / duration) * 100, 100) : 0}%`;
  if (el.homeNowTime) el.homeNowTime.textContent = fmtTime(current);
  if (el.homeNowDur) el.homeNowDur.textContent = fmtTime(duration);
  if (el.homePlayIcon) el.homePlayIcon.setAttribute("href", player.playing ? "#i-pause" : "#i-play");

  const stats = state.todayStats || {};
  if (el.homePlays) el.homePlays.textContent = String(stats.plays ?? 0);
  if (el.homeMinutes) el.homeMinutes.textContent = String(Math.round((stats.played_ms || 0) / 60000));

  if (el.homeRecentList) {
    const rows = (state.recent || []).slice(0, 6);
    el.homeRecentList.innerHTML = rows
      .map(
        (item) => `<button class="hr-row" data-id="${item.id}" data-provider="${item.provider || "local"}">
          <i></i><span>${esc(item.title || "未命名")} · ${esc(item.artist || "未知歌手")}</span>
          <span class="hr-when">${item.played_at ? fmtWhen(item.played_at) : ""}</span>
        </button>`,
      )
      .join("") || '<div class="butler-empty">还没有播放记录</div>';
  }
  drawHomeTeaser();
}

let homeTeaserDrawn = false;
function drawHomeTeaser() {
  const canvas = el.homeTeaserCanvas;
  if (!canvas || homeTeaserDrawn) return;
  const box = canvas.getBoundingClientRect();
  if (!box.width) return;
  homeTeaserDrawn = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = box.width;
  const h = box.height;
  for (let i = 0; i < 90; i += 1) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6);
    const x = w * 0.72 + Math.cos(t) * r * w * 0.32;
    const y = h * 0.5 + Math.sin(t) * r * h * 0.36;
    const warm = Math.random() > 0.35;
    ctx.fillStyle = warm ? "rgba(240,163,94,.75)" : "rgba(90,162,255,.7)";
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ------------------------------------------------------- starfield mode */
/* 星海现在是主界面里的一个原生视图：只画星图，播放、队列、顶栏、侧栏全部复用。
 * 旧的 iframe 承载（原型自带首页/曲库/周报/播放条/图标栏）已经下线。 */
const starfield = createStarfield({
  root: el.starfieldView,
  canvas: $("#sfpCanvas", el.starfieldView),
  player,
  onToast: (text) => toast(text),
});

/* 星图里放本地曲库 + 队列里已经出现过的在线曲目：不额外发请求，也不编造数据。 */
function starfieldTracks() {
  const seen = new Set();
  const list = [];
  for (const track of [...state.tracks, ...player.queue]) {
    if (!track || track.id == null) continue;
    const key = `${track.provider || "local"}:${track.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(track);
  }
  return list;
}

function openStarfieldPanel() {
  if (!el.starfieldView) return;
  if (state.lyricsOpen) closeLyrics();
  if (state.butlerOpen) closeButler();
  starfield.setTracks(starfieldTracks());
  document.body.classList.add("sfp-open");
  el.starfieldView.hidden = false;
  el.starfieldView.classList.add("open");
  el.starfieldView.setAttribute("aria-hidden", "false");
  starfield.open();
  setStarfieldButton(true);
  syncDragBar();
}

function closeStarfieldPanel() {
  if (!el.starfieldView) return;
  starfield.close();
  document.body.classList.remove("sfp-open");
  el.starfieldView.classList.remove("open");
  el.starfieldView.setAttribute("aria-hidden", "true");
  el.starfieldView.hidden = true;
  setStarfieldButton(false);
  syncDragBar();
  el.starfieldBtn.focus({ preventScroll: true });
}

function applySidebarHidden() {
  document.body.classList.toggle("side-hidden", state.sidebarHidden);
  if (el.sidebarShowBtn) el.sidebarShowBtn.hidden = !state.sidebarHidden;
  if (el.sidebarHideBtn) el.sidebarHideBtn.title = "隐藏侧栏";
}

function setSidebarHidden(hidden) {
  state.sidebarHidden = Boolean(hidden);
  localStorage.setItem("mh.sidebarHidden", state.sidebarHidden ? "1" : "0");
  applySidebarHidden();
}

/* ------------------------------------------------------------ butler drawer */
function openButler(panel = "home") {
  // 管家是主界面的抽屉：先退出星海，免得关掉抽屉后还停在星海
  if (el.starfieldOverlay?.classList.contains("open")) closeStarfieldPanel();
  el.butlerDrawer.classList.add("open");
  el.butlerDrawer.setAttribute("aria-hidden", "false");
  state.butlerOpen = true;
  showButlerPanel(panel);
}

function closeButler() {
  el.butlerDrawer.classList.remove("open");
  el.butlerDrawer.setAttribute("aria-hidden", "true");
  state.butlerOpen = false;
}

function showButlerPanel(name) {
  state.butlerPanel = name;
  const home = name === "home";
  el.butlerHome.hidden = !home;
  el.butlerPanel.hidden = home;
  el.bvSearch.hidden = name !== "search";
  el.bvTidy.hidden = name !== "tidy";
  el.bvReport.hidden = name !== "report";
  if (name === "search") window.setTimeout(() => el.butlerSearchInput.focus(), 40);
  if (name === "report") loadButlerReport().catch((error) => toast(`周报读取失败：${error.message}`, true));
}

function butlerRow(track, onPick) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "butler-row";
  const thumb = document.createElement("span");
  thumb.className = "thumb";
  thumb.style.setProperty("--c1", `hsl(${hueOf(track.id)} 52% 30%)`);
  thumb.style.setProperty("--c2", `hsl(${(hueOf(track.id) + 50) % 360} 55% 15%)`);
  if (track.cover_url) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = track.cover_url;
    img.addEventListener("error", () => img.remove());
    thumb.append(img);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "thumb-fallback";
    fallback.textContent = initialOf(track);
    thumb.append(fallback);
  }
  const text = document.createElement("span");
  const title = document.createElement("span");
  title.className = "t";
  title.textContent = track.title;
  const artist = document.createElement("span");
  artist.className = "a";
  artist.textContent = track.artist || "未知歌手";
  title.style.display = "block";
  artist.style.display = "block";
  text.append(title, artist);
  const dur = document.createElement("span");
  dur.className = "dur";
  dur.textContent = track.duration_ms ? fmtTime(track.duration_ms) : "";
  row.append(thumb, text, dur);
  row.addEventListener("click", () => onPick(track));
  return row;
}

async function butlerSearch() {
  const query = el.butlerSearchInput.value.trim();
  if (!query) return;
  el.butlerSearchResults.innerHTML = '<p class="butler-empty">搜索中…</p>';
  try {
    const data = await api.onlineSearch(query, 20);
    const items = data.items || [];
    el.butlerSearchResults.innerHTML = "";
    if (!items.length) {
      el.butlerSearchResults.innerHTML = '<p class="butler-empty">QQ 音乐没有找到这首歌</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((track, index) => {
      frag.append(
        butlerRow(track, () => {
          player.playNow(track);
          toast(`正在播放：${track.title}`);
          closeButler();
        })
      );
    });
    el.butlerSearchResults.append(frag);
  } catch (error) {
    el.butlerSearchResults.innerHTML = "";
    const fail = document.createElement("p");
    fail.className = "butler-empty";
    fail.textContent =
      error.status === 401 ? "QQ 音乐登录已失效，去「账号与连接」重登" : `搜索失败：${error.message}`;
    el.butlerSearchResults.append(fail);
    if (error.status === 401) loadOnlineStatus().catch(() => {});
  }
}

async function butlerTidy() {
  el.butlerTidyRun.disabled = true;
  el.butlerTidyRun.textContent = "检查中…";
  el.butlerTidyBody.innerHTML = '<p class="butler-empty">正在比对本地曲库…</p>';
  try {
    const data = await api.duplicates();
    el.butlerTidyBody.innerHTML = "";
    if (!data.group_count) {
      el.butlerTidyBody.innerHTML = `<p class="butler-empty">扫了 ${data.scanned} 首，没有发现重复曲目</p>`;
      return;
    }
    const head = document.createElement("p");
    head.className = "butler-hint";
    head.textContent = `${data.group_count} 组重复 · 涉及 ${data.track_count} 首（扫了 ${data.scanned} 首）`;
    el.butlerTidyBody.append(head);
    for (const group of data.groups) {
      const title = document.createElement("p");
      title.className = "butler-hint";
      title.textContent = `${group[0].title} · ${group.length} 份`;
      el.butlerTidyBody.append(title);
      for (const track of group) {
        el.butlerTidyBody.append(
          butlerRow(track, () => {
            player.playNow(track);
            toast(`正在播放：${track.title}`);
          })
        );
      }
    }
  } catch (error) {
    el.butlerTidyBody.innerHTML = `<p class="butler-empty">检查失败：${error.message}</p>`;
  } finally {
    el.butlerTidyRun.disabled = false;
    el.butlerTidyRun.textContent = "查重复";
  }
}

const PLAN_STATUS = {
  ok: "会移动",
  already_there: "已就位",
  conflict: "目标已有",
  duplicate_target: "目标撞车",
  missing: "源文件没了",
};

async function butlerPlan() {
  el.butlerPlanRun.disabled = true;
  el.butlerPlanRun.textContent = "生成中…";
  el.butlerTidyBody.innerHTML = '<p class="butler-empty">正在算目标路径（不改任何文件）…</p>';
  try {
    const data = await api.tidyPlan(2000);
    state.tidyPlan = data;
    el.butlerTidyBody.innerHTML = "";
    const s = data.summary || {};
    const head = document.createElement("p");
    head.className = "plan-summary";
    head.innerHTML =
      `扫描 <b>${s.total ?? 0}</b> 首 · 会移动 <b>${s.planned ?? 0}</b> 首 · ` +
      `目标撞车 <b>${s.conflict ?? 0}</b> 组 / 同名 <b>${s.duplicate_target ?? 0}</b> 首 · ` +
      `已就位 <b>${s.already_there ?? 0}</b> · 源文件缺失 <b>${s.missing ?? 0}</b><br>` +
      `归档到 <b>${data.root}</b>（${data.layout === "hybrid" ? "有标签按歌手/专辑，没标签按月份" : data.layout === "artist-album" ? "歌手 / 专辑" : data.layout === "artist" ? "只按歌手" : "全部平铺"}）· ` +
      `共 ${(s.bytes / 1048576).toFixed(1)} MB`;
    el.butlerTidyBody.append(head);
    if (data.truncated) {
      const more = document.createElement("p");
      more.className = "butler-hint";
      more.textContent = `列表只显示前 ${data.plan.length} 首，还有 ${data.truncated} 首没列出（CSV 只含已列出的）`;
      el.butlerTidyBody.append(more);
    }
    for (const item of data.plan) {
      const row = document.createElement("div");
      row.className = `plan-row ${item.status}`;
      const st = document.createElement("span");
      st.className = "st";
      st.textContent = PLAN_STATUS[item.status] || item.status;
      const body = document.createElement("span");
      const tt = document.createElement("span");
      tt.className = "tt";
      tt.textContent = `${item.title}${item.artist ? ` · ${item.artist}` : ""}`;
      const to = document.createElement("span");
      to.className = "to";
      to.textContent = item.status === "ok" ? `→ ${item.target}` : `${item.note || ""} ${item.target}`;
      body.append(tt, document.createElement("br"), to);
      row.append(st, body);
      el.butlerTidyBody.append(row);
    }
    if (el.planActions) el.planActions.hidden = false;
    const planned = Number(data.summary?.planned || 0);
    if (el.tidyExecBar) {
      el.tidyExecBar.hidden = !planned;
      if (planned && el.tidyExecHint) {
        el.tidyExecHint.textContent = `会把这 ${planned} 个文件搬到 ${data.root}；搬完可以用「撤销」原样放回。`;
      }
      if (el.tidyStartBtn) el.tidyStartBtn.textContent = planned ? `开始整理（${planned} 个）` : "开始整理";
    }
    loadTidyHistory().catch(() => {});
  } catch (error) {
    el.butlerTidyBody.innerHTML = `<p class="butler-empty">生成失败：${error.message}</p>`;
  } finally {
    el.butlerPlanRun.disabled = false;
    el.butlerPlanRun.textContent = "重新生成";
  }
}

/* --------------------------------------------------- tidy: really move files */
const TIDY_STATE_LABEL = {
  pending: "待执行",
  running: "进行中",
  done: "已整理",
  partial: "部分完成",
  failed: "失败",
  undone: "已撤销",
  undo_failed: "撤销失败",
};

async function startTidyRun() {
  const plan = state.tidyPlan;
  if (!plan) {
    toast("先生成一次计划", true);
    return;
  }
  const count = Number(plan.summary?.planned || 0);
  if (!count) {
    toast("没有需要移动的文件");
    return;
  }
  const ok = window.confirm(
    `会把这 ${count} 个文件移动到：\n${plan.root}\n\n原位置的文件会被移走（不是复制）。整理完可以在同一个面板里点「撤销」搬回去。确定继续？`
  );
  if (!ok) return;

  el.tidyStartBtn.disabled = true;
  el.tidyStartBtn.textContent = "整理中…";
  try {
    const created = await api.tidyRunCreate(plan.root, plan.layout);
    state.tidyRunId = created.run_id;
    await api.tidyRunStart(created.run_id);
    if (el.tidyProgress) el.tidyProgress.hidden = false;
    pollTidyRun(created.run_id);
  } catch (error) {
    el.tidyStartBtn.disabled = false;
    el.tidyStartBtn.textContent = "开始整理";
    toast(`整理没启动：${error.message}`, true);
  }
}

function pollTidyRun(runId) {
  window.clearTimeout(state.tidyTimer);
  const tick = async () => {
    try {
      const data = await api.tidyRun(runId);
      const run = data.run || {};
      const counts = data.counts || {};
      const total = Math.max(1, Number(run.total || 0));
      const handled = (counts.moved || 0) + (counts.failed || 0) + (counts.restored || 0);
      const pct = Math.min(100, Math.round((handled / total) * 100));
      if (el.tidyProgressFill) el.tidyProgressFill.style.width = `${pct}%`;
      if (el.tidyProgressText) {
        el.tidyProgressText.textContent = `${TIDY_STATE_LABEL[run.status] || run.status} · 已搬 ${
          counts.moved || 0
        } · 失败 ${counts.failed || 0} · 共 ${run.total || 0}（${pct}%）`;
      }
      if (["done", "partial", "failed", "undone", "undo_failed"].includes(run.status)) {
        el.tidyStartBtn.disabled = false;
        el.tidyStartBtn.textContent = "再整理一次";
        toast(
          run.status === "done"
            ? `整理完成：搬了 ${counts.moved || 0} 个文件`
            : `整理${TIDY_STATE_LABEL[run.status] || run.status}：成功 ${counts.moved || 0}，失败 ${counts.failed || 0}`,
          run.status !== "done"
        );
        loadTidyHistory().catch(() => {});
        refreshStats().catch(() => {});
        return;
      }
    } catch {
      /* keep polling through a hiccup */
    }
    state.tidyTimer = window.setTimeout(tick, 700);
  };
  state.tidyTimer = window.setTimeout(tick, 400);
}

async function undoRun(runId) {
  const ok = window.confirm("把这次整理搬过的文件全部放回原位？放回后列表里的路径也会跟着改回来。");
  if (!ok) return;
  try {
    const result = await api.tidyRunUndo(runId);
    toast(
      result.blocked
        ? `放回 ${result.restored} 个，${result.blocked} 个没能放回（原位置有同名文件）`
        : `已放回 ${result.restored} 个文件`,
      Boolean(result.blocked)
    );
    loadTidyHistory().catch(() => {});
  } catch (error) {
    toast(`撤销失败：${error.message}`, true);
  }
}

async function loadTidyHistory() {
  if (!el.tidyHistory) return;
  const data = await api.tidyRuns();
  const runs = (data.items || []).slice(0, 6);
  el.tidyHistory.innerHTML = "";
  el.tidyHistory.hidden = !runs.length;
  if (!runs.length) return;
  const head = document.createElement("p");
  head.className = "butler-hint";
  head.textContent = "最近的整理任务";
  el.tidyHistory.append(head);
  for (const run of runs) {
    const row = document.createElement("div");
    row.className = `th-row ${run.status}`;
    const stateEl = document.createElement("span");
    stateEl.className = "th-state";
    stateEl.textContent = TIDY_STATE_LABEL[run.status] || run.status;
    const info = document.createElement("span");
    info.innerHTML = `<b>${run.created_at?.slice(5, 16) || ""}</b> · 搬 ${run.moved || 0} / 失败 ${
      run.failed || 0
    } / 共 ${run.total || 0}`;
    row.append(stateEl, info);
    if (["pending", "running", "partial", "failed"].includes(run.status)) {
      const probe = document.createElement("button");
      probe.className = "mini";
      probe.textContent = "体检";
      probe.addEventListener("click", () => probeRun(run.id));
      row.append(probe);
    }
    if (["running", "partial", "failed"].includes(run.status) && (run.total || 0) > (run.moved || 0)) {
      const resume = document.createElement("button");
      resume.className = "mini";
      resume.textContent = "继续";
      resume.addEventListener("click", () => resumeRun(run.id));
      row.append(resume);
    }
    if (["done", "partial"].includes(run.status)) {
      const undo = document.createElement("button");
      undo.className = "mini";
      undo.textContent = "撤销";
      undo.addEventListener("click", () => undoRun(run.id));
      row.append(undo);
    }
    el.tidyHistory.append(row);
  }
}

/* 探针：开跑前体检，只读；续跑：接着搬没搬完的 */
async function probeRun(runId) {
  try {
    const data = await api.tidyRunProbe(runId);
    if (!data.ok) {
      toast(data.error || "体检失败", true);
      return;
    }
    const parts = [`体检 ${data.checked} 条：可搬 ${data.ready}`];
    if (data.errors) parts.push(`阻塞 ${data.errors}`);
    if (data.warnings) parts.push(`提醒 ${data.warnings}`);
    toast(parts.join(" · "));
    const first = (data.problems || []).find((p) => p.level === "error") || (data.problems || [])[0];
    if (first) {
      const lines = (data.problems || [])
        .slice(0, 5)
        .map((p) => `· ${p.title}：${p.message}`)
        .join("\n");
      await askConfirm({
        title: data.clean ? "体检通过" : "体检发现阻塞项",
        text: lines,
        okLabel: "知道了",
      });
    }
  } catch (error) {
    toast(`体检失败：${error.message}`, true);
  }
}

async function resumeRun(runId) {
  const ok = await askConfirm({
    title: "继续这次整理？",
    text: `会把上次没搬完的条目接着搬（已搬的不会重复动）。\n任务 #${runId}`,
    okLabel: "继续",
  });
  if (!ok) return;
  try {
    const data = await api.tidyRunResume(runId);
    if (!data.ok) {
      toast(data.error || "没有可继续的条目", true);
      return;
    }
    toast(`续跑完成：搬了 ${data.moved}，失败 ${data.failed}`);
    await loadTidyHistory().catch(() => {});
  } catch (error) {
    toast(`续跑失败：${error.message}`, true);
  }
}

async function exportPlanCsv() {
  const data = state.tidyPlan;
  if (!data) {
    toast("先生成一次计划", true);
    return;
  }
  const rows = [];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  rows.push(["状态", "动作", "歌名", "歌手", "专辑", "字节", "源文件", "目标"].map(quote).join(","));
  const all = [...data.plan];
  for (const item of all) {
    rows.push(
      [PLAN_STATUS[item.status] || item.status, item.action, item.title, item.artist, item.album, item.size, item.source, item.target]
        .map(quote)
        .join(",")
    );
  }
  const blob = new Blob([`\ufeff${rows.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await saveBlob(blob, `整理计划-${stamp}.csv`, "CSV 表格");
  if (result === "cancelled") return;
  toast(result === "saved" ? "计划已保存" : "计划已下载");
}

async function loadButlerReport() {
  el.reportNumbers.innerHTML = '<p class="butler-empty">读取中…</p>';
  const data = await api.weekStats(7);
  state.weekReport = data;
  const totals = data.totals || {};
  el.reportNumbers.innerHTML = "";
  const cards = [
    [String(totals.plays ?? 0), "本周播放次数"],
    [String(Math.round(Number(totals.minutes ?? 0))), "本周分钟"],
    [String(totals.days ?? 0), "有听歌的天数"],
    [String(totals.tracks ?? 0), "不重复曲目"],
  ];
  for (const [value, label] of cards) {
    const box = document.createElement("div");
    box.className = "report-number";
    const b = document.createElement("b");
    b.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    box.append(b, span);
    el.reportNumbers.append(box);
  }

  const series = data.series || [];
  const peak = Math.max(1, ...series.map((item) => item.plays));
  el.reportBars.innerHTML = "";
  for (const item of series) {
    const bar = document.createElement("div");
    bar.className = "report-bar";
    const fill = document.createElement("i");
    fill.style.height = `${Math.round((item.plays / peak) * 100)}%`;
    fill.title = `${item.day} · ${item.plays} 次 · ${Math.round(item.minutes)} 分钟`;
    const label = document.createElement("em");
    label.textContent = item.day.slice(5);
    bar.append(fill, label);
    el.reportBars.append(bar);
  }

  el.reportTop.innerHTML = "";
  const songHead = document.createElement("h4");
  songHead.textContent = "听最多的 5 首";
  el.reportTop.append(songHead);
  if (!(data.top_tracks || []).length) {
    const empty = document.createElement("p");
    empty.className = "butler-empty";
    empty.textContent = "这周还没听够 3 秒的歌";
    el.reportTop.append(empty);
  }
  for (const track of data.top_tracks || []) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("b");
    name.textContent = `${track.title}`;
    const count = document.createElement("span");
    count.textContent = `${track.plays} 次`;
    row.append(name, count);
    el.reportTop.append(row);
  }
  const artistHead = document.createElement("h4");
  artistHead.textContent = "听最多的歌手";
  el.reportTop.append(artistHead);
  for (const artist of data.top_artists || []) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("b");
    name.textContent = artist.artist;
    const count = document.createElement("span");
    count.textContent = `${artist.plays} 次`;
    row.append(name, count);
    el.reportTop.append(row);
  }
}

/* ------------------------------------------------------ report export */
function reportFileName(data, ext) {
  const first = data?.series?.[0]?.day || "week";
  const last = data?.series?.[data.series.length - 1]?.day || "";
  return `大肥鱼周报-${first}${last ? `_${last}` : ""}.${ext}`;
}

/** Keep the native picker when the runtime has it; fall back to a normal download. */
async function saveBlob(blob, filename, description) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [blob.type || "application/octet-stream"]: [`.${filename.split(".").pop()}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      // fall through: some Electron builds reject the picker
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  return "downloaded";
}

function drawReportCanvas(data) {
  const W = 1000;
  const H = 760;
  const S = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.scale(S, S);
  const font = (size, weight = 400) => `${weight} ${size}px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#131e30");
  bg.addColorStop(1, "#070b12");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#5aa2ff";
  g.font = font(12, 600);
  g.fillText("WEEKLY REPORT", 56, 64);

  g.fillStyle = "#f2f7ff";
  g.font = font(32, 700);
  g.fillText("大肥鱼 · 周报", 56, 106);

  const first = data?.series?.[0]?.day || "";
  const last = data?.series?.[data.series.length - 1]?.day || "";
  g.fillStyle = "#7f8ea6";
  g.font = font(13);
  g.fillText(`${first} — ${last}`, 56, 132);

  const totals = data?.totals || {};
  const cards = [
    [String(totals.plays ?? 0), "播放次数"],
    [String(Math.round(totals.minutes ?? 0)), "分钟"],
    [String(totals.days ?? 0), "有听歌的天"],
    [String(totals.tracks ?? 0), "不重复曲目"],
  ];
  cards.forEach(([value, label], index) => {
    const x = 56 + index * 224;
    g.fillStyle = "rgba(255,255,255,0.04)";
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.beginPath();
    g.roundRect(x, 158, 208, 92, 14);
    g.fill();
    g.stroke();
    g.fillStyle = "#f2f7ff";
    g.font = font(30, 700);
    g.fillText(value, x + 18, 202);
    g.fillStyle = "#7f8ea6";
    g.font = font(12);
    g.fillText(label, x + 18, 228);
  });

  const series = data?.series || [];
  const peak = Math.max(1, ...series.map((item) => item.plays));
  const chartTop = 300;
  const chartBottom = 470;
  const barWidth = 52;
  const gap = (1000 - 112 - series.length * barWidth) / Math.max(1, series.length - 1);
  series.forEach((item, index) => {
    const raw = Math.round((item.plays / peak) * (chartBottom - chartTop));
    const height = Math.max(item.plays ? 8 : 2, raw);
    const x = 56 + index * (barWidth + gap);
    if (item.plays) {
      const bar = g.createLinearGradient(0, chartBottom - height, 0, chartBottom);
      bar.addColorStop(0, "#8ecbff");
      bar.addColorStop(1, "rgba(90,162,255,0.18)");
      g.fillStyle = bar;
    } else {
      g.fillStyle = "rgba(255,255,255,0.10)";
    }
    g.beginPath();
    g.roundRect(x, chartBottom - height, barWidth, height, 8);
    g.fill();
    g.fillStyle = "#7f8ea6";
    g.font = font(11);
    g.fillText(item.day.slice(5), x + 8, chartBottom + 20);
    g.fillStyle = "#cfd9e8";
    g.font = font(11, 600);
    if (item.plays) g.fillText(String(item.plays), x + 8, chartBottom - height - 8);
  });

  const column = (items, title, x, width, format) => {
    g.fillStyle = "#7f8ea6";
    g.font = font(12, 600);
    g.fillText(title, x, 530);
    items.forEach((item, index) => {
      const y = 560 + index * 26;
      g.fillStyle = "#e8effa";
      g.font = font(13);
      const text = format(item);
      const clipped = text.length > 22 ? `${text.slice(0, 21)}…` : text;
      g.fillText(clipped, x, y);
      g.fillStyle = "#5aa2ff";
      g.font = font(12, 600);
      g.textAlign = "right";
      g.fillText(`${item.plays} 次`, x + width, y);
      g.textAlign = "left";
    });
  };
  column((data?.top_tracks || []).slice(0, 5), "听最多的 5 首", 56, 420, (item) => item.title);
  column((data?.top_artists || []).slice(0, 5), "听最多的歌手", 536, 408, (item) => item.artist);

  g.fillStyle = "#4a5a70";
  g.font = font(11);
  g.fillText(`导出时间 ${new Date().toLocaleString("zh-CN")} · 大肥鱼音乐管家`, 56, 724);
  return canvas;
}

async function exportReportPng() {
  const data = state.weekReport || (await api.weekStats(7));
  const canvas = drawReportCanvas(data);
  if (!canvas) {
    toast("这台机器画不出图片", true);
    return;
  }
  const blob = await new Promise((resolve) => canvas.toBlob((value) => resolve(value), "image/png"));
  if (!blob) {
    toast("导出失败：拿不到图片数据", true);
    return;
  }
  const result = await saveBlob(blob, reportFileName(data, "png"), "PNG 图片");
  if (result === "cancelled") return;
  toast(result === "saved" ? "周报图片已保存" : "周报图片已下载");
}

function reportCsv(data) {
  const rows = [];
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const line = (...cells) => rows.push(cells.map(quote).join(","));
  const totals = data?.totals || {};
  line("大肥鱼周报", `${data?.series?.[0]?.day || ""} ~ ${data?.series?.[data.series.length - 1]?.day || ""}`);
  line("");
  line("汇总", "数值");
  line("播放次数", totals.plays ?? 0);
  line("分钟", Math.round(totals.minutes ?? 0));
  line("有听歌的天数", totals.days ?? 0);
  line("不重复曲目", totals.tracks ?? 0);
  line("");
  line("日期", "播放次数", "分钟", "不重复曲目");
  for (const item of data?.series || []) {
    line(item.day, item.plays, item.minutes, item.tracks);
  }
  line("");
  line("听最多的 5 首", "次数", "分钟");
  for (const item of data?.top_tracks || []) {
    line(item.title, item.plays, Math.round((item.played_ms || 0) / 60000));
  }
  line("");
  line("听最多的歌手", "次数");
  for (const item of data?.top_artists || []) {
    line(item.artist, item.plays);
  }
  // \ufeff so Excel opens UTF-8 CSV without asking
  return `\ufeff${rows.join("\r\n")}\r\n`;
}

async function exportReportCsv() {
  const data = state.weekReport || (await api.weekStats(7));
  const blob = new Blob([reportCsv(data)], { type: "text/csv;charset=utf-8" });
  const result = await saveBlob(blob, reportFileName(data, "csv"), "CSV 表格");
  if (result === "cancelled") return;
  toast(result === "saved" ? "周报 CSV 已保存" : "周报 CSV 已下载");
}

/* ---------------------------------------------------------------- settings */
function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function renderGlassSetting() {
  if (!el.settingsGlass) return;
  const on = document.documentElement.dataset.glass === "on";
  el.settingsGlass.textContent = on ? "已开启" : "已关闭";
  el.settingsGlass.setAttribute("aria-pressed", String(on));
}

function renderPierceUI() {
  if (!el.pierceSection) return;
  el.pierceSection.hidden = !desktopShell;
  const mode = desktopShell ? state.pierceMode : "off";
  for (const button of el.pierceModes.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.pierce === mode);
  }
  if (el.pierceAlpha) el.pierceAlpha.value = String(state.pierceAlpha);
  if (el.pierceAlphaLabel) el.pierceAlphaLabel.textContent = `${state.pierceAlpha}%`;
  if (el.pierceHint) el.pierceHint.textContent = desktopShell ? "随窗口即时生效" : "仅桌面版可用";
  if (el.pierceToggleBtn) {
    const on = mode === "clear" || mode === "acrylic";
    el.pierceToggleBtn.classList.toggle("active", on);
    el.pierceToggleBtn.title = on ? "关闭透明" : "一键透明";
  }
  if (el.pierceNote) el.pierceNote.hidden = !(desktopShell && state.pierceMode === "acrylic");
}

function applyPierce() {
  const mode = desktopShell ? state.pierceMode : "off";
  const on = mode === "clear" || mode === "acrylic";
  document.documentElement.dataset.pierce = on ? "on" : "off";
  document.documentElement.style.setProperty("--pierce-alpha", (state.pierceAlpha / 100).toFixed(2));
  if (desktopShell && window.mhDesktop?.setMaterial) {
    window.mhDesktop.setMaterial(mode === "acrylic" ? "acrylic" : "none");
  }
  renderPierceUI();
}

function updateWinControls() {
  if (!desktopShell || !el.winControls) return;
  const button = el.winControls.querySelector('[data-win="maximize"]');
  window.mhDesktop
    ?.isMaximized?.()
    .then((maximized) => {
      if (!button) return;
      button.textContent = maximized ? "❐" : "□";
      button.title = maximized ? "还原" : "最大化";
    })
    .catch(() => {});
}

async function openSettings() {
  el.settingsOverlay.classList.add("open");
  el.settingsOverlay.setAttribute("aria-hidden", "false");
  el.settingsRoots.innerHTML = '<div class="backup-empty">正在读取…</div>';
  el.backupList.innerHTML = '<div class="backup-empty">正在读取…</div>';
  renderGlassSetting();
  renderPierceUI();
  renderPlaybackSettings();
  renderShortcuts();
  renderSettingsRoadmap();
  el.closeSettings.focus({ preventScroll: true });
  await loadSettingsData();
}

function closeSettings() {
  el.settingsOverlay.classList.remove("open");
  el.settingsOverlay.setAttribute("aria-hidden", "true");
  el.settingsBtn.focus({ preventScroll: true });
}

async function loadSettingsData() {
  const [rootsResult, backupsResult, healthResult] = await Promise.allSettled([
    api.libraryRoots(),
    api.backups(),
    api.health(),
  ]);

  if (rootsResult.status === "fulfilled") {
    const data = rootsResult.value || {};
    const roots = data.active || data.roots || [];
    el.settingsRootCount.textContent = `${roots.length} 个`;
    el.settingsRoots.innerHTML = "";
    if (!roots.length) {
      el.settingsRoots.innerHTML = '<div class="backup-empty">还没有曲库目录，添加一个文件夹。</div>';
    } else {
      for (const root of roots) {
        const row = document.createElement("div");
        row.className = "settings-root";
        row.textContent = root;
        el.settingsRoots.append(row);
      }
    }
  } else {
    el.settingsRoots.innerHTML = '<div class="backup-empty">读取曲库目录失败</div>';
  }

  if (backupsResult.status === "fulfilled") {
    const data = backupsResult.value || {};
    el.settingsBackupDir.textContent = data.dir || "data/backups";
    el.settingsBackupDir.title = data.dir || "";
    renderBackupList(data.items || []);
  } else {
    el.settingsBackupDir.textContent = "读取失败";
    el.backupList.innerHTML = '<div class="backup-empty">读取备份失败</div>';
  }

  if (healthResult.status === "fulfilled") {
    const health = healthResult.value || {};
    el.settingsAbout.textContent = `版本 ${health.version || "—"} · 本地 ${health.tracks ?? "—"} 首\n数据目录 music-hub/data · 备份目录 ${el.settingsBackupDir.textContent}`;
  }
  renderGlassSetting();
}

function renderBackupList(items) {
  el.backupList.innerHTML = "";
  if (!items.length) {
    el.backupList.innerHTML = '<div class="backup-empty">还没有备份，点「立即备份」生成一份。</div>';
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "backup-row";
    const name = document.createElement("span");
    name.className = "bn";
    name.textContent = item.name;
    name.title = item.name;
    const size = document.createElement("span");
    size.className = "bs";
    size.textContent = `${formatBytes(item.size)} · ${item.mtime || ""}`;
    const restore = document.createElement("button");
    restore.className = "ghost";
    restore.textContent = "恢复";
    restore.addEventListener("click", () => restoreBackup(item.name));
    const remove = document.createElement("button");
    remove.className = "ghost danger";
    remove.textContent = "删除";
    remove.addEventListener("click", () => confirmDeleteBackup(item));
    row.append(name, size, restore, remove);
    el.backupList.append(row);
  }
}

async function confirmDeleteBackup(item) {
  const ok = await askConfirm({
    title: "删除这份备份？",
    text: `${item.name}\n${formatBytes(item.size)} · ${item.mtime || ""}\n删除后不能从应用里恢复，只能去备份目录手动找。`,
    okLabel: "删除",
  });
  if (!ok) return;
  try {
    await deleteBackup(item.name);
    toast("备份已删除");
  } catch (error) {
    toast(`删除失败：${error.message}`, true);
  }
}

const SHORTCUTS = [
  ["空格", "播放 / 暂停"],
  ["← / →", "快退 / 快进 5 秒"],
  ["↑ / ↓", "音量 +5 / -5"],
  ["M", "静音开关"],
  ["F", "全屏开关"],
  ["L", "打开 / 收起歌词页"],
  ["Q", "打开 / 收起播放队列"],
  ["Esc", "关闭当前浮层 / 退出全屏"],
  ["/", "把焦点放到搜索框"],
];

function renderSettingsRoadmap() {
  const data = state.roadmap;
  if (!data) {
    if (el.settingsRoadmapPct) el.settingsRoadmapPct.textContent = "读取中…";
    return;
  }
  if (el.settingsRoadmapPct) el.settingsRoadmapPct.textContent = `总进度 ${data.overall}%`;
  if (el.settingsRoadmapNext) el.settingsRoadmapNext.textContent = data.next ? `下一步：${data.next}` : "";
}

function renderShortcuts() {
  if (!el.shortcutList) return;
  el.shortcutList.innerHTML = "";
  for (const [keys, desc] of SHORTCUTS) {
    const row = document.createElement("div");
    row.className = "shortcut-row";
    const label = document.createElement("span");
    label.textContent = desc;
    const kbd = document.createElement("kbd");
    kbd.textContent = keys;
    row.append(label, kbd);
    el.shortcutList.append(row);
  }
}

function paintRangeFill(input, value) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const pct = ((Number(value) - min) / (max - min)) * 100;
  input.style.setProperty("--fill", `${pct}%`);
}

function renderPlaybackSettings() {
  const volume = Number(localStorage.getItem("mh.volume") ?? 80);
  const scale = Number(localStorage.getItem("mh.lyricScale") ?? 100);
  if (el.settingsVolume) {
    el.settingsVolume.value = String(volume);
    paintRangeFill(el.settingsVolume, volume);
  }
  if (el.settingsVolumeLabel) el.settingsVolumeLabel.textContent = `${volume}%`;
  if (el.settingsLyric) {
    el.settingsLyric.value = String(scale);
    paintRangeFill(el.settingsLyric, scale);
  }
  if (el.settingsLyricLabel) el.settingsLyricLabel.textContent = `${scale}%`;
}

function applyLyricScale(scale) {
  document.documentElement.style.setProperty("--lo-scale", String(scale / 100));
}

async function addSettingsRoot() {
  const path = (el.settingsPath.value || "").trim();
  if (!path) {
    el.settingsPath.focus();
    toast("先填一个文件夹路径", true);
    return;
  }
  const button = el.settingsAdd;
  button.disabled = true;
  button.textContent = "扫描中…";
  try {
    const result = await api.addRoot(path);
    el.settingsPath.value = "";
    await loadLibrary(el.search.value.trim());
    await refreshStats();
    await loadSettingsData();
    toast(`已添加并扫描：新增 ${result.scan.added} 首，共 ${result.scan.total} 首`);
  } catch (error) {
    toast(`添加失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "添加并扫描";
  }
}

async function pickSettingsRoot() {
  const button = el.settingsPick;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "等待选择…";
  try {
    const result = await api.pickRoot();
    if (result?.ok && result.path) {
      el.settingsPath.value = result.path;
      await addSettingsRoot();
    }
  } catch (error) {
    toast(`选择目录失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function backupNow() {
  const button = el.backupNow;
  button.disabled = true;
  button.textContent = "备份中…";
  try {
    const result = await api.backupNow();
    toast(`已备份 · ${result.backup.name}`);
    await loadSettingsData();
  } catch (error) {
    toast(`备份失败：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "立即备份";
  }
}

async function openBackupsFolder() {
  try {
    await api.openBackups();
    toast("已打开备份目录");
  } catch (error) {
    toast(`打开失败：${error.message}`, true);
  }
}

async function restoreBackup(name) {
  if (!window.confirm(`恢复「${name}」会覆盖当前数据库。\n系统会先自动备份当前数据。继续？`)) return;
  try {
    toast("正在恢复…");
    const result = await api.restoreBackup(name);
    toast(`已恢复，安全备份：${result.safety}`);
    window.setTimeout(() => window.location.reload(), 1200);
  } catch (error) {
    toast(`恢复失败：${error.message}`, true);
  }
}

async function deleteBackup(name) {
  // 二次确认在 confirmDeleteBackup 里用应用内弹窗做（window.confirm 在 Electron 里不可靠）
  try {
    await api.deleteBackup(name);
    await loadSettingsData();
  } catch (error) {
    toast(`删除失败：${error.message}`, true);
  }
}

/* ---------------------------------------------------------------- handlers */
player.addEventListener("track", (event) => {
  const { track, prepared, positionMs = 0 } = event.detail;
  state.activeId = track.id;
  state.peekKey = null;
  updateHero(track);
  applyArt(track);
  markActive();
  renderQueue();
  loadLyricOffset(track);
  loadLyrics(track);
  if (prepared) {
    journal.reset();
    if (positionMs > 1000) {
      setBadge(`上次 ${fmtTime(positionMs)}`);
      el.curTime.textContent = fmtTime(positionMs);
      const total = track.duration_ms || 0;
      paintBar(total > 0 ? clamp(positionMs / total, 0, 1) : 0, positionMs);
    } else {
      setBadge("未开始");
      el.curTime.textContent = "0:00";
      paintBar(0, 0);
    }
  } else {
    saveResume(track.id, 0);
    journal.begin(track, 0);
  }
});

player.addEventListener("state", (event) => {
  const playing = event.detail.playing;
  setPlayIcon(playing);
  if (playing) {
    viz.ensure();
    if (player.track && journal.trackId !== player.track.id) {
      journal.begin(player.track, player.currentTimeMs);
    }
  } else {
    journal.flush();
    saveResume();
  }
});

player.addEventListener("time", (event) => {
  if (!barDragging) updateTime(event.detail);
});

player.addEventListener("duration", (event) => {
  state.duration = event.detail;
  el.durTime.textContent = fmtTime(event.detail);
  const track = player.track;
  if (track && event.detail >= 1000 && (!track.duration_ms || track.duration_ms < 1000)) {
    track.duration_ms = event.detail;
    api.setDuration(track.id, Math.round(event.detail)).catch(() => {});
    const dur = el.trackList.querySelector(`.track[data-id="${track.id}"] .dur`);
    if (dur) dur.textContent = fmtTime(event.detail);
  }
});

player.addEventListener("ended", () => {
  journal.finish(true);
  clearResume();
});

player.addEventListener("queue", () => {
  renderQueue();
});

player.addEventListener("error", (event) => {
  toast(event.detail?.message || "播放出错了", true);
});

el.playBtn.addEventListener("click", () => player.toggle());
el.prevBtn.addEventListener("click", () => player.prev());
el.nextBtn.addEventListener("click", () => player.next());
el.playModeBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  togglePlayModeMenu();
});
for (const item of el.playModeMenu.querySelectorAll("[data-mode]")) {
  item.addEventListener("click", () => {
    setPlayMode(item.dataset.mode);
    closePlayModeMenu();
  });
}
document.addEventListener("click", (event) => {
  if (!state.playModeOpen) return;
  if (el.playModeWrap?.contains(event.target)) return;
  closePlayModeMenu();
});
if (el.likeBtn) {
  el.likeBtn.addEventListener("click", () => {
    if (!player.track) {
      toast("先放一首再收藏");
      return;
    }
    toggleLike(player.track.id);
  });
}

el.muteBtn.addEventListener("click", () => {
  player.toggleMute();
  updateVolumeUI(player.audio.muted ? 0 : Number(el.volume.value));
});
el.volume.addEventListener("input", () => {
  const value = Number(el.volume.value);
  player.setVolume(value / 100);
  updateVolumeUI(value);
  localStorage.setItem("mh.volume", String(value));
});

/* seek bar */
function barPctFrom(clientX) {
  const rect = el.seekBar.getBoundingClientRect();
  return clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
}

el.seekBar.addEventListener("pointerdown", (event) => {
  if (!player.track) return;
  barDragging = true;
  el.seekBar.classList.add("dragging");
  el.seekBar.setPointerCapture(event.pointerId);
  barPct = barPctFrom(event.clientX);
  paintBar(barPct, barPct * player.durationMs);
});
el.seekBar.addEventListener("pointermove", (event) => {
  if (!barDragging) return;
  barPct = barPctFrom(event.clientX);
  paintBar(barPct, barPct * player.durationMs);
});
function endBarDrag(event) {
  if (!barDragging) return;
  barDragging = false;
  el.seekBar.classList.remove("dragging");
  player.seek(barPct * player.durationMs);
  journal.flush();
}
el.seekBar.addEventListener("pointerup", endBarDrag);
el.seekBar.addEventListener("pointercancel", endBarDrag);

/* track list */
el.trackList.addEventListener("click", (event) => {
  const row = event.target.closest(".track");
  if (!row) return;
  const id = Number(row.dataset.id);
  if (state.selectMode && isEditablePlaylist()) {
    toggleSelected(id);
    return;
  }
  const index = state.currentList.findIndex((t) => t.id === id);
  if (index < 0) return;
  if (player.track && player.track.id === id) {
    player.toggle();
    return;
  }
  const transient = state.tab === "search" || state.tab === "online";
  if (transient) {
    // 搜索结果只是临时列表：播这一首，原队列留着
    player.playNow(state.currentList[index]);
    showView("player");
    return;
  }
  player.setQueue(state.currentList, index, true);
  showView("player");
});

let moreScheduled = false;
el.trackList.addEventListener("scroll", () => {
  if (!state.renderLimit || state.renderLimit >= state.currentList.length) return;
  if (!el.trackList.querySelector("#listMore")) return;
  if (el.trackList.scrollTop + el.trackList.clientHeight < el.trackList.scrollHeight - 260) return;
  if (moreScheduled) return;
  moreScheduled = true;
  requestAnimationFrame(() => {
    moreScheduled = false;
    appendTrackBatch();
  });
}, { passive: true });

/* queue */
el.queueList.addEventListener("click", (event) => {
  const insert = event.target.closest(".queue-insert");
  if (insert) {
    const item = insert.closest(".queue-item");
    const track = player.queue[Number(item?.dataset.index)];
    if (track) {
      player.insertNext(track);
      toast(`已把「${track.title}」设为下一首`);
    }
    return;
  }
  const item = event.target.closest(".queue-item");
  if (!item) return;
  const index = Number(item.dataset.index);
  if (player.track && player.queue[index]?.id === player.track.id) {
    player.toggle();
    return;
  }
  player.playIndex(index);
});

let queueDragFrom = null;
el.queueList.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".queue-item");
  if (!item) return;
  queueDragFrom = Number(item.dataset.index);
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  try {
    event.dataTransfer.setData("text/plain", String(queueDragFrom));
  } catch {
    /* ignore */
  }
});
el.queueList.addEventListener("dragover", (event) => {
  const item = event.target.closest(".queue-item");
  if (!item || queueDragFrom === null) return;
  event.preventDefault();
  item.classList.add("drag-over");
  event.dataTransfer.dropEffect = "move";
});
el.queueList.addEventListener("dragleave", (event) => {
  const item = event.target.closest(".queue-item");
  if (item) item.classList.remove("drag-over");
});
el.queueList.addEventListener("drop", (event) => {
  const item = event.target.closest(".queue-item");
  if (!item || queueDragFrom === null) return;
  event.preventDefault();
  player.moveInQueue(queueDragFrom, Number(item.dataset.index));
  queueDragFrom = null;
});
el.queueList.addEventListener("dragend", () => {
  queueDragFrom = null;
  el.queueList.querySelectorAll(".dragging, .drag-over").forEach((node) => {
    node.classList.remove("dragging", "drag-over");
  });
});
el.queueBtn.addEventListener("click", () => (state.queueOpen ? closeQueue() : openQueue()));
el.closeQueue.addEventListener("click", closeQueue);
el.glassBtn.addEventListener("click", toggleGlass);

/* roadmap */
el.roadmapBtn.addEventListener("click", () => (state.roadmapOpen ? closeRoadmap() : openRoadmap()));
el.closeRoadmap.addEventListener("click", closeRoadmap);
el.roadmapOverlay.addEventListener("click", (event) => {
  if (event.target === el.roadmapOverlay) closeRoadmap();
});

/* accounts / onboarding */
el.accountBtn.addEventListener("click", openAccount);
el.closeAccount.addEventListener("click", closeAccount);
el.accountOverlay.addEventListener("click", (event) => {
  if (event.target === el.accountOverlay) closeAccount();
});
el.replayOnboard.addEventListener("click", () => {
  closeAccount();
  openOnboard();
});

/* settings */
el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.closeSettings2.addEventListener("click", closeSettings);
el.settingsOverlay.addEventListener("click", (event) => {
  if (event.target === el.settingsOverlay) closeSettings();
});
/* 首页的按钮 */
if (el.homePlay) el.homePlay.addEventListener("click", () => player.toggle());
if (el.homePrev) el.homePrev.addEventListener("click", () => player.prev());
if (el.homeNext) el.homeNext.addEventListener("click", () => player.next());
if (el.homeOpenPlayer) el.homeOpenPlayer.addEventListener("click", () => showView("player"));
if (el.homeEnterStarfield) el.homeEnterStarfield.addEventListener("click", () => openStarfieldPanel());
for (const tile of $$("[data-home]")) {
  tile.addEventListener("click", () => {
    const kind = tile.dataset.home;
    if (kind === "starfield") openStarfieldPanel();
    else if (kind === "search") {
      showView("player");
      openButler("search");
    } else if (kind === "library") {
      showView("player");
      setTab("recent");
    } else if (kind === "report") {
      showView("player");
      openButler("report");
    }
  });
}
if (el.homeRecentList) {
  el.homeRecentList.addEventListener("click", (event) => {
    const row = event.target.closest(".hr-row");
    if (!row) return;
    const id = Number(row.dataset.id);
    const index = player.queue.findIndex((track) => track.id === id);
    if (index >= 0) player.playIndex(index);
    else {
      const track = (state.recent || []).find((item) => item.id === id);
      if (track) player.playNow(track);
    }
    showView("player");
  });
}
player.addEventListener("track", () => updateHome());
player.addEventListener("state", () => updateHome());
player.addEventListener("time", () => {
  if (state.mainView === "home") updateHome();
});

if (el.starfieldBtn) {
  el.starfieldBtn.addEventListener("click", () => {
    if (el.starfieldView.classList.contains("open")) closeStarfieldPanel();
    else openStarfieldPanel();
  });
}

/* butler drawer */
if (el.butlerBtn) {
  el.butlerBtn.addEventListener("click", () => {
    if (state.butlerOpen) closeButler();
    else openButler("home");
  });
}
if (el.closeButler) el.closeButler.addEventListener("click", closeButler);
if (el.butlerBack) el.butlerBack.addEventListener("click", () => showButlerPanel("home"));
if (el.butlerHome) {
  for (const tile of el.butlerHome.querySelectorAll(".butler-tile")) {
    tile.addEventListener("click", () => showButlerPanel(tile.dataset.panel));
  }
}
if (el.butlerSearchInput) {
  el.butlerSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      butlerSearch().catch((error) => toast(error.message, true));
    }
  });
}
if (el.butlerTidyRun) {
  el.butlerTidyRun.addEventListener("click", () => butlerTidy().catch((error) => toast(error.message, true)));
}
if (el.butlerPlanRun) {
  el.butlerPlanRun.addEventListener("click", () => butlerPlan().catch((error) => toast(error.message, true)));
}
if (el.tidyStartBtn) {
  el.tidyStartBtn.addEventListener("click", () => startTidyRun().catch((error) => toast(error.message, true)));
}
if (el.planCsvBtn) {
  el.planCsvBtn.addEventListener("click", () => exportPlanCsv().catch((error) => toast(`导出失败：${error.message}`, true)));
}
if (el.reportPngBtn) {
  el.reportPngBtn.addEventListener("click", () => exportReportPng().catch((error) => toast(`导出失败：${error.message}`, true)));
}
if (el.reportCsvBtn) {
  el.reportCsvBtn.addEventListener("click", () => exportReportCsv().catch((error) => toast(`导出失败：${error.message}`, true)));
}
el.settingsAdd.addEventListener("click", addSettingsRoot);
el.settingsPick.addEventListener("click", pickSettingsRoot);
if (el.settingsScan) el.settingsScan.addEventListener("click", scanLibraryNow);
el.settingsPath.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addSettingsRoot();
});
el.backupNow.addEventListener("click", backupNow);
el.openBackups.addEventListener("click", openBackupsFolder);
el.settingsGlass.addEventListener("click", () => {
  toggleGlass();
  renderGlassSetting();
});
for (const button of el.pierceModes.querySelectorAll("button")) {
  button.addEventListener("click", () => {
    state.pierceMode = button.dataset.pierce || "off";
    localStorage.setItem("mh.pierceMode", state.pierceMode);
    applyPierce();
  });
}
el.pierceAlpha.addEventListener("input", () => {
  const value = Number(el.pierceAlpha.value);
  state.pierceAlpha = Number.isFinite(value) ? value : 62;
  localStorage.setItem("mh.pierceAlpha", String(state.pierceAlpha));
  applyPierce();
});
if (el.pierceClear) {
  el.pierceClear.addEventListener("click", () => {
    state.pierceAlpha = 0;
    localStorage.setItem("mh.pierceAlpha", "0");
    applyPierce();
  });
}
if (el.pierceToggleBtn) {
  if (desktopShell) el.pierceToggleBtn.hidden = false;
  el.pierceToggleBtn.addEventListener("click", () => {
    const on = state.pierceMode === "clear" || state.pierceMode === "acrylic";
    state.pierceMode = on ? "off" : "clear";
    if (!on) {
      state.pierceAlpha = 0;
      localStorage.setItem("mh.pierceAlpha", "0");
    }
    localStorage.setItem("mh.pierceMode", state.pierceMode);
    applyPierce();
  });
}
if (el.sidebarHideBtn) {
  el.sidebarHideBtn.addEventListener("click", () => setSidebarHidden(true));
}
if (el.sidebarShowBtn) {
  el.sidebarShowBtn.addEventListener("click", () => setSidebarHidden(false));
}
if (desktopShell && el.winControls) {
  el.winControls.hidden = false;
  for (const button of el.winControls.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      const action = button.dataset.win;
      // 「全屏」只把整个软件铺满屏幕，不再顺带跳进歌词页。
      if (action === "fullscreen") {
        window.mhDesktop?.setFullscreen?.(!document.body.classList.contains("mh-fullscreen"));
        return;
      }
      window.mhDesktop?.windowAction?.(action);
      if (action === "maximize") window.setTimeout(updateWinControls, 160);
    });
  }
  window.addEventListener("resize", updateWinControls);
  // 主进程才知道窗口是不是真全屏；用它回来点亮/取消状态，Esc 也靠它退出。
  window.mhDesktop?.onFullscreenChange?.((on) => {
    document.body.classList.toggle("mh-fullscreen", on);
    syncDragBar();
  });
}
/* 右键按住空白处拖窗口：无边框窗口只有顶栏能拖，想在页面任意空白处抓起来挪，得自己转发给主进程 */
const DRAG_BLOCKERS = [
  "button", "a", "input", "textarea", "select", "label", "summary",
  "canvas", "[contenteditable]", "[role='slider']",
  ".track", ".queue-item", ".lo-line", ".sfp-card", ".sfp-dock",
  ".butler", ".drawer", ".modal-card", ".roadmap-card", ".starfield",
  ".tabs", ".search", ".track-list", ".playmode-menu", ".sidebar-show",
].join(",");

function isBlankArea(target) {
  if (!(target instanceof Element)) return false;
  return !target.closest(DRAG_BLOCKERS);
}

/* 空白处按住拖窗口：左键、右键都行（右键立刻开始，左键超过 4px 才算拖，这样点击不受影响）。
 * 位移交给主进程按系统光标算，页面这边不参与坐标换算，DPI 不会跑偏。 */
if (desktopShell) {
  let dragging = false;
  let pending = null; // { button, screenX, screenY }

  const startDrag = () => {
    dragging = true;
    pending = null;
    document.body.classList.add("window-dragging");
    window.mhDesktop?.beginWindowDrag?.();
  };

  const endWindowDrag = () => {
    pending = null;
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("window-dragging");
    window.mhDesktop?.endWindowDrag?.();
  };

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    if (!isBlankArea(event.target)) return;
    if (document.body.classList.contains("mh-fullscreen")) return;
    pending = { button: event.button, screenX: event.screenX, screenY: event.screenY };
    if (event.button === 2) {
      event.preventDefault();
      startDrag();
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (!pending || dragging) return;
    if (Math.abs(event.screenX - pending.screenX) < 4 && Math.abs(event.screenY - pending.screenY) < 4) return;
    startDrag();
  });

  document.addEventListener("mouseup", () => endWindowDrag());
  window.addEventListener("blur", endWindowDrag);
  document.addEventListener("contextmenu", (event) => {
    if (isBlankArea(event.target)) event.preventDefault();
  });
}
/* 设置页：默认音量 / 歌词字号 / 快捷键 */
if (el.settingsVolume) {
  el.settingsVolume.addEventListener("input", () => {
    const value = Number(el.settingsVolume.value);
    paintRangeFill(el.settingsVolume, value);
    if (el.settingsVolumeLabel) el.settingsVolumeLabel.textContent = `${value}%`;
    localStorage.setItem("mh.volume", String(value));
    if (el.volume) {
      el.volume.value = String(value);
      el.volume.style.setProperty("--vol", `${value}%`);
    }
    if (player && typeof player.setVolume === "function") player.setVolume(value / 100);
  });
}
if (el.settingsLyric) {
  el.settingsLyric.addEventListener("input", () => {
    const value = Number(el.settingsLyric.value);
    paintRangeFill(el.settingsLyric, value);
    if (el.settingsLyricLabel) el.settingsLyricLabel.textContent = `${value}%`;
    localStorage.setItem("mh.lyricScale", String(value));
    applyLyricScale(value);
  });
}
applyLyricScale(Number(localStorage.getItem("mh.lyricScale") ?? 100));
if (el.settingsRoadmapOpen) {
  el.settingsRoadmapOpen.addEventListener("click", () => {
    closeSettings();
    openRoadmap();
  });
}
el.closeOnboard.addEventListener("click", closeOnboard);
el.obSkip.addEventListener("click", closeOnboard);
el.obDone.addEventListener("click", closeOnboard);
el.obLogin.addEventListener("click", () => (qqReady() ? reloginQq() : startQqLogin()));
el.obAddFolder.addEventListener("click", addLibraryRoot);
el.obPickFolder.addEventListener("click", pickLibraryRoot);

/* playlists */
if (el.importQQBtn) el.importQQBtn.addEventListener("click", openQqImport);
el.closeQqImport.addEventListener("click", closeQqImport);
el.qqImportOverlay.addEventListener("click", (event) => {
  if (event.target === el.qqImportOverlay) closeQqImport();
});
el.backToPlaylists.addEventListener("click", backToPlaylists);
el.playAllBtn.addEventListener("click", () => {
  if (state.currentList.length) player.setQueue(state.currentList, 0, true);
});
if (el.syncPlaylistBtn) {
  el.syncPlaylistBtn.addEventListener("click", () => {
    syncRemotePlaylist().catch((error) => toast(error.message, true));
  });
}
if (el.saveQqBtn) {
  el.saveQqBtn.addEventListener("click", () => {
    saveQqPlaylistAsLocal().catch((error) => toast(error.message, true));
  });
}
if (el.newPlaylistBtn) el.newPlaylistBtn.addEventListener("click", newPlaylist);
if (el.renamePlaylistBtn) el.renamePlaylistBtn.addEventListener("click", renameCurrentPlaylist);
if (el.selectBtn) el.selectBtn.addEventListener("click", () => toggleSelectMode(true));
if (el.cancelSelectBtn) el.cancelSelectBtn.addEventListener("click", () => toggleSelectMode(false));
if (el.selectAllBtn) el.selectAllBtn.addEventListener("click", selectAllTracks);
if (el.removeSelectedBtn) {
  el.removeSelectedBtn.addEventListener("click", () => {
    removeSelectedTracks().catch((error) => toast(error.message, true));
  });
}
if (el.nameOk) el.nameOk.addEventListener("click", () => submitNameDialog().catch((error) => toast(error.message, true)));
if (el.closeName) el.closeName.addEventListener("click", closeNameDialog);
if (el.nameOverlay) {
  el.nameOverlay.addEventListener("click", (event) => {
    if (event.target === el.nameOverlay) closeNameDialog();
  });
}
if (el.nameInput) {
  el.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitNameDialog().catch((error) => toast(error.message, true));
    }
    if (event.key === "Escape") closeNameDialog();
  });
}
bindRowDrag();
el.obPath.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addLibraryRoot();
});

/* lyrics overlay */
el.closeLyrics.addEventListener("click", closeLyrics);
el.loPlay.addEventListener("click", () => player.toggle());
el.loPrev.addEventListener("click", () => player.prev());
el.loNext.addEventListener("click", () => player.next());
el.lyrMinus.addEventListener("click", () => setLyricOffset(state.lyricOffset - 500));
el.lyrPlus.addEventListener("click", () => setLyricOffset(state.lyricOffset + 500));
el.cover.addEventListener("click", () => {
  if (!player.track) return;
  openLyrics();
});
el.cover.addEventListener("dblclick", () => {
  if (player.track) openLyrics();
});

/* tabs + search */
for (const tab of el.tabs) {
  tab.addEventListener("click", () => setTab(tab.dataset.tab));
}

let searchTimer = 0;
el.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = el.search.value.trim();
  searchTimer = window.setTimeout(() => {
    if (state.tab === "online") {
      loadOnline(query);
      return;
    }
    if (!query) {
      if (state.tab === "search") setTab("recent");
      return;
    }
    state.tab = "search";
    state.playlistId = null;
    state.remotePlaylistId = null;
    state.playlistName = "";
    for (const btn of el.tabs) btn.classList.remove("active");
    el.search.placeholder = "搜索本地 / QQ 音乐";
    updateListActions();
    runSearch(query).catch((e) => toast(e.message, true));
  }, 260);
});

/* scan (settings only) */
async function scanLibraryNow() {
  if (!el.settingsScan) return;
  el.settingsScan.disabled = true;
  el.settingsScan.textContent = "扫描中…";
  try {
    const result = await api.scan();
    toast(`扫描完成：新增 ${result.added} 首，更新 ${result.updated} 首，共 ${result.total} 首`);
    await loadLibrary(el.search.value.trim());
    await refreshStats();
    await loadSettingsData();
  } catch (error) {
    toast(`扫描失败：${error.message}`, true);
  } finally {
    el.settingsScan.disabled = false;
    el.settingsScan.textContent = "立即扫描曲库";
  }
}

/* keyboard */
document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    if (event.key === "Escape") event.target.blur();
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    player.toggle();
  } else if (event.key === "ArrowRight" && !state.lyricsOpen) {
    player.next();
  } else if (event.key === "ArrowLeft" && !state.lyricsOpen) {
    player.prev();
  } else if (event.key === "ArrowDown" && state.lyricsOpen) {
    event.preventDefault();
    lyricsView.step(1);
  } else if (event.key === "ArrowUp" && state.lyricsOpen) {
    event.preventDefault();
    lyricsView.step(-1);
  } else if (event.code === "KeyL") {
    toggleLyrics();
  } else if (event.code === "KeyF") {
    toggleLyrics();
  } else if (event.code === "KeyG") {
    toggleGlass();
  } else if (event.code === "KeyR") {
    state.roadmapOpen ? closeRoadmap() : openRoadmap();
  } else if (event.key === "Escape") {
    // 删除确认框是最前面的一层
    if (el.confirmOverlay?.classList.contains("open")) {
      settleConfirm(false);
      return;
    }
    // 桌面壳按了「全屏」时，Esc 先把全屏退掉，再谈关别的层
    if (document.body.classList.contains("mh-fullscreen")) {
      window.mhDesktop?.setFullscreen?.(false);
      return;
    }
    // 播放模式小菜单是最轻的一层，先关它
    if (state.playModeOpen) {
      closePlayModeMenu();
      return;
    }
    // 后开的那一层先关：抽屉盖在星海上面
    if (state.butlerOpen) closeButler();
    else if (el.starfieldOverlay?.classList.contains("open")) closeStarfieldPanel();
    else if (el.onboard.classList.contains("open")) closeOnboard();
    else if (el.settingsOverlay.classList.contains("open")) closeSettings();
    else if (el.accountOverlay.classList.contains("open")) closeAccount();
    else if (el.qqImportOverlay.classList.contains("open")) closeQqImport();
    else if (state.roadmapOpen) closeRoadmap();
    else if (state.lyricsOpen) closeLyrics();
    else if (state.queueOpen) closeQueue();
    else if (state.selectMode) toggleSelectMode(false);
    else if (state.tab === "playlists" && (state.playlistId || state.remotePlaylistId)) backToPlaylists();
  } else if (event.key === "/") {
    event.preventDefault();
    el.search.focus();
  }
});

window.addEventListener("pagehide", () => {
  saveResume();
  journal.beacon();
});

/* media session: OS overlay + hardware media keys */
const SEEK_STEP_MS = 10000;
let lastPositionState = { at: 0, ms: -1 };

function updatePositionState(ms) {
  if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") return;
  const durationMs = player.durationMs || state.duration || 0;
  if (!(durationMs > 0)) return;
  if (Math.abs(ms - lastPositionState.ms) < 900) return;
  lastPositionState = { at: Date.now(), ms };
  try {
    navigator.mediaSession.setPositionState({
      duration: durationMs / 1000,
      playbackRate: 1,
      position: clamp(ms / 1000, 0, durationMs / 1000),
    });
  } catch {
    /* ignore */
  }
}

if ("mediaSession" in navigator) {
  const session = navigator.mediaSession;
  const on = (action, handler) => {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* unsupported action */
    }
  };
  const skip = (details, direction) => {
    const step = Number(details?.seekOffset) > 0 ? Number(details.seekOffset) * 1000 : SEEK_STEP_MS;
    player.seek(player.currentTimeMs + direction * step);
  };
  on("play", () => player.play());
  on("pause", () => player.pause());
  on("stop", () => player.stop());
  on("previoustrack", () => player.prev());
  on("nexttrack", () => player.next());
  on("seekto", (details) => {
    if (Number.isFinite(details.seekTime)) player.seek(details.seekTime * 1000);
  });
  on("seekbackward", (details) => skip(details, -1));
  on("seekforward", (details) => skip(details, 1));
}

/* ------------------------------------------------------------------- boot */
async function boot() {
  const stored = Number(localStorage.getItem("mh.volume") ?? 80);
  const volume = clamp(Number.isFinite(stored) ? stored : 80, 0, 100);
  player.setVolume(volume / 100);
  updateVolumeUI(volume);
  updatePlayModeUI();
  setPlayIcon(false);
  initGlass();
  document.body.classList.toggle("mh-desktop", desktopShell);
  applySidebarHidden();
  syncDragBar();
  applyPierce();
  updateWinControls();

  try {
    await loadLibrary();
    if (state.tracks.length) {
      const resume = readResume();
      let index = resume ? state.tracks.findIndex((track) => track.id === resume.id) : -1;
      let position = 0;
      if (index >= 0 && resume.position > 1000) {
        position = resume.position;
      } else if (index < 0) {
        index = Math.max(0, state.tracks.findIndex((track) => track.has_lyrics));
      }
      if (index < 0) index = 0;
      player.setQueue(state.tracks, index, false);
      player.prepare(index, position);
      if (position > 1000) {
        window.setTimeout(() => toast(`已恢复上次进度 ${fmtTime(position)}`), 400);
      }
    } else {
      toast("曲库还是空的，去设置里添加目录并扫描");
    }
    setTab("recent");
    await refreshStats();
    await loadOnlineStatus();
    loadPlaylists().catch(() => {});
    await loadLikes();
    await maybeShowOnboard();
    // 启动落在首页；播放页、歌词页、星海都从这一页进，也都能回来。
    showView("home");
    loadRoadmap();
  } catch (error) {
    toast(`后端没连上：${error.message}`, true);
  }
  loop();
}

/* 首启引导：曲库空的时候别让用户对着一片空白发呆，直接把人带到「添加曲库目录」 */
async function ensureLibraryOnboarding() {
  try {
    const result = await api.libraryRoots();
    const roots = result.items || result.roots || [];
    if (state.tracks.length === 0 && !roots.length) {
      toast("曲库还是空的：先在这里加一个放音乐的文件夹", false);
      await openSettings();
      el.settingsPath?.focus();
      el.settingsPath?.scrollIntoView({ block: "center" });
    }
  } catch {
    /* 拿不到就安静地跳过，不影响启动 */
  }
}

boot().then(() => {
  window.setTimeout(() => {
    ensureLibraryOnboarding().catch(() => {});
  }, 1200);
});

// Debug handle for local verification / the future desktop shell.
window.__mh = {
  player,
  journal,
  state,
  lyricsView,
  api,
  starfield,
  openOnboard,
  openAccount,
  openSettings,
  closeSettings,
  isBlankArea,
  openStarfieldPanel,
  closeStarfieldPanel,
  openQqImport,
  openPlaylist,
  loadPlaylists,
  loadOnlineStatus,
  maybeShowOnboard,
  renderAccountList,
  renderOnlineState,
  startQqLogin,
  logoutQq,
  openLyrics,
  closeLyrics,
  openButler,
  closeButler,
  loadButlerReport,
  runSearch,
  renderSearch,
  exportReportPng,
  exportReportCsv,
};
