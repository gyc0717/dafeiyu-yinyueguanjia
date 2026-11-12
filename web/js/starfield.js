/* 星海 · 原生视图
 * 从 prototype/starfield.html 里把「星图」这一段搬进主界面：
 * 同一块 canvas、同一种投影与配色，但不再用 iframe，也不再自带播放条与应用导航。
 * 播放、队列、当前曲目全部走主播放器（Player 实例），这里只负责画和选中。
 */

const TAU = Math.PI * 2;

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function platformOf(track) {
  const key = track && track.provider;
  return key === "qq" || key === "ne" || key === "kg" ? key : "local";
}

function fmt(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function readToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function createStarfield({ root, canvas, player, onToast }) {
  const q = (sel) => root.querySelector(sel);
  const card = q("#sfpCard");
  const dock = q("#sfpDock");

  let palette = null;
  let tracks = [];
  let stars = [];
  let dust = [];
  let filter = "all";
  let query = "";
  let hover = null;
  let selected = null;
  let isOpen = false;
  let raf = 0;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let drag = null;
  let moved = 0;
  const cam = { x: 0, y: 0, scale: 1 };

  function ensurePalette() {
    palette = {
      local: { label: "本地", short: "本地", color: readToken("--warn", "#f0a35e"), angle: 0.2 },
      qq: { label: "QQ 音乐", short: "QQ", color: readToken("--acc", "#5aa2ff"), angle: 2.1 },
      ne: { label: "网易云", short: "网易", color: readToken("--danger", "#e5646e"), angle: 3.9 },
      kg: { label: "酷狗", short: "酷狗", color: readToken("--ok", "#4fd1a5"), angle: 5.2 },
    };
  }

  function meta(track) {
    ensurePalette();
    return palette[platformOf(track)];
  }

  /* ---------------------------------------------------------------- 数据 */

  function buildStars() {
    const groups = {};
    for (const track of tracks) {
      const key = platformOf(track);
      (groups[key] = groups[key] || []).push(track);
    }
    const out = [];
    for (const [key, list] of Object.entries(groups)) {
      const info = palette[key] || palette.local;
      const inner = key === "local" ? 0.18 : 0.62;
      const spread = key === "local" ? 0.52 : 0.55;
      list.forEach((track, i) => {
        const seed = hash(track.id);
        const angle = i * 2.399 + info.angle + ((seed % 100) / 100) * 0.55;
        const radius = inner + ((seed >> 3) % 100) / 100 * spread;
        const r = 2.2 + Math.min((track.duration_ms || 0) / 90000, 1) * 3.2;
        out.push({
          ...track,
          key,
          color: info.color,
          nx: Math.cos(angle) * radius,
          ny: Math.sin(angle) * radius * 0.78,
          r,
          phase: ((seed % 1000) / 1000) * TAU,
        });
      });
    }
    stars = out;
    if (selected) selected = stars.find((s) => s.id === selected.id && s.key === selected.key) || null;
  }

  function makeDust() {
    dust = Array.from({ length: 260 }, (_, i) => {
      const seed = hash(`dust-${i}`);
      return {
        nx: ((seed % 2400) / 1000 - 1.2) * 1.08,
        ny: (((seed >> 5) % 2400) / 1000 - 1.2) * 0.95,
        r: 0.35 + (((seed >> 9) % 100) / 100) * 1.1,
        phase: (((seed >> 3) % 1000) / 1000) * TAU,
        bright: 0.1 + (((seed >> 7) % 100) / 100) * 0.35,
      };
    });
  }

  function visibleStars() {
    const needle = query.trim().toLowerCase();
    return stars.filter((s) => {
      if (filter !== "all" && s.key !== filter) return false;
      if (!needle) return true;
      return `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(needle);
    });
  }

  function refreshCounts() {
    ensurePalette();
    const counts = { all: stars.length, local: 0, qq: 0 };
    for (const star of stars) counts[star.key] = (counts[star.key] || 0) + 1;
    for (const button of root.querySelectorAll("[data-filter]")) {
      const key = button.dataset.filter;
      const em = button.querySelector("em");
      if (em) em.textContent = String(counts[key] ?? 0);
      button.classList.toggle("on", key === filter);
    }
    const total = q("#sfpTotal");
    if (total) total.textContent = String(stars.length);
  }

  /* ---------------------------------------------------------------- 几何 */

  function resize() {
    if (!canvas || !isOpen) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    W = cw;
    H = ch;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.getContext("2d").setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function project(star) {
    return {
      x: W / 2 + cam.x + star.nx * W * 0.43 * cam.scale,
      y: H / 2 + cam.y + star.ny * H * 0.41 * cam.scale,
      r: star.r * cam.scale,
    };
  }

  function hitTest(x, y) {
    let best = null;
    let bestD = 18;
    for (const star of visibleStars()) {
      const p = project(star);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < Math.max(12, p.r * 2.6) && d < bestD) {
        bestD = d;
        best = star;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- 绘制 */

  function drawNebula(ctx, w, h) {
    if (!palette) ensurePalette();
    const blobs = [
      { x: w * 0.5, y: h * 0.5, r: Math.min(w, h) * 0.58, c: "rgba(240,163,94,.20)" },
      { x: w * 0.72, y: h * 0.38, r: Math.min(w, h) * 0.52, c: "rgba(90,162,255,.20)" },
      { x: w * 0.3, y: h * 0.66, r: Math.min(w, h) * 0.44, c: "rgba(167,139,250,.12)" },
      { x: w * 0.58, y: h * 0.76, r: Math.min(w, h) * 0.3, c: "rgba(90,162,255,.09)" },
    ];
    for (const b of blobs) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawDust(ctx, w, h, now) {
    for (const d of dust) {
      const x = w / 2 + cam.x + d.nx * w * 0.46 * cam.scale;
      const y = h / 2 + cam.y + d.ny * h * 0.46 * cam.scale;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.globalAlpha = d.bright * (0.55 + 0.45 * Math.sin(now / 1400 + d.phase));
      ctx.fillStyle = "#b9c9dc";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.4, d.r * cam.scale), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGalaxy(now) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    drawNebula(ctx, W, H);
    drawDust(ctx, W, H, now);

    const list = visibleStars();
    const playingId = player.track ? player.track.id : null;

    ctx.save();
    ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
    ctx.lineWidth = 1;
    for (const [rx, ry, a] of [[0.42, 0.32, 0.07], [0.66, 0.5, 0.055], [0.92, 0.7, 0.035]]) {
      ctx.strokeStyle = `rgba(143,163,187,${a})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, W * rx * cam.scale, H * ry * cam.scale, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 星座连线：同专辑或同歌手，且彼此够近
    ctx.lineWidth = 0.6;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const sameAlbum = a.album && a.album === b.album;
        const sameArtist = a.artist && a.artist !== "未知歌手" && a.artist === b.artist;
        if (!sameAlbum && !sameArtist) continue;
        const pa = project(a);
        const pb = project(b);
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d > 170) continue;
        ctx.strokeStyle = `rgba(143,163,187,${0.12 * (1 - d / 170)})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    for (const star of list) {
      const p = project(star);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const twinkle = 0.62 + 0.38 * Math.sin(now / 900 + star.phase);
      const active = hover === star || selected === star;
      const isPlaying = playingId === star.id;
      const r = p.r * (active ? 1.9 : 1);
      ctx.save();
      ctx.shadowColor = star.color;
      ctx.shadowBlur = active ? 34 : isPlaying ? 28 : 16;
      ctx.fillStyle = star.color;
      ctx.globalAlpha = isPlaying ? 1 : twinkle;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, r), 0, TAU);
      ctx.fill();
      if (r > 4.1) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = star.color;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 2.4, p.y);
        ctx.lineTo(p.x + r * 2.4, p.y);
        ctx.moveTo(p.x, p.y - r * 2.4);
        ctx.lineTo(p.x, p.y + r * 2.4);
        ctx.stroke();
      }
      ctx.restore();
      if (isPlaying) {
        ctx.strokeStyle = "rgba(230,237,246,.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6 + Math.sin(now / 300) * 2, 0, TAU);
        ctx.stroke();
      }
      if (active) {
        ctx.strokeStyle = star.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 9, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    const badge = q("#sfpZoom");
    if (badge) badge.textContent = `${Math.round(cam.scale * 100)}%`;
  }

  function loop(now) {
    if (!isOpen) return;
    if (W < 2) resize();
    if (W >= 2) drawGalaxy(now || performance.now());
    raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- 卡片 */

  function setCover(el, track) {
    if (!el) return;
    el.innerHTML = `<span class="sfp-cover-fallback">${(track.title || "♪").trim().charAt(0) || "♪"}</span>`;
    if (track.cover_url) {
      const img = document.createElement("img");
      img.src = track.cover_url;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      el.append(img);
    }
  }

  function openCard(star, x, y) {
    selected = star;
    const info = meta(star);
    setCover(q("#sfpCardCover"), star);
    q("#sfpCardTitle").textContent = star.title || "未命名";
    q("#sfpCardMeta").textContent = `${star.artist || "未知歌手"} · ${star.album || "未命名专辑"}`;
    const badge = q("#sfpCardBadge");
    badge.className = `sfp-badge ${star.key}`;
    badge.textContent = info.label;
    q("#sfpCardDur").textContent = fmt(star.duration_ms);
    card.hidden = false;
    card.classList.add("on");
    if (window.innerWidth <= 900) {
      card.style.left = "";
      card.style.top = "";
      return;
    }
    const cw = 288;
    const ch = 210;
    let left = x + 18;
    let top = y - 20;
    if (left + cw > W - 12) left = x - cw - 18;
    if (top + ch > H - 12) top = H - ch - 12;
    card.style.left = `${Math.max(12, left)}px`;
    card.style.top = `${Math.max(12, top)}px`;
  }

  function closeCard() {
    selected = null;
    card.hidden = true;
    card.classList.remove("on");
  }

  /* ---------------------------------------------------------------- 底栏 */

  function syncDock() {
    if (!dock) return;
    const track = player.track;
    const has = Boolean(track);
    dock.classList.toggle("empty", !has);
    const cover = q("#sfpDockCover");
    if (track) setCover(cover, track);
    else if (cover) cover.innerHTML = '<span class="sfp-cover-fallback">♪</span>';
    q("#sfpDockTitle").textContent = has ? track.title || "未命名" : "还没有在播的歌";
    q("#sfpDockMeta").textContent = has
      ? `${track.artist || "未知歌手"} · ${meta(track).label}`
      : "在星海里点一颗，或者回到播放页";
    q("#sfpDockPlay").textContent = player.playing ? "暂停" : "播放";
    q("#sfpDockPlay").disabled = !has;
    q("#sfpDockPrev").disabled = !has;
    q("#sfpDockNext").disabled = !has;
    syncDockProgress();
  }

  function syncDockProgress() {
    if (!dock) return;
    const duration = player.durationMs || 0;
    const current = player.currentTimeMs || 0;
    const fill = q("#sfpDockFill");
    if (fill) fill.style.width = `${duration ? Math.min((current / duration) * 100, 100) : 0}%`;
    const time = q("#sfpDockTime");
    if (time) time.textContent = `${fmt(current)} / ${fmt(duration || (player.track?.duration_ms ?? 0))}`;
  }

  /* ---------------------------------------------------------------- 事件 */

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    const p = pointerPos(event);
    drag = { x: event.clientX, y: event.clientY, camX: cam.x, camY: cam.y };
    moved = 0;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = "grabbing";
    if (hitTest(p.x, p.y) === null) closeCard();
  });

  canvas.addEventListener("pointermove", (event) => {
    const p = pointerPos(event);
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      cam.x = drag.camX + dx;
      cam.y = drag.camY + dy;
      return;
    }
    const star = hitTest(p.x, p.y);
    hover = star;
    canvas.style.cursor = star ? "pointer" : "grab";
    const label = q("#sfpHover");
    if (!label) return;
    if (star) {
      const pos = project(star);
      label.textContent = `${star.title} · ${star.artist || "未知歌手"}`;
      label.style.left = `${Math.round(pos.x)}px`;
      label.style.top = `${Math.round(pos.y - 26)}px`;
      label.hidden = false;
    } else {
      label.hidden = true;
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    const p = pointerPos(event);
    const wasDragging = moved > 6;
    drag = null;
    canvas.style.cursor = "grab";
    canvas.releasePointerCapture?.(event.pointerId);
    if (wasDragging) return;
    const star = hitTest(p.x, p.y);
    if (star) openCard(star, p.x, p.y);
  });

  canvas.addEventListener("pointerleave", () => {
    hover = null;
    const label = q("#sfpHover");
    if (label) label.hidden = true;
  });

  canvas.addEventListener("dblclick", (event) => {
    const p = pointerPos(event);
    const star = hitTest(p.x, p.y);
    if (star) playStar(star);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const p = pointerPos(event);
      const before = cam.scale;
      const next = Math.min(2.4, Math.max(0.6, before * (event.deltaY > 0 ? 0.92 : 1.08)));
      const mx = p.x - W / 2;
      const my = p.y - H / 2;
      cam.x = mx - ((mx - cam.x) * next) / before;
      cam.y = my - ((my - cam.y) * next) / before;
      cam.scale = next;
    },
    { passive: false },
  );

  function playStar(star) {
    player.playNow(star);
    toast(`播放 · ${star.title}`);
    closeCard();
  }

  function toast(text) {
    if (typeof onToast === "function") onToast(text);
  }

  for (const button of root.querySelectorAll("[data-filter]")) {
    button.addEventListener("click", () => {
      filter = button.dataset.filter;
      refreshCounts();
      closeCard();
    });
  }

  const search = q("#sfpSearch");
  if (search) {
    search.addEventListener("input", () => {
      query = search.value;
      closeCard();
    });
  }

  q("#sfpCardClose").addEventListener("click", closeCard);
  q("#sfpPlay").addEventListener("click", () => {
    if (selected) playStar(selected);
  });
  q("#sfpQueueNext").addEventListener("click", () => {
    if (!selected) return;
    player.insertNext(selected);
    toast(`已设为下一首 · ${selected.title}`);
    closeCard();
  });

  q("#sfpDockPlay").addEventListener("click", () => player.toggle());
  q("#sfpDockPrev").addEventListener("click", () => player.prev());
  q("#sfpDockNext").addEventListener("click", () => player.next());

  player.addEventListener("track", syncDock);
  player.addEventListener("state", syncDock);
  player.addEventListener("time", syncDockProgress);
  player.addEventListener("duration", syncDockProgress);

  /* ---------------------------------------------------------------- 对外 */

  return {
    setTracks(list) {
      ensurePalette();
      tracks = Array.isArray(list) ? list.filter(Boolean) : [];
      buildStars();
      refreshCounts();
      if (isOpen) syncDock();
    },
    open() {
      isOpen = true;
      root.classList.add("open");
      root.setAttribute("aria-hidden", "false");
      ensurePalette();
      if (!dust.length) makeDust();
      refreshCounts();
      syncDock();
      requestAnimationFrame(() => {
        resize();
        if (!raf) raf = requestAnimationFrame(loop);
      });
    },
    close() {
      isOpen = false;
      root.classList.remove("open");
      root.setAttribute("aria-hidden", "true");
      closeCard();
      hover = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resize() {
      if (isOpen) resize();
    },
    refreshTheme() {
      palette = null;
      ensurePalette();
      buildStars();
    },
    get isOpen() {
      return isOpen;
    },
    /* 验收用：星图里每颗星在画布内的位置（浏览器里没有别的办法点到它）。 */
    debugStars() {
      return visibleStars().map((star) => {
        const p = project(star);
        return { id: star.id, title: star.title, provider: star.provider || "local", x: p.x, y: p.y };
      });
    },
  };
}
