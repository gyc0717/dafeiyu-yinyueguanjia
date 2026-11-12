/**
 * Default visualizer: a ring of soft spectrum spokes behind the cover.
 * The interface is intentionally tiny so another visualizer can replace it
 * without touching the player.
 */
export function createVisualizer(canvas, player) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const elements = (player?.audioElements || []).slice();
  const sources = new WeakSet();
  let width = 0;
  let height = 0;
  let analyser = null;
  let data = null;
  let audioCtx = null;

  const BARS = 84;
  const smooth = new Float32Array(BARS);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensure() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.86;
        analyser.connect(audioCtx.destination);
        data = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        audioCtx = null;
        analyser = null;
        return;
      }
    }
    // The player swaps between two <audio> elements; every element that ever
    // becomes active needs its own source node feeding the same analyser.
    for (const el of elements) {
      if (sources.has(el)) continue;
      try {
        const source = audioCtx.createMediaElementSource(el);
        source.connect(analyser);
        sources.add(el);
      } catch {
        /* already routed by another context */
      }
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function isPlaying() {
    if (player && typeof player.playing === "boolean") return player.playing;
    return elements.some((el) => !el.paused);
  }

  for (const el of elements) el.addEventListener("play", () => ensure());

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  function frame(t) {
    if (width < 2) resize();
    const playing = isPlaying();
    if (playing) ensure();
    ctx.clearRect(0, 0, width, height);
    if (analyser && playing) {
      analyser.getByteFrequencyData(data);
    }
    const cx = width / 2;
    const cy = height / 2;
    const size = Math.min(width, height);
    const base = size * 0.335;
    const maxLen = size * 0.13;
    const spin = t * 0.00004;

    const ring = ctx.createRadialGradient(cx, cy, base * 0.7, cx, cy, base + maxLen + 20);
    ring.addColorStop(0, "rgba(111,182,255,0)");
    ring.addColorStop(1, "rgba(111,182,255,0.05)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, base + maxLen + 20, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < BARS; i += 1) {
      let value = 0;
      if (playing && data) {
        const bin = Math.floor((i / BARS) * data.length * 0.62);
        value = data[bin] / 255;
        // a touch of its neighbours keeps the ring from looking spiky
        value = Math.max(value, (data[Math.max(bin - 1, 0)] || 0) / 255 * 0.6);
      }
      const idle = 0.055 + 0.025 * Math.sin(t / 1300 + i * 0.32);
      const target = playing ? Math.max(value, 0.03) : idle * 0.55;
      smooth[i] += (target - smooth[i]) * 0.16;

      const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2 + spin;
      const len = 5 + smooth[i] * maxLen;
      const r0 = base + 6;
      const r1 = base + 6 + len;
      const alpha = 0.16 + smooth[i] * 0.62;
      const hue = 205 + (i / BARS) * 55;
      ctx.strokeStyle = `hsla(${hue}, 90%, 72%, ${alpha})`;
      ctx.lineWidth = Math.max(1.4, size * 0.0042);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
      ctx.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    ensure,
    resize,
    get playing() {
      return isPlaying();
    },
  };
}
