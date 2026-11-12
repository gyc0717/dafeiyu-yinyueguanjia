const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* not json */
      }
      const error = new Error(detail || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const post = (url, body) => request(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

export const api = {
  tracks: (q = "") => request(`/api/tracks?limit=1000&q=${encodeURIComponent(q)}`),
  onlineSearch: (q, limit = 20, provider = "qq") =>
    request(`/api/online/search?limit=${limit}&provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(q)}`, {}, 25000),
  onlineStatus: () => request("/api/online/status"),
  neteasePlaylists: () => request("/api/netease/playlists"),
  neteasePlaylistTracks: (id, limit = 300, offset = 0) => request(`/api/netease/playlists/${id}?limit=${limit}&offset=${offset}`, {}, 40000),
  neteaseQr: () => post("/api/online/netease/qr", {}),
  neteaseQrCheck: (key) => request(`/api/online/netease/qr/check?key=${encodeURIComponent(key)}`),
  neteaseLogout: () => post("/api/online/netease/logout", {}),
  onlineLogin: (force = false) => post(`/api/online/login?force=${force ? "true" : "false"}`, {}),
  onlineLoginStatus: () => request("/api/online/login"),
  onlineLogout: () => post("/api/online/logout", {}),
  libraryRoots: () => request("/api/library/roots"),
  addRoot: (path) => post("/api/library/roots", { path }),
  pickRoot: () =>
    request("/api/library/roots/pick", { method: "POST", headers: JSON_HEADERS, body: "{}" }, 190000),
  likes: () => request("/api/likes", {}, 30000),
  like: (id) => post("/api/likes", { track_id: id }),
  unlike: (id) => request(`/api/likes/${id}`, { method: "DELETE" }),
  deleteTrack: (id, mode = "trash") => post(`/api/tracks/${id}/delete`, { mode }),
  tidyRuns: () => request("/api/tidy/runs"),
  tidyRun: (id) => request(`/api/tidy/runs/${id}`, {}, 30000),
  tidyRunCreate: (root, layout) => post("/api/tidy/runs", { root, layout }),
  tidyRunStart: (id) => post(`/api/tidy/runs/${id}/start`, {}),
  tidyRunProbe: (id) => request(`/api/tidy/runs/${id}/probe`),
  tidyRunResume: (id) => post(`/api/tidy/runs/${id}/resume`, {}),
  tidyRunUndo: (id) => post(`/api/tidy/runs/${id}/undo`, {}),
  playlists: () => request("/api/playlists"),
  playlist: (id) => request(`/api/playlists/${id}`),
  deletePlaylist: (id) => request(`/api/playlists/${id}`, { method: "DELETE" }),
  createPlaylist: (name) => post("/api/playlists", { name }),
  renamePlaylist: (id, name) =>
    request(`/api/playlists/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    }),
  removePlaylistTracks: (id, track_ids) =>
    request(`/api/playlists/${id}/tracks`, {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ track_ids }),
    }),
  reorderPlaylist: (id, track_ids) => post(`/api/playlists/${id}/reorder`, { track_ids }),
  saveQqPlaylist: (directoryId, name) =>
    post("/api/playlists/from-qq", { directory_id: directoryId, name: name || null }),
  backups: () => request("/api/backups"),
  backupNow: () => post("/api/backups", {}),
  restoreBackup: (name) => post("/api/backups/restore", { name }),
  deleteBackup: (name) => request(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" }),
  openBackups: () => post("/api/backups/open", {}),
  qqPlaylists: () => request("/api/qq/playlists", {}, 30000),
  qqPlaylist: (id, limit = 300) => request(`/api/qq/playlists/${id}?limit=${limit}`, {}, 60000),
  qqPlaylistTracks: (id, limit = 3000, refresh = false) =>
    request(
      `/api/qq/playlists/${id}/tracks?limit=${limit}${refresh ? "&refresh=1" : ""}`,
      {},
      120000
    ),
  syncQqPlaylist: (id, limit = 3000) =>
    request(
      `/api/qq/playlists/${id}/sync?limit=${limit}`,
      { method: "POST", headers: JSON_HEADERS, body: "{}" },
      180000
    ),
  importQqPlaylist: (directoryId) =>
    request(
      "/api/playlists/import/qq",
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ directory_id: directoryId }) },
      300000
    ),
  track: (id) => request(`/api/tracks/${id}`),
  lyrics: (id) => request(`/api/tracks/${id}/lyrics`),
  recent: () => request("/api/recent?limit=40"),
  statsToday: () => request("/api/stats/today"),
  weekStats: (days = 7) => request(`/api/stats/week?days=${days}`),
  duplicates: () => request("/api/library/duplicates"),
  tidyPlan: (limit = 500, layout = "hybrid") =>
    request(`/api/tidy/plan?limit=${limit}&layout=${layout}`, {}, 60000),
  roadmap: () => request("/api/roadmap"),
  health: () => request("/api/health"),
  scan: () => request("/api/scan", { method: "POST" }, 120000),
  playStart: (body) => post("/api/play/start", body),
  playProgress: (body) => post("/api/play/progress", body),
  playEnd: (body) => post("/api/play/end", body),
  setDuration: (id, duration_ms) => post(`/api/tracks/${id}/duration`, { duration_ms }),
};

export function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtWhen(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const sameDay = new Date().toDateString() === d.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${hh}:${mm}`;
}

export function hueOf(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
