"""Start and watch the qqmusic-mcp login flow from the web UI.

The CLI owns the hard part (Playwright opens Chrome/Edge, waits for the QR
scan, validates the session and writes the DPAPI cache). This module only
spawns it, keeps the last lines of output and exposes a pollable state so the
onboarding screen never asks the listener to touch a terminal.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from . import config, providers

_lock = threading.Lock()
_state: dict = {
    "running": False,
    "started_at": 0.0,
    "finished_at": 0.0,
    "exit_code": None,
    "error": None,
    "force": False,
    "output": [],
}
_proc: subprocess.Popen | None = None

_FLAGS = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# The CLI is installed by `uv tool install` or pip; probe the usual homes too.
_CLI_CANDIDATES = (
    r"D:\mcp\qqmusic-venv\Scripts\qqmusic-mcp.exe",
    r"%APPDATA%\Python\Python313\Scripts\qqmusic-mcp.exe",
    r"%APPDATA%\Python\Python312\Scripts\qqmusic-mcp.exe",
    r"%USERPROFILE%\.local\bin\qqmusic-mcp.exe",
)


def find_cli() -> Path | None:
    candidates = [os.environ.get("MUSIC_HUB_QQ_CLI"), shutil.which("qqmusic-mcp")]
    candidates.extend(os.path.expandvars(p) for p in _CLI_CANDIDATES)
    for raw in candidates:
        if not raw:
            continue
        path = Path(raw)
        if path.is_file():
            return path
    return None


def _snapshot() -> dict:
    cli = find_cli()
    return {
        "running": _state["running"],
        "started_at": _state["started_at"],
        "finished_at": _state["finished_at"],
        "exit_code": _state["exit_code"],
        "error": _state["error"],
        "force": _state["force"],
        "cli": str(cli) if cli else None,
        "output": _state["output"][-6:],
    }


def status() -> dict:
    with _lock:
        return _snapshot()


def _pump(proc: subprocess.Popen) -> None:
    global _proc
    code = None
    try:
        if proc.stdout is not None:
            for line in proc.stdout:
                text = line.rstrip()
                if not text:
                    continue
                with _lock:
                    _state["output"].append(text)
                    del _state["output"][:-40]
    finally:
        code = proc.wait()
        with _lock:
            _state["running"] = False
            _state["exit_code"] = code
            _state["finished_at"] = time.time()
            if code != 0 and not _state["error"]:
                tail = " / ".join(_state["output"][-2:])
                _state["error"] = tail or f"登录进程退出（{code}）"
        _proc = None
        providers.refresh("qq")


def start(force: bool = False) -> dict:
    """Spawn `qqmusic-mcp login` (or report why it cannot)."""
    global _proc
    with _lock:
        if _state["running"]:
            return _snapshot()
        cli = find_cli()
        if cli is None:
            _state["error"] = (
                "没找到 qqmusic-mcp 命令行工具。先安装它（uv tool install "
                "git+https://github.com/baoozak/qqmusic-mcp.git），或设置 "
                "MUSIC_HUB_QQ_CLI 指向可执行文件。"
            )
            return _snapshot()
        args = [str(cli), "login"]
        if force:
            args.append("--force")
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        try:
            _proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                cwd=str(config.ROOT),
                creationflags=_FLAGS,
            )
        except OSError as exc:
            _state["error"] = f"启动登录失败：{exc}"
            return _snapshot()
        _state.update(
            running=True,
            started_at=time.time(),
            finished_at=0.0,
            exit_code=None,
            error=None,
            force=bool(force),
            output=[],
        )
        thread = threading.Thread(target=_pump, args=(_proc,), daemon=True)
        thread.start()
        return _snapshot()


def logout() -> dict:
    """Remove the cached login through the CLI and drop the provider cache."""
    cli = find_cli()
    if cli is None:
        return {"ok": False, "error": "没找到 qqmusic-mcp 命令行工具"}
    try:
        proc = subprocess.run(
            [str(cli), "logout"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            creationflags=_FLAGS,
            cwd=str(config.ROOT),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "error": f"退出登录失败：{exc}"}
    providers.refresh("qq")
    output = (proc.stdout or "").strip() or (proc.stderr or "").strip()
    return {"ok": proc.returncode == 0, "output": output, "exit_code": proc.returncode}
