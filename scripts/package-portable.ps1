# 打便携版：electron 壳 + PyInstaller 后端 sidecar + web 静态资源
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable.ps1
#   加 -Rebuild 强制重新构建后端 exe
param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root "dist\大肥鱼音乐管家"
$Pyi = Join-Path $Root "dist\music-hub-server"
$Sidecar = Join-Path $Pyi "music-hub-server.exe"

if ($Rebuild -or -not (Test-Path $Sidecar)) {
  Write-Host "[1/4] 构建后端 sidecar（约 5 分钟）"
  & (Join-Path $Root ".venv\Scripts\python.exe") -m PyInstaller --noconfirm --clean --onedir `
    --name music-hub-server --distpath (Join-Path $Root "dist") --workpath (Join-Path $Root "build\pyi") `
    --specpath (Join-Path $Root "build") --paths $Root --collect-submodules server --collect-all uvicorn `
    (Join-Path $Root "packaging\backend_entry.py") | Out-Null
  if (-not (Test-Path $Sidecar)) { throw "后端构建失败" }
} else {
  Write-Host "[1/4] 复用已有后端 sidecar"
}

Write-Host "[2/4] 复制 web 与初始 data"
if (Test-Path (Join-Path $Pyi "web")) { Remove-Item -Recurse -Force (Join-Path $Pyi "web") }
Copy-Item -Recurse -Force (Join-Path $Root "web") (Join-Path $Pyi "web")
New-Item -ItemType Directory -Force -Path (Join-Path $Pyi "data") | Out-Null
foreach ($f in @("config.json", "roadmap.json")) {
  $src = Join-Path $Root "data\$f"
  if (Test-Path $src) { Copy-Item -Force $src (Join-Path $Pyi "data") }
}

Write-Host "[3/4] 组装便携目录"
if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force -Path (Join-Path $Out "resources\backend") | Out-Null
Copy-Item -Force "C:\DafeiyuMusicHub\electron.exe" $Out
Copy-Item -Recurse -Force "C:\DafeiyuMusicHub\app" (Join-Path $Out "app")
Copy-Item -Recurse -Force (Join-Path $Pyi "*") (Join-Path $Out "resources\backend")

Write-Host "[4/4] 写启动脚本"
$launch = @'
# 大肥鱼音乐管家 · 启动
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:MUSIC_HUB_ROOT = $Root
$env:MUSIC_HUB_DATA = Join-Path $Root "data"
Start-Process -FilePath (Join-Path $Root "electron.exe") `
  -ArgumentList @("$(Join-Path $Root 'app')", "--user-data-dir=$(Join-Path $Root 'profile')") `
  -WindowStyle Hidden
'@
[System.IO.File]::WriteAllText((Join-Path $Out "launch.ps1"), $launch, (New-Object System.Text.UTF8Encoding($false)))

$vbs = @'
' 双击启动，不弹控制台窗口
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & _
  CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\launch.ps1""", 0, False
'@
[System.IO.File]::WriteAllText((Join-Path $Out "大肥鱼音乐管家.vbs"), $vbs, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "完成：$Out"
$size = (Get-ChildItem $Out -Recurse | Measure-Object Length -Sum).Sum
"Total: {0:N1} MB" -f ($size / 1MB)
Get-ChildItem $Out | Select-Object Name | Format-Table