@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-portable.ps1" || exit /b 1
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\DafeiyuMusicHub\launch.ps1"
