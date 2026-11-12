"""星海视觉参考研究（只出对比图，不进产品）。

参考：Sketchfab「Milky way galaxy（升级版）」by ADITYA 3D
https://sketchfab.com/3d-models/milky-way-galaxy-871966431db148eab43ce24115cbf14b
  - 四条清晰旋臂、核心亮度平滑、密度自然衰减、16 万顶点点云（CC-BY 4.0）

思路：借它的「背景」——点云银河；产品里的 46 首歌仍然是前景的星，
不把歌排成旋臂。产出 _shots/138-galaxy-ref-study.png（左=现在，右=参考）。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

W, H = 700, 620
SS = 2
w, h = W * SS, H * SS

rng = np.random.default_rng(20261112)


def make_grid():
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    rx, ry = w * 0.46, h * 0.43
    return (xx - cx) / rx, (yy - cy) / ry, cx, cy, rx, ry


def galaxy_points(n: int = 60000):
    """四条对数旋臂 + 指数径向密度衰减。"""
    r = 0.015 + (rng.random(n) ** 2.1) * 1.0
    arm = rng.integers(0, 4, n)
    theta = arm * (np.pi / 2) + np.log(r / 0.03 + 1) * 2.15
    # 旋臂法向抖动：越靠外越松散
    sigma = 0.018 + 0.085 * r
    off = rng.normal(0, 1, n) * sigma
    x = np.cos(theta) * r - np.sin(theta) * off
    y = (np.sin(theta) * r + np.cos(theta) * off) * 0.78
    return x, y, r


def splat(x, y, r, colors) -> np.ndarray:
    buf = np.zeros((h, w, 3), np.float32)
    px = np.clip((cx + x * rx).astype(int), 0, w - 1)
    py = np.clip((cy + y * ry).astype(int), 0, h - 1)
    np.add.at(buf, (py, px), colors)
    return buf


def blur_rgb(arr: np.ndarray, radius: float) -> np.ndarray:
    out = np.empty_like(arr)
    for c in range(3):
        ch = Image.fromarray(np.clip(arr[..., c], 0, 255).astype(np.uint8))
        ch = ch.filter(ImageFilter.GaussianBlur(radius))
        out[..., c] = np.asarray(ch, dtype=np.float32)
    return out


def to_image(buf: np.ndarray, exposure: float = 1.0) -> Image.Image:
    """软饱和色调映射 + gamma，避免核心糊成一坨死白。"""
    img = 1.0 - np.exp(-buf * exposure)
    img = np.clip(img, 0, 1) ** (1 / 2.2)
    return Image.fromarray((img * 255).astype(np.uint8))


def vignette(img: Image.Image) -> Image.Image:
    x = np.linspace(-1, 1, img.width)[None, :]
    y = np.linspace(-1, 1, img.height)[:, None]
    d = np.sqrt(x**2 + y**2)
    mask = np.clip(1.25 - 0.55 * d**1.7, 0, 1)[..., None]
    arr = np.asarray(img, np.float32) * mask
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


X, Y, cx, cy, rx, ry = make_grid()
R = np.sqrt(X**2 + Y**2)


def render_now() -> Image.Image:
    """现在：平台分扇区、随机撒点，几乎没有背景。"""
    buf = np.zeros((h, w, 3), np.float32)
    # 很淡的尘埃
    dx = rng.uniform(-1.2, 1.2, 900)
    dy = rng.uniform(-1.2, 1.2, 900)
    buf += splat(dx, dy, None, np.full((900, 3), 7.0, np.float32))
    buf = blur_rgb(buf, 2 * SS)
    return vignette(draw_songs(to_image(buf, 1.0)))


def render_ref(with_songs: bool = True) -> Image.Image:
    x, y, r = galaxy_points(90000)
    t = np.clip(r, 0, 1)[:, None]
    core_c = np.array([1.0, 0.80, 0.52], np.float32)
    arm_c = np.array([0.62, 0.73, 1.0], np.float32)
    colors = (core_c * (1 - t) + arm_c * t) * (0.55 + 0.45 * (1 - t))
    buf = splat(x, y, r, colors * 0.85)

    # 核球：解析高斯，平滑不发硬（参考里核心只是「更亮」，不是白饼）
    bulge = np.exp(-((R / 0.075) ** 2)) * 0.38 + np.exp(-((R / 0.19) ** 2)) * 0.16
    buf += bulge[..., None] * np.array([1.0, 0.82, 0.56], np.float32)

    # 两条暗尘带（旋臂之间），让结构更像银河
    dust = np.exp(-(((R - 0.42) / 0.16) ** 2)) * 0.35
    buf *= (1 - dust[..., None] * np.array([0.5, 0.45, 0.4], np.float32))

    base = to_image(buf, 1.25)

    # bloom：细亮 + 大范围柔光
    arr = np.asarray(base, np.float32)
    bloom_small = blur_rgb(arr, 3 * SS)
    bloom_big = blur_rgb(arr, 14 * SS)
    arr = arr * 0.78 + bloom_small * 0.30 + bloom_big * 0.22
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    if with_songs:
        out = draw_songs(out)
    return vignette(out)


def draw_songs(img: Image.Image) -> Image.Image:
    """46 首歌：本地暖橙、QQ 蓝，位置沿用现在的平台扇区。"""
    from PIL import ImageDraw

    img = img.copy()
    layer = Image.new("RGB", img.size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(46):
        local = i < 40
        inner = 0.18 if local else 0.62
        spread = 0.52 if local else 0.55
        angle = i * 2.399 + (0.2 if local else 2.1)
        radius = inner + ((i * 37) % 100) / 100 * spread
        px = cx + np.cos(angle) * radius * rx
        py = cy + np.sin(angle) * radius * ry
        color = (255, 186, 122) if local else (126, 184, 255)
        rr = (2.6 + (3.2 if i % 3 else 0)) * SS
        d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=color)
        if i % 7 == 0:
            d.line([px - rr * 2.8, py, px + rr * 2.8, py], fill=tuple(c // 2 for c in color), width=SS)
            d.line([px, py - rr * 2.8, px, py + rr * 2.8], fill=tuple(c // 2 for c in color), width=SS)

    glow = layer.filter(ImageFilter.GaussianBlur(9 * SS))
    tight = layer.filter(ImageFilter.GaussianBlur(1.5 * SS))
    arr = np.asarray(img, np.float32) + np.asarray(glow, np.float32) * 0.85 + np.asarray(tight, np.float32) * 0.9
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def main() -> None:
    out_dir = Path(__file__).resolve().parents[1] / "_shots"
    out_dir.mkdir(parents=True, exist_ok=True)
    left = render_now()
    right = render_ref()
    gap = 14 * SS
    canvas = Image.new("RGB", (left.width * 2 + gap, left.height), (8, 11, 16))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left.width + gap, 0))
    canvas = canvas.resize((canvas.width // SS, canvas.height // SS), Image.LANCZOS)
    target = out_dir / "138-galaxy-ref-study.png"
    canvas.save(target, "PNG")
    print("saved", target, canvas.size)


if __name__ == "__main__":
    main()
