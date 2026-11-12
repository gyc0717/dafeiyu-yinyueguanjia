"""Safety test for the tidy executor: move → undo, with a real file conflict.

Runs against a throwaway sandbox plus temporary rows in the real database, then
removes every row it created. Never touches the user's music.
"""
import os
import shutil
import sys
from pathlib import Path

ROOT = r"D:\数据\deepseek-harness\default-workspace\music-hub"
sys.path.insert(0, ROOT)

sandbox = Path(ROOT) / "_tmp-tidy-test"
shutil.rmtree(sandbox, ignore_errors=True)
sandbox.mkdir(parents=True)
src = sandbox / "incoming"
dst = sandbox / "target"
src.mkdir()
dst.mkdir()

# the executor only touches files inside a configured library root
os.environ["MUSIC_HUB_ROOTS"] = str(src)

from server import tidy  # noqa: E402
from server.db import connect  # noqa: E402

files = {}
for name in ("one.mp3", "two.mp3", "three.mp3"):
    path = src / name
    path.write_bytes(b"ID3" + name.encode() * 40)
    files[name] = path

track_ids = []
conn = connect()
try:
    for name, path in files.items():
        cur = conn.execute(
            """INSERT INTO tracks(provider, provider_id, title, artist, album, duration_ms,
                                   path, cover, lyrics, lyrics_path, fingerprint, format,
                                   mtime, size, added_at, updated_at)
               VALUES('local', ?, ?, '测试歌手', '测试专辑', 1000, ?, NULL, NULL, NULL,
                      NULL, 'MP3', 0, ?, '2026-11-11 00:00:00', '2026-11-11 00:00:00')""",
            ("test-" + name, name, str(path), path.stat().st_size),
        )
        track_ids.append(int(cur.lastrowid))
    conn.commit()

    cur = conn.execute(
        """INSERT INTO tidy_runs(root, layout, status, created_at, total)
           VALUES(?, 'hybrid', 'pending', '2026-11-11 00:00:00', 3)""",
        (str(dst),),
    )
    run_id = int(cur.lastrowid)
    targets = {
        "one.mp3": dst / "2026-01" / "one.mp3",
        "two.mp3": dst / "2026-01" / "two.mp3",
        "three.mp3": dst / "2026-02" / "three.mp3",
    }
    (dst / "2026-02").mkdir(parents=True)
    (dst / "2026-02" / "three.mp3").write_bytes(b"occupied")  # forces a conflict

    for name, track_id in zip(files, track_ids):
        conn.execute(
            """INSERT INTO tidy_items(run_id, track_id, source, target, status, title, artist, size)
               VALUES(?,?,?,?, 'pending', ?, '测试歌手', ?)""",
            (run_id, track_id, str(files[name]), str(targets[name]), name, files[name].stat().st_size),
        )
    conn.commit()
finally:
    conn.close()

print("run:", run_id, "sandbox:", sandbox)
result = tidy.start_run(run_id, limit_delay=0)
print("start:", result)

for name in files:
    moved = (dst / "2026-01" / name).exists()
    print("  {}: source_exists={} target_exists={}".format(name, files[name].exists(), moved))

status = tidy.run_status(run_id)
print("counts:", status["counts"], "run status:", status["run"]["status"])
for row in status["recent"]:
    print("  item:", row["status"], row["title"], (row["error"] or "")[:40])

conn = connect()
try:
    for name, track_id in zip(files, track_ids):
        row = conn.execute("SELECT path FROM tracks WHERE id=?", (track_id,)).fetchone()
        print("  db path", name, "->", row["path"])
finally:
    conn.close()

print("\n-- undo --")
undone = tidy.undo_run(run_id)
print("undo:", undone)
for name in files:
    print("  {}: back_at_source={}".format(name, files[name].exists()))

conn = connect()
try:
    for name, track_id in zip(files, track_ids):
        row = conn.execute("SELECT path FROM tracks WHERE id=?", (track_id,)).fetchone()
        print("  db path", name, "->", row["path"])
    conn.execute("DELETE FROM tidy_runs WHERE id=?", (run_id,))
    marks = ",".join("?" * len(track_ids))
    conn.execute("DELETE FROM tracks WHERE id IN ({})".format(marks), track_ids)
    conn.commit()
finally:
    conn.close()

shutil.rmtree(sandbox, ignore_errors=True)
print("\ncleanup done; sandbox removed:", not sandbox.exists())
