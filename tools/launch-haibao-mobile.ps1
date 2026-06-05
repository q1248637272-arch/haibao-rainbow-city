$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Host 'npm was not found. Please install Node.js 20 or newer.'
  exit 1
}

Set-Location $root

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'Preparing game dependencies for the first launch...'
  & $npm.Source install
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Dependency installation failed.'
    exit $LASTEXITCODE
  }
}

function Test-LocalGame([int] $Port) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/share.html" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-LanGame([string] $LanIp, [int] $Port) {
  if ($LanIp -eq '127.0.0.1') {
    return $false
  }
  try {
    Invoke-WebRequest -Uri "http://$LanIp`:$Port/share.html" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-PortInUse([int] $Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

function Get-LanAddress {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object InterfaceMetric, PrefixLength
  if ($addresses) {
    return $addresses[0].IPAddress
  }
  return '127.0.0.1'
}

$lanIp = Get-LanAddress
$port = 5173

while ($port -le 5190) {
  if (-not (Test-PortInUse $port)) {
    break
  }
  if (Test-LanGame $lanIp $port) {
    break
  }
  $port += 1
}

if ($port -gt 5190) {
  Write-Host 'Ports 5173-5190 are all in use or only available on localhost.'
  exit 1
}

if (-not (Test-LanGame $lanIp $port)) {
  $outLog = Join-Path $logDir "mobile-server-$port.out.log"
  $errLog = Join-Path $logDir "mobile-server-$port.err.log"
  $args = @('run', 'dev', '--', '--host', '0.0.0.0', '--port', "$port", '--strictPort')

  Start-Process `
    -FilePath $npm.Source `
    -ArgumentList $args `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Minimized | Out-Null

  for ($i = 0; $i -lt 40; $i += 1) {
    if ((Test-LocalGame $port) -and (Test-LanGame $lanIp $port)) { break }
    Start-Sleep -Milliseconds 500
  }
}

if (-not (Test-LocalGame $port)) {
  Write-Host "The game server did not start in time. Logs: $logDir"
  exit 1
}

$desktopUrl = "http://127.0.0.1:$port/share.html"
$mobileUrl = "http://$lanIp`:$port/share.html"
$firewallNote = 'Firewall rule was not changed.'

try {
  if (-not (Get-NetFirewallRule -DisplayName 'Haibao Rainbow City Mobile Ports' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule `
      -DisplayName 'Haibao Rainbow City Mobile Ports' `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort 5173-5190 `
      -Profile Any `
      -ErrorAction Stop | Out-Null
  }
  $firewallNote = 'Firewall rule is ready.'
} catch {
  $firewallNote = 'Firewall rule was not added. If the phone still cannot open it, right-click this BAT and run as administrator once, or allow Node.js in Windows Firewall.'
}

try {
  Set-Clipboard -Value $mobileUrl
} catch {
  # Clipboard access can fail in restricted shells; showing the URL is enough.
}

Start-Process $desktopUrl | Out-Null

Write-Host ''
Write-Host 'Haibao Rainbow City mobile share version is running.'
Write-Host ''
Write-Host "Mobile URL: $mobileUrl"
Write-Host 'The URL was copied to the clipboard when possible. Paste it into WeChat to share.'
Write-Host $firewallNote
Write-Host 'Phone and PC must be on the same Wi-Fi.'
Write-Host ''
