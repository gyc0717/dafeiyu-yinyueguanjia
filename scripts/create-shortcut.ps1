# 只创建「浏览器模式」的备用快捷方式。
# 主入口是 Electron 壳（C:\DafeiyuMusicHub\launch.ps1，桌面「大肥鱼音乐管家.lnk」）；
# 这里刻意用 -浏览器 后缀，避免把主快捷方式覆盖成 Edge App 模式。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$link = Join-Path $desktop "大肥鱼音乐管家-浏览器.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\scripts\launch-app.ps1`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,138"
$shortcut.Description = "大肥鱼音乐管家（浏览器模式，备用）"
$shortcut.Save()

Write-Output $link
