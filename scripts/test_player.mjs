/**
 * Logic tests for the dual-audio gapless player. No browser needed: the two
 * media elements are fakes with the handful of properties/methods the player
 * touches, so we can drive `ended`, preload readiness and the fallback path by
 * hand.
 *
 * Run: node scripts/test_player.mjs
 */
import assert from "node:assert/strict";
import { Player } from "../web/js/player.js";

globalThis.window = globalThis;

class FakeAudio extends EventTarget {
  constructor(name) {
    super();
    this.name = name;
    this.src = "";
    this.preload = "metadata";
    this.currentTime = 0;
    this.duration = 0;
    this.paused = true;
    this.readyState = 0;
    this.volume = 1;
    this.muted = false;
    this.error = null;
    this.playCalls = 0;
    this.loadCalls = 0;
    this.removed = 0;
  }
  set src(value) {
    this._src = value;
  }
  get src() {
    return this._src || "";
  }
  load() {
    this.loadCalls += 1;
    if (!this.src) {
      this.readyState = 0;
      return;
    }
    this.duration = 180;
    this.readyState = 4;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
  play() {
    if (!this.src) return Promise.reject(new Error("no src"));
    this.playCalls += 1;
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  removeAttribute(name) {
    if (name === "src") {
      this.removed += 1;
      this._src = "";
      this.readyState = 0;
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const nearEnd = (player, remaining = 1200) => {
  player.audio.currentTime = (player.durationMs - remaining) / 1000;
  player.audio.dispatchEvent(new Event("timeupdate"));
};

const tracks = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  title: `T${i + 1}`,
  duration_ms: 180000,
  provider: "local",
}));

const a = new FakeAudio("A");
const b = new FakeAudio("B");
const player = new Player(a, b);
const log = [];
for (const type of ["track", "state", "ended", "gapless", "error"]) {
  player.addEventListener(type, (e) => log.push([type, e.detail]));
}

assert.equal(player.audio, a);
assert.equal(player.standby, b);

// ---------------------------------------------------------------- prepare
player.setQueue(tracks, 0);
player.prepare(0);
assert.equal(a.src, "/api/stream/1");
assert.equal(b.src, "");
assert.equal(player.track.id, 1);

// ---------------------------------------------------------------- playing
await player.toggle();
assert.equal(player.playing, true);
assert.equal(a.playCalls, 1);
assert.equal(log.filter(([t]) => t === "state").at(-1)[1].playing, true);

// near the end, the next track is buffered on the standby element
nearEnd(player);
assert.equal(player.preloadIndex, 1, "preload plan is the next index");
assert.equal(player.preloadId, 2, "preload plan targets track 2");
assert.equal(b.src, "/api/stream/2");
assert.equal(b.preload, "auto");
assert.equal(b.readyState, 4);

// ---------------------------------------------------------- gapless swap
const eventsBefore = log.length;
a.dispatchEvent(new Event("ended"));
await flush();

assert.equal(player.active, 1, "the standby element became active");
assert.equal(player.audio, b);
assert.equal(player.track.id, 2);
assert.equal(b.playCalls, 1, "preloaded buffer was started");
assert.equal(a.src, "", "outgoing buffer released");
assert.equal(a.removed, 1);
assert.equal(typeof player.lastGapMs, "number");
const swapEvents = log.slice(eventsBefore).map(([t]) => t);
assert.equal(swapEvents[0], "ended", "the ending track is reported first");
assert.ok(swapEvents.includes("track"), "the new track is announced");
assert.ok(swapEvents.indexOf("track") <= 2, "the new track follows the swap immediately");
assert.equal(log[eventsBefore][1].gapless, true);
assert.ok(log.some(([t]) => t === "gapless"), "gapless event emitted");
assert.equal(player.playing, true);
assert.equal(player.currentTimeMs, 0);

// ------------------------------------------------- queue edit re-plans
player.insertNext(tracks[4]);
await flush();
assert.equal(player.queue[2].id, 5);
assert.equal(player.preloadIndex, 2);
assert.equal(player.preloadId, 5);
assert.equal(a.src, "/api/stream/5", "preload moved to the inserted track");

// ------------------------------------------------------------ repeat one
player.repeat = "one";
player.prepareNext();
assert.equal(player.preloadId, 2, "repeat-one preloads the same track");
nearEnd(player);
b.dispatchEvent(new Event("ended"));
await flush();
assert.equal(player.index, 1, "index stays on the repeated track");
assert.equal(player.track.id, 2);
assert.equal(player.active, 0, "swapped back to the other element");
assert.equal(a.playCalls >= 1, true);
player.repeat = "all";

// ------------------------------------------------------------- fallback
player.preloadLeadMs = 0;
player.preloadIndex = -1;
player.preloadId = null;
player.standby.removeAttribute("src");
player.standby.load();
const gaplessCount = log.filter(([t]) => t === "gapless").length;
const activeBefore = player.active;
const swapsBefore = player.audio.playCalls;
player.audio.dispatchEvent(new Event("ended"));
await flush();
assert.equal(player.active, activeBefore, "fallback keeps the same element");
assert.equal(player.track.id, 5, "fallback advanced to the inserted track");
assert.equal(player.audio.src, "/api/stream/5");
assert.equal(player.audio.playCalls, swapsBefore + 1);
assert.equal(
  log.filter(([t]) => t === "gapless").length,
  gaplessCount,
  "no gapless event when the preload was missing"
);

// ------------------------------------------------------------- volume
player.setVolume(0.5);
assert.equal(a.volume, 0.5);
assert.equal(b.volume, 0.5);
player.setVolume(0);
assert.equal(a.muted, true);
assert.equal(b.muted, true);
player.setVolume(0.8);
assert.equal(a.muted, false);
assert.equal(b.muted, false);

// ------------------------------------------------------------ shuffle
player.shuffle = true;
player.prepareNext();
const firstPick = player.preloadIndex;
player.prepareNext();
assert.equal(player.preloadIndex, firstPick, "shuffle pick is frozen until the track changes");
player.shuffle = false;

// --------------------------------------------------------- stop at end
player.repeat = "off";
player.index = player.queue.length - 1;
player.track = player.queue[player.index];
player.preloadIndex = -1;
player.preloadId = null;
player.standby.removeAttribute("src");
const playedBefore = player.audio.playCalls;
player.audio.dispatchEvent(new Event("ended"));
await flush();
assert.equal(player.track.id, 4, "stays on the last track");
assert.equal(player.audio.playCalls, playedBefore, "nothing else is started");
assert.equal(player.playing, false);

clearTimeout(player.earlyPreloadTimer);
console.log("player tests: all assertions passed");
process.exit(0);
