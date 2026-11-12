$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$dst = "C:\DafeiyuMusicHub\app"
if (-not (Test-Path $dst)) { throw "Portable app folder missing: $dst" }
Copy-Item -LiteralPath "$src\main.js" -Destination "$dst\main.js" -Force
Copy-Item -LiteralPath "$src\preload.js" -Destination "$dst\preload.js" -Force
Copy-Item -LiteralPath "$src\package.json" -Destination "$dst\package.json" -Force
Copy-Item -LiteralPath "$src\assets" -Destination $dst -Recurse -Force
Write-Output "synced to $dst"
