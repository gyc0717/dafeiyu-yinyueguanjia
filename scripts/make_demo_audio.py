"""Generate three original demo tracks (synthesized pads/plucks) + synced LRC.

These exist so the first milestone can be demoed with real, seekable audio and
timed lyrics without shipping copyrighted material. Everything is synthesized
from sine waves here.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import lameenc
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from mutagen.id3 import APIC, ID3, TALB, TCON, TIT2, TPE1

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "data" / "demo-music"
OUT.mkdir(parents=True, exist_ok=True)

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
MINOR7 = [0, 3, 7, 10]
MAJ7 = [0, 4, 7, 11]
MAJOR = [0, 4, 7]
SIX = [0, 4, 7, 9]
MINOR = [0, 3, 7]


def midi(name: str) -> int:
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def env(n: int, attack: float, release: float, curve: float = 1.4) -> np.ndarray:
    e = np.ones(n, dtype=np.float64)
    a = min(int(attack * SR), n)
    r = min(int(release * SR), n)
    if a > 2:
        e[:a] = np.linspace(0, 1, a) ** curve
    if r > 2:
        e[-r:] *= np.linspace(1, 0, r) ** 1.2
    return e


def add(buf: np.ndarray, sig: np.ndarray, start: float, gain: float = 1.0) -> None:
    i = int(start * SR)
    if i >= len(buf) or i < 0:
        return
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i : i + n] += sig[:n] * gain


def pad(freqs, dur: float, amp: float = 0.09):
    n = int(dur * SR)
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)
    for f in freqs:
        for det, g in ((-0.16, 0.8), (0.0, 1.0), (0.16, 0.8)):
            ph = random.random() * math.tau
            left += np.sin(math.tau * (f + det) * t + ph) * g
            right += np.sin(math.tau * (f - det) * t + ph + 0.7) * g
    scale = amp / max(len(freqs) * 3.0, 1.0)
    e = env(n, dur * 0.38, dur * 0.5, 1.6)
    return left * e * scale, right * e * scale


def pluck(freq: float, dur: float = 1.5, amp: float = 0.075) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = (
        np.sin(math.tau * freq * t)
        + 0.32 * np.sin(math.tau * freq * 2 * t)
        + 0.12 * np.sin(math.tau * freq * 3 * t)
    )
    sig *= np.exp(-t * 3.4)
    sig *= np.minimum(t / 0.006, 1.0)
    return sig * amp


def bass_note(freq: float, dur: float, amp: float = 0.14) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.sin(math.tau * freq * t) + 0.28 * np.sin(math.tau * freq * 2 * t)
    sig *= np.exp(-t * 1.1)
    sig *= env(n, 0.012, 0.25, 1.0)
    return sig * amp


def kick(amp: float = 0.22) -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 55 * np.exp(-t * 9) + 40
    phase = math.tau * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t * 6.5) * amp


def hat(amp: float = 0.028) -> np.ndarray:
    n = int(0.09 * SR)
    noise = np.random.normal(0, 1, n)
    noise = np.diff(noise, prepend=0.0)
    return noise * np.exp(-np.arange(n) / SR * 55) * amp


def lead_note(freq: float, dur: float, amp: float = 0.1) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    vib = 1.0 + 0.005 * np.sin(math.tau * 4.8 * t) * np.minimum(t / 0.6, 1.0)
    sig = (
        np.sin(math.tau * freq * vib * t)
        + 0.24 * np.sin(math.tau * freq * 2 * vib * t)
        + 0.08 * np.sin(math.tau * freq * 3 * vib * t)
    )
    sig *= env(n, 0.12, min(0.8, dur * 0.5), 1.2)
    return sig * amp


def reverb_stereo(left, right, wet=0.26):
    out_l = left.copy()
    out_r = right.copy()
    taps = ((0.093, 0.24), (0.151, 0.16), (0.223, 0.11), (0.317, 0.07), (0.431, 0.045))
    for delay, gain in taps:
        n = int(delay * SR)
        out_l[n:] += right[:-n] * gain * wet
        out_r[n:] += left[:-n] * gain * wet
    return out_l, out_r


def build_track(bpm, chords, lead_notes, duration, seed, energy=1.0):
    random.seed(seed)
    np.random.seed(seed)
    n = int(duration * SR)
    music_l = np.zeros(n)
    music_r = np.zeros(n)
    perc_l = np.zeros(n)
    perc_r = np.zeros(n)
    beat = 60.0 / bpm
    bar = beat * 4
    chord_len = bar * 2

    t = 0.0
    chord_i = 0
    while t < duration - 4:
        root, intervals = chords[chord_i % len(chords)]
        tones = [root + i for i in intervals]
        pad_freqs = [hz(m + 12) for m in tones] + [hz(root)]
        pl, pr = pad(pad_freqs, chord_len * 1.06, amp=0.085)
        add(music_l, pl, t)
        add(music_r, pr, t)

        # bass: root on beats 1 and 3, fifth-ish pickup on 4
        add(music_l, bass_note(hz(root - 12), beat * 1.8), t)
        add(music_r, bass_note(hz(root - 12), beat * 1.8), t)
        add(music_l, bass_note(hz(root - 12), beat * 1.6), t + beat * 2)
        add(music_r, bass_note(hz(root - 12), beat * 1.6), t + beat * 2)

        # arpeggio, eighth notes
        pattern = [0, 2, 1, 3, 2, 1, 3, 0]
        for step in range(16):
            if step % 2 and step % 4 == 3:
                continue
            tone = tones[pattern[step % len(pattern)] % len(tones)] + 24
            note = pluck(hz(tone), dur=1.35, amp=0.055 * energy)
            pan = 0.55 + 0.4 * (step % 2)
            add(music_l, note, t + step * beat / 2, gain=1.0 - pan * 0.35)
            add(music_r, note, t + step * beat / 2 + 0.006, gain=pan * 0.75)

        # kick / hat
        for step in range(8):
            at = t + step * beat / 2
            if step % 4 == 0:
                add(perc_l, kick(0.19 * energy), at)
                add(perc_r, kick(0.19 * energy), at)
            if step % 2 == 1:
                h = hat(0.03 * energy)
                add(perc_l, h, at, gain=0.8)
                add(perc_r, h, at + 0.004, gain=0.8)

        # sparse lead melody every two bars
        if chord_i % 2 == 0 and t > 8:
            for offset, note_index, length in random.choice(
                [
                    [(0.0, 0, 1.6), (bar * 0.75, 2, 2.2)],
                    [(0.0, 1, 2.4), (bar * 1.1, 0, 1.8)],
                    [(bar * 0.25, 2, 1.4), (bar * 0.95, 3, 2.4)],
                ]
            ):
                tone = tones[note_index % len(tones)] + 24
                melody = lead_note(hz(tone), length, amp=0.075 * energy)
                add(music_l, melody, t + offset, gain=0.9)
                add(music_r, melody, t + offset + 0.01, gain=0.9)

        t += chord_len
        chord_i += 1

    # air / vinyl bed
    noise = np.random.normal(0, 1, n) * 0.0035
    noise = np.convolve(noise, np.ones(6) / 6, mode="same")
    music_l += noise
    music_r += noise * 0.92

    music_l, music_r = reverb_stereo(music_l, music_r, wet=0.3)
    left = music_l + perc_l
    right = music_r + perc_r

    # fades + soft clip
    fade_in = int(2.2 * SR)
    fade_out = int(7.0 * SR)
    left[:fade_in] *= np.linspace(0, 1, fade_in)
    right[:fade_in] *= np.linspace(0, 1, fade_in)
    left[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.2
    right[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.2

    peak = max(np.abs(left).max(), np.abs(right).max(), 1e-9)
    gain = 0.92 / peak
    left = np.tanh(left * gain * 1.1) * 0.92
    right = np.tanh(right * gain * 1.1) * 0.92
    return left, right


def write_mp3(path: Path, left, right, title, artist, album, cover_bytes, genre="Ambient Pop"):
    pcm = np.stack([left, right], axis=1)
    pcm = np.clip(pcm * 32767.0, -32768, 32767).astype("<i2").tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(192)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    path.write_bytes(data)

    tags = ID3()
    tags.add(TIT2(encoding=3, text=title))
    tags.add(TPE1(encoding=3, text=artist))
    tags.add(TALB(encoding=3, text=album))
    tags.add(TCON(encoding=3, text=genre))
    tags.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="cover", data=cover_bytes))
    tags.save(path)


def make_cover(path: Path, title: str, c1, c2, accent, seed):
    rng = np.random.default_rng(seed)
    w = h = 900
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * 0.5, h * 0.44

    # vertical base + a warm/cool glow in the upper-left
    t = (ys / h)[..., None]
    base = np.array(c2, dtype=np.float32) * (1 - t) + np.array(c1, dtype=np.float32) * t
    glow = np.exp(-(((xs - w * 0.27) ** 2) + ((ys - h * 0.2) ** 2)) / (2 * (w * 0.34) ** 2))[..., None]
    base = base + glow * np.array(accent, dtype=np.float32) * 0.55

    # soft colour wash bottom right
    wash = np.exp(-(((xs - w * 0.82) ** 2) + ((ys - h * 0.78) ** 2)) / (2 * (w * 0.3) ** 2))[..., None]
    base = base + wash * np.array(accent, dtype=np.float32) * 0.16

    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / (w * 0.78)
    base *= (1.0 - 0.42 * np.clip(dist, 0, 1) ** 1.6)[..., None]
    base += rng.normal(0, 3.2, (h, w, 1))
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    img = img.filter(ImageFilter.GaussianBlur(0.5))

    draw = ImageDraw.Draw(img, "RGBA")

    # record-like disc, cropped by the frame
    dcx, dcy, r = w * 0.79, h * 0.33, w * 0.33
    draw.ellipse([dcx - r, dcy - r, dcx + r, dcy + r], fill=(*accent, 16))
    for i in range(10):
        rr = r * (0.52 + i * 0.052)
        draw.ellipse(
            [dcx - rr, dcy - rr, dcx + rr, dcy + rr],
            outline=(255, 255, 255, 14 if i % 2 else 22),
            width=1,
        )
    draw.ellipse([dcx - r, dcy - r, dcx + r, dcy + r], outline=(*accent, 95), width=2)
    draw.ellipse([dcx - r * 0.075, dcy - r * 0.075, dcx + r * 0.075, dcy + r * 0.075], fill=(*accent, 150))
    draw.ellipse([dcx - r * 0.025, dcy - r * 0.025, dcx + r * 0.025, dcy + r * 0.025], fill=(8, 12, 20, 220))

    # fine rules + a vertical accent bar
    for i in range(4):
        yy = h * 0.60 + i * 13
        draw.line([(64, yy), (300 - i * 42, yy)], fill=(255, 255, 255, 26), width=1)
    draw.rectangle([64, h * 0.665, 68, h * 0.80], fill=(*accent, 210))

    try:
        f_title = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 76, index=0)
        f_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 25, index=0)
    except OSError:
        f_title = ImageFont.load_default()
        f_small = ImageFont.load_default()
    draw.text((92, h * 0.735), title, font=f_title, fill=(245, 250, 255, 245))
    draw.text((94, h * 0.688), "大肥鱼 · 深海电台", font=f_small, fill=(233, 241, 255, 150))
    draw.text((94, h * 0.905), "MUSIC HUB  /  DEMO SESSION", font=f_small, fill=(233, 241, 255, 90))

    # slight blur haze + grain on top
    haze = img.filter(ImageFilter.GaussianBlur(18))
    img = Image.blend(img, haze, 0.08)
    arr = np.asarray(img).astype(np.float32)
    arr += rng.normal(0, 3.4, arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    img.save(path, "JPEG", quality=91, optimize=True)
    return path.read_bytes()


TRACKS = [
    {
        "stem": "大肥鱼 - 夜航",
        "title": "夜航",
        "album": "深海电台",
        "bpm": 76,
        "duration": 150,
        "seed": 11,
        "chords": [(midi("A3"), MINOR7), (midi("F3"), MAJ7), (midi("C4"), MAJ7), (midi("G3"), SIX)],
        "c1": (10, 32, 58),
        "c2": (8, 13, 26),
        "accent": (111, 182, 255),
        "lyrics": """[ti:夜航]
[ar:大肥鱼]
[al:深海电台]
[by:music-hub demo]
[00:08.00]灯把海面折成两半
[00:16.00]一半是雾 一半是岸
[00:24.00]我把耳机调到最暗
[00:32.00]让低频替我说晚安
[00:44.00]夜航的人不问终点
[00:52.00]只问风还愿不愿意借
[01:00.00]城市的岛退到身后
[01:08.00]星星在舷窗外排队
[01:20.00]如果明天还是没有答案
[01:28.00]就把今晚再听一遍
[01:40.00]夜航的人不问终点
[01:48.00]海会替我记得这一切
[02:04.00]灯把海面折成两半
[02:12.00]一半是雾 一半是岸
[02:20.00]我把耳机调到最暗
[02:28.00]让低频替我说晚安
""",
    },
    {
        "stem": "大肥鱼 - 潮汐信",
        "title": "潮汐信",
        "album": "深海电台",
        "bpm": 84,
        "duration": 148,
        "seed": 23,
        "chords": [(midi("F#3"), MINOR7), (midi("D3"), MAJ7), (midi("A3"), MAJOR), (midi("E3"), MAJOR)],
        "c1": (38, 24, 62),
        "c2": (11, 9, 22),
        "accent": (196, 132, 255),
        "lyrics": """[ti:潮汐信]
[ar:大肥鱼]
[al:深海电台]
[by:music-hub demo]
[00:07.00]我把没说完的话
[00:14.00]折成一只纸船
[00:21.00]放进涨潮的傍晚
[00:28.00]让它慢慢靠岸
[00:38.00]潮汐替我读给你听
[00:45.00]每一句都带着盐
[00:52.00]如果浪把字迹冲淡
[00:59.00]就当作我在你身边
[01:12.00]月亮把海面熨平
[01:19.00]像一封没有落款的信
[01:26.00]收件人是整个夏天
[01:33.00]寄件人写的是我们
[01:46.00]潮汐替我读给你听
[01:53.00]每一句都带着盐
[02:00.00]如果浪把字迹冲淡
[02:07.00]就当作我在你身边
""",
    },
    {
        "stem": "大肥鱼 - 蓝色房间",
        "title": "蓝色房间",
        "album": "深海电台",
        "bpm": 68,
        "duration": 132,
        "seed": 37,
        "chords": [(midi("C3"), MINOR7), (midi("G#2"), MAJ7), (midi("D#3"), MAJ7), (midi("A#2"), MAJOR)],
        "c1": (14, 26, 52),
        "c2": (7, 10, 22),
        "accent": (120, 170, 255),
        "lyrics": None,
    },
]


def main():
    covers_only = "--covers-only" in sys.argv
    for track in TRACKS:
        cover_path = OUT / f"{track['stem']}.jpg"
        cover_bytes = make_cover(
            cover_path, track["title"], track["c1"], track["c2"], track["accent"], track["seed"]
        )
        mp3_path = OUT / f"{track['stem']}.mp3"
        if covers_only and mp3_path.exists():
            tags = ID3(mp3_path)
            tags.delall("APIC")
            tags.add(APIC(encoding=3, mime="image/jpeg", type=3, desc="cover", data=cover_bytes))
            tags.save(mp3_path)
            print(f"{mp3_path.name}  cover refreshed")
            continue
        left, right = build_track(
            track["bpm"], track["chords"], [], track["duration"], track["seed"]
        )
        write_mp3(
            mp3_path,
            left,
            right,
            track["title"],
            "大肥鱼",
            track["album"],
            cover_bytes,
        )
        if track["lyrics"]:
            (OUT / f"{track['stem']}.lrc").write_text(track["lyrics"], encoding="utf-8")
        print(f"{mp3_path.name}  {mp3_path.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
