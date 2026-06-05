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
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-PortInUse([int] $Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

$port = 5173
if (Test-LocalGame $port) {
  Start-Process "http://127.0.0.1:$port/"
  exit 0
}

while (Test-PortInUse $port) {
  $port += 1
  if ($port -gt 5190) {
    Write-Host 'Ports 5173-5190 are all in use.'
    exit 1
  }
}

$outLog = Join-Path $logDir "server-$port.out.log"
$errLog = Join-Path $logDir "server-$port.err.log"
$args = @('run', 'dev', '--', '--host', '0.0.0.0', '--port', "$port", '--strictPort')

Start-Process `
  -FilePath $npm.Source `
  -ArgumentList $args `
  -WorkingDirectory $root `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Minimized | Out-Null

$url = "http://127.0.0.1:$port/"
for ($i = 0; $i -lt 40; $i += 1) {
  if (Test-LocalGame $port) {
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host "The game server did not start in time. Logs: $logDir"
exit 1
