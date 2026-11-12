"""打包入口：PyInstaller 用这个文件把后端做成 music-hub-server.exe。

开发时仍然 `uvicorn server.main:app`，打包后由 Electron 直接启动这个 exe：
`music-hub-server.exe --host 127.0.0.1 --port 8787`

数据目录（data/）不打进 exe，落在 exe 同级的 data/ 下，和便携版行为一致。
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(prog="music-hub-server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--log-level", default="warning")
    args = parser.parse_args()

    root = _app_root()
    os.chdir(root / "server" if (root / "server").is_dir() else root)
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    # 根目录与数据目录都跟 exe 走：<安装目录>/web、<安装目录>/data
    os.environ["MUSIC_HUB_ROOT"] = str(root)
    os.environ.setdefault("MUSIC_HUB_DATA", str(root / "data"))

    import uvicorn

    from server.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level, access_log=False)


if __name__ == "__main__":
    main()
