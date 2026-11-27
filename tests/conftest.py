"""pytest 公共夹具：把项目根目录加入 sys.path，并确保数据库表存在。"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.db import init_db  # noqa: E402

init_db()
