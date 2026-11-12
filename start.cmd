@echo off
rem Dev launcher: bypass execution policy. Prefer PowerShell 7 (UTF-8), fall back to Windows PowerShell.
cd /d "%~dp0"
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
)
