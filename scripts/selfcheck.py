"""Self-check for the local music-hub service.

Covers the things that broke us or could be abused from a browser tab:
- health / library basics
- CSRF guard on write endpoints (foreign Origin must be 403)
- backup create/delete round-trip
- backup name traversal must not be accepted

Run: .venv\\Scripts\\python.exe scripts\\selfcheck.py
Exit code 0 = all passed.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8787"
APP_ORIGIN = "http://127.0.0.1:8787"
results: list[tuple[str, bool, str]] = []


def call(method: str, path: str, headers: dict | None = None, body: dict | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        return 0, f"{type(exc).__name__}: {exc}"


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def main() -> int:
    status, body = call("GET", "/api/health")
    try:
        health = json.loads(body)
    except json.JSONDecodeError:
        health = {}
    check("health", status == 200 and health.get("ok") is True, f"status={status}")
    check("library has tracks", int(health.get("tracks") or 0) > 0, f"tracks={health.get('tracks')}")

    status, body = call("GET", "/api/tracks?limit=3")
    try:
        tracks = json.loads(body).get("items", [])
    except json.JSONDecodeError:
        tracks = []
    check("tracks endpoint", status == 200 and len(tracks) > 0, f"status={status} n={len(tracks)}")

    status, _ = call("POST", "/api/backups", headers={"Origin": "https://evil.example"})
    check("foreign Origin write is rejected", status == 403, f"status={status}")

    status, _ = call("POST", "/api/backups", headers={"Sec-Fetch-Site": "cross-site"})
    check("cross-site fetch is rejected", status == 403, f"status={status}")

    status, body = call("POST", "/api/backups", headers={"Origin": APP_ORIGIN})
    name = ""
    try:
        name = json.loads(body)["backup"]["name"]
    except (json.JSONDecodeError, KeyError):
        pass
    check("same-origin backup works", status == 200 and bool(name), f"status={status} name={name}")
    if name:
        status, _ = call("DELETE", f"/api/backups/{urllib.parse.quote(name)}", headers={"Origin": APP_ORIGIN})
        check("backup delete works", status == 200, f"status={status}")

    status, _ = call("DELETE", "/api/backups/..%2Fmusic_hub.db", headers={"Origin": APP_ORIGIN})
    check("backup name traversal rejected", status in (400, 404), f"status={status}")

    status, body = call("GET", "/api/backups")
    check("backup list", status == 200 and "items" in body, f"status={status}")

    status, _ = call("GET", "/api/playlists")
    check("playlist list", status == 200, f"status={status}")

    status, _ = call("GET", "/api/online/status")
    check("online status", status == 200, f"status={status}")

    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("failed:", ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
