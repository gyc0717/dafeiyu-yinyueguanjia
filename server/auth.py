"""局域网访问口令：只在 MUSIC_HUB_LAN=1 时启用。

设计：
- 启动时读/生成 `data/lan_token.txt`（8 位，可读性好的字符集），控制台会打印带 token 的地址
- 浏览器第一次带 `?token=xxx` 进来，服务端种一个 `mh_token` cookie（30 天），之后不用再带
- 没带或带错：/api/* 返回 401 JSON，页面返回一个极简口令输入页
- 本机（127.0.0.1）访问免口令，避免自己都进不去
"""
from __future__ import annotations

import html
import os
import secrets
from pathlib import Path

from . import config

TOKEN_PATH = config.DATA / "lan_token.txt"
COOKIE_NAME = "mh_token"
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}

ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # 去掉了容易看错的 i l o 0 1


def enabled() -> bool:
    return os.environ.get("MUSIC_HUB_LAN") == "1"


def token() -> str:
    if TOKEN_PATH.exists():
        value = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if value:
            return value
    value = "".join(secrets.choice(ALPHABET) for _ in range(8))
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(value, encoding="utf-8")
    return value


def rotate() -> str:
    try:
        TOKEN_PATH.unlink()
    except FileNotFoundError:
        pass
    return token()


def lan_ip() -> str:
    import socket

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        address = sock.getsockname()[0]
        sock.close()
        return address
    except Exception:  # noqa: BLE001
        return "127.0.0.1"


def login_page(error: str = "") -> str:
    hint = f'<p class="err">{html.escape(error)}</p>' if error else ""
    return f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>大肥鱼音乐管家 · 输入口令</title>
<style>
  body {{ margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0b111a; color:#e8eef8;
         font-family:system-ui,"Microsoft YaHei",sans-serif; }}
  form {{ width:min(340px,calc(100vw - 48px)); padding:28px 24px; border-radius:20px;
         border:1px solid rgba(255,255,255,.1); background:#111a26; }}
  h1 {{ margin:0 0 6px; font-size:17px; }}
  p {{ margin:0 0 16px; font-size:12px; color:#93a3b8; }}
  .err {{ color:#ff8b95; }}
  input {{ width:100%; box-sizing:border-box; padding:11px 12px; border-radius:10px;
          border:1px solid rgba(255,255,255,.14); background:#0b131d; color:inherit; font-size:15px; }}
  button {{ margin-top:12px; width:100%; padding:11px; border:none; border-radius:10px;
           background:#3b82f6; color:#fff; font-size:14px; cursor:pointer; }}
</style></head>
<body>
  <form method="get" action="/">
    <h1>大肥鱼音乐管家</h1>
    <p>这台机器开放了局域网访问，请输入口令（在宿主机的控制台里能看到）。</p>
    {hint}
    <input name="token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="8 位口令" autofocus />
    <button type="submit">进入</button>
  </form>
</body></html>"""
