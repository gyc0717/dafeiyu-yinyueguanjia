﻿$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms
$root = Split-Path -Parent $PSScriptRoot
$health = "http://127.0.0.1:8787/api/health"

function Test-Server {
  try {
    Invoke-WebRequest $health -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Server)) {
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$root\scripts\run-server-log.cmd`"" -WindowStyle Hidden
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Server) { break }
  }
}

if (-not (Test-Server)) {
  [System.Windows.Forms.MessageBox]::Show("音乐管家后端没有启动成功。`n请双击 start.cmd 查看错误。", "大肥鱼音乐管家")
  exit 1
}

$edgeCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($edge) {
  Start-Process -FilePath $edge -ArgumentList "--app=http://127.0.0.1:8787", "--window-size=1440,900"
} else {
  Start-Process "http://127.0.0.1:8787"
}
