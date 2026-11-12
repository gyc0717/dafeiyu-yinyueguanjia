"""Provider contract: everything the player needs from an online source."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ProviderError(RuntimeError):
    """A provider could not serve the request (network, protocol, rights)."""


class AuthRequired(ProviderError):
    """The provider needs a login before it can serve this."""


@dataclass
class OnlineTrack:
    provider: str
    provider_id: str
    title: str
    artist: str = ""
    album: str = ""
    duration_ms: int = 0
    cover_url: str | None = None
    format: str = "M4A"
    extra: dict[str, Any] = field(default_factory=dict)


class BaseProvider:
    name = "base"
    label = "在线"
    requires_auth = False

    def available(self) -> bool:
        return True

    def account(self) -> str | None:
        return None

    def info(self) -> dict:
        """Extra account state for the accounts panel (message, session time)."""
        return {}

    def refresh(self) -> None:
        """Drop cached credentials after login/logout, if the provider caches them."""

    def search(self, query: str, limit: int = 20) -> list[OnlineTrack]:
        raise NotImplementedError

    def resolve(self, provider_id: str, force: bool = False) -> str:
        """Return an upstream media URL usable for one proxied request."""
        raise NotImplementedError

    def invalidate(self, provider_id: str) -> None:
        """Drop a cached stream URL after an upstream 403/404."""

    def lyrics(self, provider_id: str) -> str | None:
        return None
