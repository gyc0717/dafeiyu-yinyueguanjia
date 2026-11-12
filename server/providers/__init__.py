"""Provider registry."""
from __future__ import annotations

from .base import AuthRequired, BaseProvider, OnlineTrack, ProviderError
from .netease import NetEaseProvider
from .qq import QQProvider

_providers: dict[str, BaseProvider] = {
    "qq": QQProvider(),
    "netease": NetEaseProvider(),
}


def get_provider(name: str) -> BaseProvider:
    provider = _providers.get(name)
    if provider is None:
        raise ProviderError(f"未知的音源：{name}")
    return provider


def refresh(name: str | None = None) -> None:
    for key, provider in _providers.items():
        if name and key != name:
            continue
        try:
            provider.refresh()
        except Exception:
            continue


def mark_auth_error(name: str, message: str) -> None:
    """Remember an upstream 401 so the accounts panel can say “已失效”."""
    provider = _providers.get(name)
    marker = getattr(provider, "mark_expired", None)
    if callable(marker):
        try:
            marker(message)
        except Exception:
            pass


def status() -> list[dict]:
    result = []
    for name, provider in _providers.items():
        try:
            ready = provider.available()
        except Exception:
            ready = False
        entry = {
            "name": name,
            "label": provider.label,
            "ready": ready,
            "requires_auth": provider.requires_auth,
            "account": provider.account() if ready else None,
        }
        try:
            entry.update(provider.info())
        except Exception:
            pass
        result.append(entry)
    return result


__all__ = [
    "AuthRequired",
    "BaseProvider",
    "OnlineTrack",
    "ProviderError",
    "get_provider",
    "mark_auth_error",
    "refresh",
    "status",
]
