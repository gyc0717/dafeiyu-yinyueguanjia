"""Create a categorized snapshot of the music-hub project on D:.

Run:  .venv\\Scripts\\python.exe scripts\\archive_all.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent
STAMP = datetime.now().strftime("%Y-%m-%d")
NAME = f"大肥鱼音乐管家-归档-{STAMP}"
STAGING = WORKSPACE / "_archive_staging"
DEST = STAGING / NAME
if DEST.exists():
    NAME = f"大肥鱼音乐管家-归档-{STAMP}-{datetime.now():%H%M%S}"
    DEST = STAGING / NAME
FINAL = Path(rf"D:\{NAME}")

DIRS = {
    "program": DEST / "01_程序",
    "db": DEST / "02_数据库",
    "music": DEST / "03_音乐库",
    "config": DEST / "04_配置",
    "shots": DEST / "05_截图",
    "docs": DEST / "06_文档",
    "wheels": DEST / "07_离线依赖",
    "env": DEST / "08_运行环境",
}

IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")


def human(size: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def copytree(src: Path, dst: Path) -> None:
    if src.is_dir():
        shutil.copytree(src, dst, ignore=IGNORE, dirs_exist_ok=True)


def copy_file(src: Path, dst: Path) -> bool:
    if not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    print("archive ->", DEST)
    for path in DIRS.values():
        path.mkdir(parents=True, exist_ok=True)

    # 01 - runnable application code
    for name in ("server", "web", "scripts"):
        copytree(ROOT / name, DIRS["program"] / name)
    for name in ("start.ps1", "requirements.txt", ".gitignore"):
        copy_file(ROOT / name, DIRS["program"] / name)

    # 02 - consistent SQLite snapshot (WAL-safe)
    db_src = sqlite3.connect(ROOT / "data" / "music_hub.db", timeout=15)
    db_dst = sqlite3.connect(DIRS["db"] / "music_hub.db")
    try:
        db_src.backup(db_dst)
    finally:
        db_dst.close()
        db_src.close()

    # 04 - runtime config
    for name in ("config.json", "roadmap.json"):
        copy_file(ROOT / "data" / name, DIRS["config"] / name)

    # 03 - music: demo album, cover cache, and every local track from the DB
    copytree(ROOT / "data" / "demo-music", DIRS["music"] / "演示曲")
    copytree(ROOT / "data" / "covers", DIRS["music"] / "封面缓存")

    config = json.loads((ROOT / "data" / "config.json").read_text(encoding="utf-8"))
    roots = [Path(p).resolve() for p in config.get("library_roots", [])]
    demo_root = (ROOT / "data" / "demo-music").resolve()
    home_music = (Path.home() / "Music").resolve()

    conn = sqlite3.connect(ROOT / "data" / "music_hub.db", timeout=15)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id,title,artist,album,duration_ms,path FROM tracks WHERE provider='local' ORDER BY id"
    ).fetchall()
    conn.close()

    catalog = []
    copied_audio = 0
    copied_lrc = 0
    missing = []
    for row in rows:
        source = Path(row["path"])
        if not source.is_file():
            missing.append(str(source))
            continue
        resolved = source.resolve()
        if resolved == demo_root or demo_root in resolved.parents:
            continue

        owner = None
        for root in roots:
            if root == demo_root:
                continue
            if resolved == root or root in resolved.parents:
                owner = root
                break
        if owner is None:
            group = "其他"
            relative = Path(source.name)
        else:
            if owner == home_music:
                group = "用户音乐"
            elif "xwechat_files" in str(owner).lower():
                group = "微信音频"
            else:
                group = owner.name or "其他"
            relative = resolved.relative_to(owner)

        target_dir = DIRS["music"] / "本地曲库" / group / relative.parent
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / source.name
        shutil.copy2(source, target)
        copied_audio += 1

        lrc = source.with_suffix(".lrc")
        archived_lrc = ""
        if lrc.is_file():
            lrc_target = target.with_suffix(".lrc")
            shutil.copy2(lrc, lrc_target)
            archived_lrc = str(lrc_target.relative_to(DEST))
            copied_lrc += 1

        catalog.append(
            {
                "id": row["id"],
                "title": row["title"],
                "artist": row["artist"],
                "album": row["album"],
                "duration_ms": row["duration_ms"],
                "original_path": str(source),
                "archive_path": str(target.relative_to(DEST)),
                "lrc_path": archived_lrc,
                "size_bytes": source.stat().st_size,
            }
        )

    catalog_path = DIRS["music"] / "本地曲库" / "曲库清单.csv"
    with catalog_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "title",
                "artist",
                "album",
                "duration_ms",
                "original_path",
                "archive_path",
                "lrc_path",
                "size_bytes",
            ],
        )
        writer.writeheader()
        writer.writerows(catalog)

    # 05 - screenshots
    shot_dir = ROOT / "_shots"
    shots = sorted(shot_dir.glob("*.png")) if shot_dir.is_dir() else []
    for shot in shots:
        copy_file(shot, DIRS["shots"] / shot.name)

    # 06 - docs and handoffs
    copy_file(ROOT / "README.md", DIRS["docs"] / "README.md")
    for name in ("HANDOFF.md", "HANDOFF-里程碑1.md", "HANDOFF-里程碑2.md"):
        copy_file(WORKSPACE / name, DIRS["docs"] / name)
    reference = DIRS["docs"] / "参考"
    for name in ("SETUP-QQMUSIC.md", "MANUAL.md"):
        copy_file(WORKSPACE / name, reference / name)

    # 07 - offline wheels
    copytree(ROOT / "wheels", DIRS["wheels"] / "wheels")

    # 08 - copied venv (convenience, not guaranteed portable)
    venv_src = ROOT / ".venv"
    venv_dst = DIRS["env"] / "venv"
    if venv_src.is_dir():
        result = subprocess.run(
            [
                r"C:\Windows\System32\Robocopy.exe",
                str(venv_src),
                str(venv_dst),
                "/E",
                "/NFL",
                "/NDL",
                "/NJH",
                "/NJS",
                "/NC",
                "/NS",
                "/R:1",
                "/W:1",
            ],
            capture_output=True,
            text=True,
            errors="replace",
        )
        print("venv robocopy exit:", result.returncode)
    (DIRS["env"] / "环境说明.md").write_text(
        "\n".join(
            [
                "# 运行环境说明",
                "",
                "本目录的 `venv` 是从工作目录直接复制的，方便对照；移动路径后**不保证**能直接运行。",
                "推荐重建：",
                "",
                "```powershell",
                "python -m venv .venv",
                r".\.venv\Scripts\python.exe -m pip install --no-index --find-links ..\07_离线依赖\wheels -r ..\01_程序\requirements.txt",
                "```",
                "",
                "Python 版本：3.12.10（Windows x64）。",
            ]
        ),
        encoding="utf-8",
    )

    # summary
    stats = {}
    for key, path in DIRS.items():
        files = [p for p in path.rglob("*") if p.is_file()]
        stats[key] = (len(files), sum(p.stat().st_size for p in files))

    db_check = sqlite3.connect(DIRS["db"] / "music_hub.db")
    track_count = db_check.execute("SELECT COUNT(*) FROM tracks WHERE provider='local'").fetchone()[0]
    event_count = db_check.execute("SELECT COUNT(*) FROM play_events").fetchone()[0]
    online_count = db_check.execute("SELECT COUNT(*) FROM tracks WHERE provider!='local'").fetchone()[0]
    db_check.close()

    total_files = sum(v[0] for v in stats.values())
    total_size = sum(v[1] for v in stats.values())
    summary = f"""# 大肥鱼音乐管家 · 全量归档

- 创建时间：{datetime.now():%Y-%m-%d %H:%M:%S}
- 来源：`{ROOT}`
- 归档目录：`{FINAL}`
- 总文件：{total_files} 个，{human(total_size)}

## 分类

| 目录 | 文件数 | 大小 | 内容 |
|---|---:|---:|---|
| 01_程序 | {stats['program'][0]} | {human(stats['program'][1])} | server / web / scripts / start.ps1 / requirements.txt |
| 02_数据库 | {stats['db'][0]} | {human(stats['db'][1])} | music_hub.db（SQLite WAL 安全快照） |
| 03_音乐库 | {stats['music'][0]} | {human(stats['music'][1])} | 演示曲、封面缓存、本地曲目副本、曲库清单 |
| 04_配置 | {stats['config'][0]} | {human(stats['config'][1])} | config.json、roadmap.json |
| 05_截图 | {stats['shots'][0]} | {human(stats['shots'][1])} | 里程碑验收截图 |
| 06_文档 | {stats['docs'][0]} | {human(stats['docs'][1])} | README、HANDOFF、参考手册 |
| 07_离线依赖 | {stats['wheels'][0]} | {human(stats['wheels'][1])} | pip 离线 wheels |
| 08_运行环境 | {stats['env'][0]} | {human(stats['env'][1])} | 复制的 venv + 环境说明 |

## 数据概况

- 本地曲目：{track_count} 首
- 在线缓存：{online_count} 首
- 播放记录：{event_count} 条
- 实际复制音频：{copied_audio} 个，歌词：{copied_lrc} 个
- 缺失源文件：{len(missing)} 个
- 截图：{len(shots)} 张

## 使用

1. 看 `06_文档/README.md` 启动说明。
2. 依赖优先用 `07_离线依赖/wheels` 离线安装。
3. 曲库原路径与实际归档路径的对应关系见 `03_音乐库/本地曲库/曲库清单.csv`。

## 说明

- 微信原始目录里未被曲库引用的附件没有复制，只复制了 `tracks` 表中实际登记的音频。
- 未复制 `.edge-*` 临时浏览器 profile、`__pycache__`、`.pyc`。
- `08_运行环境/venv` 是复制件，移动后不保证可用；建议按环境说明重建。
"""
    (DEST / "00_归档说明.md").write_text(summary, encoding="utf-8")

    # manifest of every archived file
    manifest_path = DEST / "MANIFEST.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["relative_path", "size_bytes", "sha256"])
        for path in sorted(DEST.rglob("*")):
            if not path.is_file() or path == manifest_path:
                continue
            writer.writerow([str(path.relative_to(DEST)), path.stat().st_size, sha256(path)])

    print(f"done: {total_files} files, {human(total_size)}, tracks={track_count}, audio={copied_audio}")
    print("staging:", DEST)
    print("final:  ", FINAL)
    print("summary:", DEST / "00_归档说明.md")


if __name__ == "__main__":
    main()
