"""music-hub 冒烟测试：验证服务能启动、核心只读接口能返回。

运行：python -m pytest -q
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["tracks"], int)


def test_config_has_roots():
    r = client.get("/api/config")
    assert r.status_code == 200
    body = r.json()
    for key in ("roots", "data_dir", "version"):
        assert key in body


def test_tracks_list_shape():
    r = client.get("/api/tracks", params={"limit": 3})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["total"], int)
    assert isinstance(body["items"], list)
    assert len(body["items"]) <= 3


def test_tracks_reject_bad_limit():
    """limit 必须 >= 1；传 0 应被参数校验挡下，而不是返回空列表。"""
    r = client.get("/api/tracks", params={"limit": 0})
    assert r.status_code == 422


def test_playlists_list():
    r = client.get("/api/playlists")
    assert r.status_code == 200
    assert isinstance(r.json(), (list, dict))


def test_likes_list():
    r = client.get("/api/likes")
    assert r.status_code == 200


def test_unknown_route_404():
    r = client.get("/api/definitely-not-a-route")
    assert r.status_code == 404
