"""用 Windows DPAPI 保护本地登录态（与 Windows 账户绑定，别的账户/机器解不开）。

QQ 音乐早就用这套（`providers/qq.py`）；网易云之前是明文 JSON，这里补齐。
非 Windows 或 DPAPI 不可用时退回明文，但会明确标注 `plain: true`。
"""
from __future__ import annotations

import ctypes
import os
from ctypes import wintypes

CRYPTPROTECT_UI_FORBIDDEN = 0x1


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _blob(data: bytes):
    buffer = ctypes.create_string_buffer(data, len(data))
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer


def available() -> bool:
    return os.name == "nt"


def protect(data: bytes) -> bytes:
    """DPAPI 加密：返回可以直接落盘的二进制。"""
    if not available():
        raise OSError("DPAPI 只在 Windows 上可用")
    source, source_buffer = _blob(data)
    output = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    ok = crypt32.CryptProtectData(
        ctypes.byref(source), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output)
    )
    del source_buffer
    if not ok:
        raise OSError("DPAPI 加密失败")
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        kernel32.LocalFree(output.pbData)


def unprotect(data: bytes) -> bytes:
    """DPAPI 解密。"""
    if not available():
        raise OSError("DPAPI 只在 Windows 上可用")
    source, source_buffer = _blob(data)
    output = _DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(output)
    )
    del source_buffer
    if not ok:
        raise OSError("DPAPI 解密失败（换过 Windows 账户或文件被改过）")
    try:
        return ctypes.string_at(output.pbData, output.cbData)
    finally:
        kernel32.LocalFree(output.pbData)
