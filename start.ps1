$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$py = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "找不到 .venv，请先按 README 安装依赖。" -ForegroundColor Yellow
    exit 1
}

$port = if ($env:MUSIC_HUB_PORT) { $env:MUSIC_HUB_PORT } else { "8787" }
$url = "http://127.0.0.1:$port/"

Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 2
    Start-Process $u
} -ArgumentList $url | Out-Null

Write-Host ""
Write-Host "  大肥鱼 · 音乐管家" -ForegroundColor Cyan
Write-Host "  $url" -ForegroundColor Green
Write-Host "  Ctrl+C 停止" -ForegroundColor DarkGray
Write-Host ""

& $py -m uvicorn server.main:app --host 127.0.0.1 --port $port
