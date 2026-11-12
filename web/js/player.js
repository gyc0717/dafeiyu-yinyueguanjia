/**
 * Player: queue, transport, shuffle/repeat and a thin layer over <audio>.
 *
 * Two <audio> elements are used. The standby one buffers the next track while
 * the active one plays; when the active track ends the two swap, so playback
 * starts from an already-decoded buffer instead of a fresh `src` load. This is
 * the "preload next / gapless switch" pass; the old linear `src` reload is kept
 * as the fallback whenever the preload is not ready.
 *
 * Emits: track, state, time, duration, ended, queue, error, gapless.
 */
export class Player extends EventTarget {
  constructor(audio, standby) {
    super();
    this.elements = [audio, standby ?? this.#createStandby()];
    this.active = 0;
    this.queue = [];
    this.index = -1;
    this.track = null;
    this.repeat = "all"; // off | all | one
    this.shuffle = false;
    this.playing = false;
    this.loading = false;
    this.pendingSeekMs = 0;

    // Preload bookkeeping for the standby element.
    this.preloadIndex = -1;
    this.preloadId = null;
    this.preloadLeadMs = 22000; // start warming the next track this close to the end
    this.earlyPreloadTimer = 0;
    this.swapping = false;
    // Result of the last gapless swap (ms between `ended` and the new buffer
    // being audible-ish); surfaced for local verification.
    this.lastGapMs = null;

    for (const el of this.elements) this.#bind(el);
  }

  /** The element currently producing sound. */
  get audio() {
    return this.elements[this.active];
  }

  /** The element reserved for the next track. */
  get standby() {
    return this.elements[1 - this.active];
  }

  get audioElements() {
    return this.elements.slice();
  }

  #createStandby() {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    document.body.append(el);
    return el;
  }

  #bind(el) {
    el.addEventListener("play", () => {
      if (el !== this.audio) return;
      this.playing = true;
      this.emit("state", { playing: true });
      this.#scheduleEarlyPreload();
      this.#maybePreload();
    });
    el.addEventListener("pause", () => {
      if (el !== this.audio) return;
      this.playing = false;
      this.emit("state", { playing: false });
    });
    el.addEventListener("timeupdate", () => {
      if (el !== this.audio) return;
      this.emit("time", this.currentTimeMs);
      this.#maybePreload();
    });
    el.addEventListener("loadedmetadata", () => {
      if (el !== this.audio) return;
      this.emit("duration", this.durationMs);
      if (this.pendingSeekMs > 0) {
        const limit = Math.max((el.duration || 0) - 0.25, 0);
        el.currentTime = Math.min(this.pendingSeekMs / 1000, limit);
        this.pendingSeekMs = 0;
        this.emit("time", this.currentTimeMs);
      }
    });
    el.addEventListener("durationchange", () => {
      if (el !== this.audio) return;
      this.emit("duration", this.durationMs);
    });
    el.addEventListener("ended", () => {
      if (el !== this.audio) return;
      this.#onEnded();
    });
    el.addEventListener("error", () => {
      // A failed preload is not a playback error: only the live element talks.
      if (el !== this.audio || !el.src) return;
      this.emit("error", { message: "这个文件播不了，可能格式不受支持或文件已移走。" });
    });
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get currentTimeMs() {
    return (this.audio.currentTime || 0) * 1000;
  }

  get durationMs() {
    const d = this.audio.duration;
    if (Number.isFinite(d) && d > 0) return d * 1000;
    return this.track?.duration_ms || 0;
  }

  setQueue(tracks, index = -1, autoplay = false) {
    this.queue = Array.isArray(tracks) ? tracks.slice() : [];
    this.index = Math.min(Math.max(index, -1), this.queue.length - 1);
    this.#resetPlan();
    this.#dropPreload();
    this.emit("queue", { queue: this.queue, index: this.index });
    if (autoplay && this.index >= 0) this.playIndex(this.index);
  }

  /**
   * Play one track without throwing the current queue away.
   * Already queued → jump to it; otherwise slot it in after the current one.
   */
  async playNow(track) {
    if (!track || track.id == null) return;
    const existing = this.queue.findIndex((item) => item.id === track.id);
    if (existing >= 0) {
      await this.playIndex(existing);
      return;
    }
    const insertAt = this.queue.length ? this.index + 1 : 0;
    this.queue.splice(insertAt, 0, track);
    this.#resetPlan();
    this.emit("queue", { queue: this.queue, index: insertAt });
    await this.playIndex(insertAt);
  }

  /** Load a track without starting playback (used for the first screen). */
  prepare(i, positionMs = 0) {
    if (!this.queue.length) return;
    const index = this.#normalize(i);
    this.index = index;
    this.track = this.queue[index];
    this.pendingSeekMs = Math.max(0, positionMs || 0);
    this.#resetPlan();
    this.#dropPreload();
    this.audio.src = `/api/stream/${this.track.id}`;
    this.audio.load();
    this.emit("track", {
      track: this.track,
      index,
      queue: this.queue,
      prepared: true,
      positionMs: this.pendingSeekMs,
    });
  }

  async playIndex(i) {
    if (!this.queue.length) return;
    const index = this.#normalize(i);
    window.clearTimeout(this.earlyPreloadTimer);
    this.#dropPreload();
    this.#resetPlan();
    this.index = index;
    this.track = this.queue[index];
    this.pendingSeekMs = 0;
    this.loading = true;
    this.audio.src = `/api/stream/${this.track.id}`;
    this.audio.load();
    this.emit("track", { track: this.track, index, queue: this.queue });
    try {
      await this.audio.play();
    } catch (err) {
      this.loading = false;
      if (err?.name !== "AbortError") {
        this.emit("error", { message: "播放被浏览器拦住了，再点一次播放试试。" });
      }
    }
  }

  moveInQueue(from, to) {
    if (!this.queue.length) return;
    if (from < 0 || from >= this.queue.length || to < 0 || to >= this.queue.length || from === to) return;
    const [item] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, item);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index -= 1;
    else if (from > this.index && to <= this.index) this.index += 1;
    this.#afterQueueEdit();
    this.emit("queue", { queue: this.queue, index: this.index });
  }

  insertNext(track) {
    if (!track || !this.queue.length) return;
    const existing = this.queue.findIndex((item) => item.id === track.id);
    if (existing === this.index) return;
    if (existing >= 0) {
      this.moveInQueue(existing, this.index + 1);
      return;
    }
    this.queue.splice(this.index + 1, 0, track);
    this.#afterQueueEdit();
    this.emit("queue", { queue: this.queue, index: this.index });
  }

  /** Buffer the track that would play next into the standby element. */
  prepareNext() {
    const plan = this.#planNext();
    if (plan == null) {
      this.#dropPreload();
      return;
    }
    const track = this.queue[plan];
    if (!track) {
      this.#dropPreload();
      return;
    }
    if (this.preloadIndex === plan && this.preloadId === track.id) return;
    const el = this.standby;
    if (el === this.audio || !el.paused) return;
    this.preloadIndex = plan;
    this.preloadId = track.id;
    try {
      el.preload = "auto";
      el.src = `/api/stream/${track.id}`;
      el.load();
    } catch {
      this.preloadIndex = -1;
      this.preloadId = null;
    }
  }

  async toggle() {
    if (!this.track) {
      if (this.queue.length) await this.playIndex(Math.max(this.index, 0));
      return;
    }
    if (this.audio.paused) await this.play();
    else this.pause();
  }

  /** Idempotent play (media session / hardware keys). */
  async play() {
    if (!this.track) {
      if (this.queue.length) await this.playIndex(Math.max(this.index, 0));
      return;
    }
    if (!this.audio.paused) return;
    try {
      await this.audio.play();
    } catch {
      this.emit("error", { message: "播放失败，检查一下文件还在不在。" });
    }
  }

  /** Idempotent pause. */
  pause() {
    if (!this.track) return;
    if (!this.audio.paused) this.audio.pause();
  }

  /** Media "stop": pause and rewind to the beginning, keeping the queue. */
  stop() {
    if (!this.track) return;
    this.audio.pause();
    this.seek(0);
  }

  /** @param {boolean} auto true when triggered by a track ending */
  next(auto = false) {
    if (!this.queue.length) return;
    if (auto) {
      const plan = this.#planNext();
      if (plan == null) {
        this.#stopAtEnd();
        return;
      }
      this.playIndex(plan);
      return;
    }
    if (this.shuffle && this.queue.length > 1) {
      let n = this.index;
      while (n === this.index) n = Math.floor(Math.random() * this.queue.length);
      this.playIndex(n);
      return;
    }
    if (this.index + 1 < this.queue.length) {
      this.playIndex(this.index + 1);
    } else if (this.repeat === "all" || !auto) {
      this.playIndex(0);
    } else {
      this.#stopAtEnd();
    }
  }

  prev() {
    if (!this.queue.length) return;
    if (this.currentTimeMs > 3500) {
      this.seek(0);
      return;
    }
    this.playIndex(this.index - 1);
  }

  #onEnded() {
    const finished = this.track;
    const plan = this.#planNext();
    const planTrack = plan == null ? null : this.queue[plan];
    const canGapless =
      plan != null &&
      planTrack != null &&
      this.preloadIndex === plan &&
      this.preloadId === planTrack.id &&
      this.#standbyReady();
    this.emit("ended", { track: finished, gapless: canGapless });
    if (canGapless) {
      this.#swap(plan);
      return;
    }
    this.next(true);
  }

  /** Swap the preloaded standby element in as the new active element. */
  async #swap(plan) {
    const outgoing = this.audio;
    const incoming = this.standby;
    const nextTrack = this.queue[plan];
    const fromIndex = this.index;
    const fromTrack = this.track;
    this.swapping = true;
    window.clearTimeout(this.earlyPreloadTimer);
    this.preloadIndex = -1;
    this.preloadId = null;
    this.pendingSeekMs = 0;
    this.active = 1 - this.active;
    this.index = plan;
    this.track = nextTrack;

    const startedAt = performance.now();
    try {
      incoming.currentTime = 0;
      await incoming.play();
    } catch {
      // Autoplay refused or the buffer died. Put the pointers back and take the
      // slow path so the listener still gets the next song.
      this.active = 1 - this.active;
      this.index = fromIndex;
      this.track = fromTrack;
      this.swapping = false;
      this.playIndex(plan);
      return;
    }
    this.lastGapMs = performance.now() - startedAt;

    // The outgoing element is done; release its buffer so the next preload can
    // reuse the slot without holding two decoded tracks.
    try {
      outgoing.pause();
      outgoing.removeAttribute("src");
      outgoing.load();
    } catch {
      /* ignore */
    }
    this.swapping = false;
    this.emit("track", { track: nextTrack, index: plan, queue: this.queue });
    this.emit("duration", this.durationMs);
    this.emit("time", 0);
    this.emit("gapless", { gapMs: this.lastGapMs, track: nextTrack });
    this.#scheduleEarlyPreload();
  }

  #stopAtEnd() {
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    if (this.playing) {
      this.playing = false;
      this.emit("state", { playing: false });
    }
  }

  /** Index that should follow the current track, respecting repeat/shuffle. */
  #planNext() {
    if (!this.queue.length || this.index < 0 || this.index >= this.queue.length) return null;
    if (this.repeat === "one") return this.index;
    if (!this.shuffle) {
      if (this.index + 1 < this.queue.length) return this.index + 1;
      return this.repeat === "all" ? 0 : null;
    }
    // A shuffle pick is frozen for the current track so the preload and the
    // actual switch always agree on the same song.
    if (this.shuffleFrom !== this.index || this.shuffleNext == null) {
      let n = this.index;
      while (this.queue.length > 1 && n === this.index) n = Math.floor(Math.random() * this.queue.length);
      this.shuffleFrom = this.index;
      this.shuffleNext = n;
    }
    return this.shuffleNext;
  }

  #resetPlan() {
    this.shuffleFrom = null;
    this.shuffleNext = null;
  }

  /** Re-evaluate the preload after a queue edit (insert / drag / remove). */
  #afterQueueEdit() {
    this.#resetPlan();
    const plan = this.#planNext();
    const track = plan == null ? null : this.queue[plan];
    if (!track) {
      this.#dropPreload();
      return;
    }
    if (this.preloadIndex === plan && this.preloadId === track.id) return;
    this.#dropPreload();
    if (this.playing) this.prepareNext();
  }

  #maybePreload() {
    if (!this.playing || this.swapping) return;
    const duration = this.durationMs;
    if (!duration) return;
    if (duration - this.currentTimeMs > this.preloadLeadMs) return;
    this.prepareNext();
  }

  #scheduleEarlyPreload() {
    window.clearTimeout(this.earlyPreloadTimer);
    this.earlyPreloadTimer = window.setTimeout(() => {
      if (!this.playing || this.swapping) return;
      const plan = this.#planNext();
      if (plan == null) return;
      const track = this.queue[plan];
      // Online tracks stream from QQ; warming one of those can steal bandwidth
      // from the song that is playing, so only do it right before the switch.
      if (track?.provider && track.provider !== "local") return;
      this.prepareNext();
    }, 1200);
  }

  #standbyReady() {
    const el = this.standby;
    return Boolean(el.src) && el.readyState >= 2 && !el.error;
  }

  #dropPreload() {
    if (this.preloadIndex < 0 && !this.preloadId) return;
    this.preloadIndex = -1;
    this.preloadId = null;
    const el = this.standby;
    if (!el.paused) return;
    try {
      el.removeAttribute("src");
      el.load();
    } catch {
      /* ignore */
    }
  }

  #normalize(i) {
    const len = this.queue.length;
    return ((i % len) + len) % len;
  }

  seek(ms) {
    if (!this.track) return;
    const target = Math.min(Math.max(ms, 0), Math.max(this.durationMs - 250, 0));
    try {
      this.audio.currentTime = target / 1000;
    } catch {
      /* ignore */
    }
    this.emit("time", this.currentTimeMs);
  }

  setVolume(value) {
    const v = Math.min(Math.max(value, 0), 1);
    for (const el of this.elements) {
      el.volume = v;
      el.muted = v === 0;
    }
  }

  toggleMute() {
    const muted = !this.audio.muted;
    for (const el of this.elements) el.muted = muted;
    return muted;
  }

  cycleRepeat() {
    this.repeat = this.repeat === "all" ? "one" : this.repeat === "one" ? "off" : "all";
    return this.repeat;
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.#resetPlan();
    if (this.playing) this.prepareNext();
    return this.shuffle;
  }
}
