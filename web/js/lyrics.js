/**
 * Immersive lyric sheet.
 * - auto-follows the active line with a transform transition
 * - pointer drag / wheel browses lines; releasing snaps and seeks
 */
export function activeLineIndex(lines, ms) {
  if (!lines || !lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = lines[mid].t ?? 0;
    if (t <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;
const PUNCT = /[，。！？、；：""''《》（）【】…—·,.!?;:'"()\[\]{}<>/\\|-]/;

/** Rough glyph weight so a per-line estimate lands on character boundaries. */
function charWeight(ch) {
  if (!ch.trim()) return 0;
  if (CJK.test(ch)) return 1;
  if (PUNCT.test(ch)) return 0.32;
  return 0.56;
}

function glyphs(text) {
  return Array.from(text || "");
}

/**
 * Immersive lyric sheet.
 * - auto-follows the active line with a transform transition
 * - the active line is highlighted character by character (karaoke)
 * - pointer drag / wheel browses lines; releasing snaps and seeks
 */
export class LyricsView {
  constructor(stage, linesEl, { onSeek } = {}) {
    this.stage = stage;
    this.linesEl = linesEl;
    this.onSeek = onSeek || (() => {});
    this.lines = [];
    this.synced = false;
    this.els = [];
    this.centers = [];
    this.activeIndex = -2;
    this.offset = 0;
    this.open = false;
    this.dragging = false;
    this.moved = 0;
    this.suppressClick = false;
    this.wheelAcc = 0;
    this.lastWheelAt = 0;

    this.stage.addEventListener("pointerdown", (e) => this.#down(e));
    this.stage.addEventListener("pointermove", (e) => this.#move(e));
    this.stage.addEventListener("pointerup", (e) => this.#up(e));
    this.stage.addEventListener("pointercancel", (e) => this.#up(e));
    this.stage.addEventListener("wheel", (e) => this.#wheel(e), { passive: false });
    this.linesEl.addEventListener("click", (e) => this.#click(e));
    this.spans = [];
    this.sungCount = -1;
    this.karaoke = false;
  }

  setLines(lines, synced = false) {
    this.lines = Array.isArray(lines) ? lines : [];
    this.synced = Boolean(synced) && this.lines.length > 0;
    this.activeIndex = -2;
    this.offset = 0;
    this.els = [];
    this.centers = [];
    this.spans = [];
    this.sungCount = -1;
    this.karaoke = false;
    this.linesEl.innerHTML = "";

    if (!this.lines.length) {
      const empty = document.createElement("div");
      empty.className = "lo-line empty";
      empty.textContent = "这首歌还没有歌词，先听会儿曲子";
      this.linesEl.append(empty);
      this.els = [empty];
      return;
    }

    const frag = document.createDocumentFragment();
    this.lines.forEach((line, i) => {
      const el = document.createElement("div");
      el.className = "lo-line";
      el.textContent = line.text;
      el.tabIndex = 0;
      el.dataset.i = String(i);
      if (line.t != null) el.dataset.t = String(line.t);
      frag.append(el);
    });
    this.linesEl.append(frag);
    this.els = Array.from(this.linesEl.children);
    this.measure();
  }

  measure() {
    this.centers = this.els.map((el) => el.offsetTop + el.offsetHeight / 2);
  }

  setOpen(open) {
    this.open = open;
    if (open) {
      requestAnimationFrame(() => {
        this.measure();
        this.follow(true);
      });
      setTimeout(() => {
        if (!this.open) return;
        this.measure();
        this.follow(false);
      }, 160);
    }
  }

  update(ms, force = false) {
    if (!this.open && !force) return;
    if (!this.synced) return;
    const idx = activeLineIndex(this.lines, ms);
    if (idx === this.activeIndex && !force) return;
    const previous = this.activeIndex;
    this.activeIndex = idx;
    if (previous >= 0 && previous !== idx) this.#plainLine(previous);
    this.els.forEach((el, i) => {
      el.classList.toggle("active", i === idx);
      el.classList.toggle("past", i < idx);
    });
    if (idx >= 0) this.#karaokeLine(idx);
    else this.#clearKaraoke();
    if (!this.dragging) this.follow(true);
  }

  /**
   * Fill the active line character by character.
   * Uses real word timestamps when the lyrics carry them; otherwise the line's
   * own duration is spread over its glyphs (an estimate, never a new time).
   */
  setProgress(ms) {
    if (!this.open || !this.synced || this.dragging) return;
    if (!this.spans.length || this.activeIndex < 0) return;
    const line = this.lines[this.activeIndex];
    if (!line || line.t == null) return;
    const next = this.lines[this.activeIndex + 1];
    const start = line.t;
    const end = next?.t != null && next.t > start ? next.t : start + 4200;
    const sung = this.#sungCount(line, start, end, ms);
    if (sung === this.sungCount) return;
    this.sungCount = sung;
    this.spans.forEach((span, index) => span.classList.toggle("sung", index < sung));
  }

  #clearKaraoke() {
    this.spans = [];
    this.sungCount = -1;
    this.karaoke = false;
  }

  /** Put the plain text back on a line that is no longer active. */
  #plainLine(index) {
    const el = this.els[index];
    const line = this.lines[index];
    if (!el || !line || !el.classList.contains("karaoke")) return;
    el.textContent = line.text;
    el.classList.remove("karaoke");
  }

  #karaokeLine(index) {
    const el = this.els[index];
    const line = this.lines[index];
    if (!el || !line) return;
    const chars = glyphs(line.text);
    if (!chars.length) return;
    const wrap = document.createElement("span");
    wrap.className = "lo-k";
    this.spans = chars.map((ch) => {
      const span = document.createElement("span");
      span.className = "lo-ch";
      span.textContent = ch === " " ? "\u00a0" : ch;
      wrap.append(span);
      return span;
    });
    this.sungCount = -1;
    this.karaoke = true;
    el.textContent = "";
    el.append(wrap);
    el.classList.add("karaoke");
    el.dataset.karaoke = Array.isArray(line.words) && line.words.length ? "words" : "estimate";
  }

  #sungCount(line, start, end, ms) {
    const chars = glyphs(line.text);
    const total = chars.length;
    if (!total) return 0;
    if (ms <= start) return 0;
    if (ms >= end) return total;
    const words = line.words;
    if (Array.isArray(words) && words.length) {
      let covered = 0;
      for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        const wordEnd = i + 1 < words.length ? words[i + 1].t : end;
        const length = glyphs(word.text).length;
        if (ms >= wordEnd) {
          covered += length;
          continue;
        }
        if (ms > word.t) {
          const ratio = (ms - word.t) / Math.max(1, wordEnd - word.t);
          covered += Math.min(length, Math.max(1, Math.round(ratio * length)));
          break;
        }
        break;
      }
      return Math.max(0, Math.min(total, covered));
    }
    let weight = 0;
    let totalWeight = 0;
    const weights = chars.map((ch) => {
      const w = charWeight(ch);
      totalWeight += w;
      return w;
    });
    if (!totalWeight) return 0;
    const ratio = (ms - start) / Math.max(1, end - start);
    for (let i = 0; i < weights.length; i += 1) {
      weight += weights[i];
      if (weight / totalWeight >= ratio) return i + 1;
    }
    return total;
  }

  follow(animate = true) {
    if (!this.els.length) return;
    if (this.stage.clientHeight < 40) return;
    if (!this.centers.length) this.measure();
    const i = this.activeIndex >= 0 ? this.activeIndex : 0;
    const center = this.stage.clientHeight / 2;
    const y = center - (this.centers[i] ?? 0);
    this.setOffset(y, animate);
  }

  setOffset(y, animate) {
    this.offset = y;
    this.linesEl.classList.toggle("no-anim", !animate);
    this.linesEl.style.transform = `translate3d(0, ${y}px, 0)`;
  }

  step(dir, baseMs) {
    if (!this.lines.length) return;
    let idx = this.activeIndex;
    if (idx < 0) idx = 0;
    const next = Math.min(Math.max(idx + dir, 0), this.lines.length - 1);
    const line = this.lines[next];
    if (line?.t != null) this.onSeek(line.t);
  }

  #down(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!this.lines.length) return;
    this.dragging = true;
    this.startY = e.clientY;
    this.startOffset = this.offset;
    this.moved = 0;
    this.stage.classList.add("dragging");
    this.linesEl.classList.add("no-anim");
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!this.centers.length) this.measure();
  }

  #move(e) {
    if (!this.dragging) return;
    const dy = e.clientY - this.startY;
    this.moved = dy;
    this.setOffset(this.startOffset + dy, false);
  }

  #up(e) {
    if (!this.dragging) return;
    this.dragging = false;
    this.stage.classList.remove("dragging");
    const moved = Math.abs(this.moved);
    this.suppressClick = moved > 8;
    if (moved > 8) {
      const center = this.stage.clientHeight / 2;
      let best = -1;
      let bestDist = Infinity;
      this.centers.forEach((c, i) => {
        const dist = Math.abs(c + this.offset - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      const line = this.lines[best];
      if (line?.t != null) {
        this.onSeek(line.t);
        return;
      }
    }
    this.follow(true);
    setTimeout(() => {
      this.suppressClick = false;
    }, 0);
  }

  #wheel(e) {
    if (!this.open) return;
    e.preventDefault();
    const now = Date.now();
    if (now - this.lastWheelAt < 180) return;
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) < 55) return;
    const dir = this.wheelAcc > 0 ? 1 : -1;
    this.wheelAcc = 0;
    this.lastWheelAt = now;
    this.step(dir);
  }

  #click(e) {
    const el = e.target.closest(".lo-line");
    if (!el || this.suppressClick) return;
    const i = Number(el.dataset.i);
    const line = this.lines[i];
    if (line?.t != null) this.onSeek(line.t);
  }
}
