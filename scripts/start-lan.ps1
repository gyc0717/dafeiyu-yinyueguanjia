# 网页版 · 局域网模式
# 用法（在项目根目录）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-lan.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-lan.ps1 -Port 8790
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-lan.ps1 -Force   # 端口被桌面客户端占着时，替它退掉
# 效果：后端监听 0.0.0.0:<Port>，同一 Wi-Fi 下的手机打开 http://<本机IP>:<Port>/?token=xxxx
# 说明：本机 127.0.0.1 免口令；其他设备第一次要带 token，之后靠 cookie 免输
param(
  [int]$Port = 8787,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Write-Host "  找不到 .venv\Scripts\python.exe，先用 start.ps1 把环境装起来。" -ForegroundColor Red
  exit 1
}

function Test-PortBusy([int]$number) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect("127.0.0.1", $number)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Stop-Tree([int]$processId) {
  Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Tree ([int]$_.ProcessId) }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 端口占用
if (Test-PortBusy $Port) {
  $holder = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Sort-Object @{ Expression = { if ($_.State -eq "Listen") { 0 } else { 1 } } } |
    Select-Object -First 1
  $owner = if ($holder) { Get-CimInstance Win32_Process -Filter "ProcessId=$($holder.OwningProcess)" -ErrorAction SilentlyContinue } else { $null }
  $ownerPath = if ($owner) { "$($owner.ExecutablePath)" } else { "" }
  $label = if ($ownerPath) { Split-Path -Leaf $ownerPath } else { "PID $($holder.OwningProcess)" }

  Write-Host ""
  Write-Host "  端口 $Port 已经被占用：$label" -ForegroundColor Yellow
  if ($ownerPath -match "music|dafeiyu|electron") {
    Write-Host "  这是正在运行的桌面客户端（它自己也占 8787）。三选一：" -ForegroundColor Yellow
    Write-Host "    1) 先在托盘退出「大肥鱼音乐管家」，再跑这个脚本"
    Write-Host "    2) 加 -Force，让脚本替它退掉： ... scripts\start-lan.ps1 -Force"
    Write-Host "    3) 换个端口： ... scripts\start-lan.ps1 -Port 8790"
  } else {
    Write-Host "  换一个端口再试： ... scripts\start-lan.ps1 -Port 8790" -ForegroundColor Yellow
  }
  Write-Host ""

  if (-not $Force) { exit 1 }
  if ($ownerPath -notmatch "music|dafeiyu|electron") {
    Write-Host "  占用者看起来不是本应用，-Force 不动它。请换端口。" -ForegroundColor Red
    exit 1
  }

  Write-Host "  正在退出桌面客户端 ..." -ForegroundColor DarkGray
  # 连它的父进程（Electron 外壳）一起退，否则外壳可能把 sidecar 再拉起来
  $treeRoot = [int]$owner.ProcessId
  $cursor = $owner
  for ($i = 0; $i -lt 4; $i++) {
    if (-not $cursor -or -not $cursor.ParentProcessId) { break }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($cursor.ParentProcessId)" -ErrorAction SilentlyContinue
    if (-not $parent -or $parent.ExecutablePath -notmatch "music|dafeiyu|electron") { break }
    $treeRoot = [int]$parent.ProcessId
    $cursor = $parent
  }
  Stop-Tree $treeRoot
  Start-Sleep -Milliseconds 1200
  if (Test-PortBusy $Port) {
    Write-Host "  端口 $Port 还是被占着，请手动退出客户端后重试。" -ForegroundColor Red
    exit 1
  }
}

# ---------------------------------------------------------------- 局域网 IP
# 优先问系统「出网会走哪张网卡」，这样不会挑中 VMware / Radmin VPN 之类的虚拟网卡
$ip = $null
try {
  $ip = (& $py -c "import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(('8.8.8.8',80));print(s.getsockname()[0]);s.close()" 2>$null | Select-Object -First 1)
  if ($ip) { $ip = $ip.Trim() }
} catch {
  $ip = $null
}
if (-not $ip -or $ip -like "127.*" -or $ip -like "169.254.*") {
  $ip = $null
  $gwIndex = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric | Select-Object -First 1).InterfaceIndex
  $candidate = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and
      $_.InterfaceIndex -eq $gwIndex
    } | Select-Object -First 1
  if ($candidate) { $ip = $candidate.IPAddress }
}
if (-not $ip) {
  Write-Host ""
  Write-Host "  没找到可用的局域网 IP —— 这台机器现在没连 Wi-Fi/网线？" -ForegroundColor Red
  Write-Host "  先确认联网，或直接开 http://127.0.0.1:$Port 在本机用。" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------- 口令
$tokenFile = Join-Path $Root "data\lan_token.txt"
$token = $null
if (Test-Path $tokenFile) { $token = (Get-Content $tokenFile -Raw).Trim() }
if (-not $token) {
  $chars = "abcdefghjkmnpqrstuvwxyz23456789".ToCharArray()
  $token = -join (1..12 | ForEach-Object { $chars | Get-Random })
  New-Item -ItemType Directory -Force -Path (Join-Path $Root "data") | Out-Null
  Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding ASCII
}

# ---------------------------------------------------------------- 防火墙提示（只在真的会挡的时候提）
$firewallWarn = $false
try {
  $ifIndex = (Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue | Select-Object -First 1).InterfaceIndex
  $profileName = "Private"
  $conn = Get-NetConnectionProfile -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue
  if ($conn) {
    $profileName = switch ("$($conn.NetworkCategory)") {
      "Public" { "Public" }
      "DomainAuthenticated" { "Domain" }
      default { "Private" }
    }
  }
  $fwProfile = Get-NetFirewallProfile -Name $profileName -ErrorAction SilentlyContinue
  if ($fwProfile -and $fwProfile.Enabled) { $firewallWarn = $true }
} catch {
  $firewallWarn = $false
}

# ---------------------------------------------------------------- 启动
Write-Host ""
Write-Host "  大肥鱼音乐管家 · 网页版（局域网）" -ForegroundColor Cyan
Write-Host "  本机：   http://127.0.0.1:$Port"
Write-Host "  手机：   http://${ip}:${Port}/?token=$token" -ForegroundColor Green
Write-Host "  口令：   $token" -ForegroundColor Green
Write-Host "  二维码： http://127.0.0.1:$Port/api/lan/qr.png" -ForegroundColor Green
Write-Host "           （在电脑浏览器打开上面这个地址，手机扫屏幕上的码）" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  手机和电脑要连同一个 Wi-Fi；第一次用带口令的地址，之后直接打开就行。" -ForegroundColor DarkGray
if ($firewallWarn) {
  Write-Host ""
  Write-Host "  这台机器当前网络位置的防火墙是开着的，可能挡住手机。若手机打不开，" -ForegroundColor Yellow
  Write-Host "  用管理员 PowerShell 放行端口：" -ForegroundColor Yellow
  Write-Host "  New-NetFirewallRule -DisplayName 'music-hub $Port' -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  按 Ctrl+C 结束服务" -ForegroundColor DarkGray
Write-Host ""

$env:MUSIC_HUB_LAN = "1"
& $py -m uvicorn server.main:app --host 0.0.0.0 --port $Port
