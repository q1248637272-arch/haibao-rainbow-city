$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$logDir = Join-Path $root 'logs'
$binDir = Join-Path $PSScriptRoot 'bin'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Host 'npm was not found. Please install Node.js 20 or newer.'
  exit 1
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'node was not found. Please install Node.js 20 or newer.'
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

function Test-PortInUse([int] $Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

function Test-LocalShare([int] $Port) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/share.html" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-NewestSourceTime {
  $paths = @(
    (Join-Path $root 'src'),
    (Join-Path $root 'public'),
    (Join-Path $root 'index.html')
  )
  $items = @()
  foreach ($path in $paths) {
    if (Test-Path $path) {
      $items += Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue
    }
  }
  if (-not $items) {
    return [datetime]::MinValue
  }
  return ($items | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
}

function Ensure-BuiltGame {
  $distIndex = Join-Path $root 'dist\index.html'
  $needsBuild = $true
  if (Test-Path $distIndex) {
    $distTime = (Get-Item $distIndex).LastWriteTime
    $needsBuild = $distTime -lt (Get-NewestSourceTime)
  }
  if (-not $needsBuild) {
    return
  }

  Write-Host 'Building the public share version...'
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Build failed.'
    exit $LASTEXITCODE
  }
}

function Ensure-Cloudflared {
  $cloudflared = Join-Path $binDir 'cloudflared.exe'
  if (Test-Path $cloudflared) {
    return $cloudflared
  }

  Write-Host 'Downloading Cloudflare Tunnel helper...'
  $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  try {
    Invoke-WebRequest -Uri $url -OutFile $cloudflared -UseBasicParsing -TimeoutSec 120
  } catch {
    Write-Host 'Could not download cloudflared. Please check your network and try again.'
    Write-Host $_.Exception.Message
    exit 1
  }
  return $cloudflared
}

function Find-FreePort {
  for ($candidate = 4173; $candidate -le 4190; $candidate += 1) {
    if (-not (Test-PortInUse $candidate)) {
      return $candidate
    }
  }
  Write-Host 'Ports 4173-4190 are all in use.'
  exit 1
}

function Stop-OldPublicShare {
  $cloudflaredPath = (Join-Path $binDir 'cloudflared.exe').ToLowerInvariant()
  $serverScript = (Join-Path $PSScriptRoot 'serve-dist.mjs').ToLowerInvariant()
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $cmd = ''
      $exe = ''
      if ($_.CommandLine) {
        $cmd = $_.CommandLine.ToLowerInvariant()
      }
      if ($_.ExecutablePath) {
        $exe = $_.ExecutablePath.ToLowerInvariant()
      }
      ($exe -eq $cloudflaredPath) -or ($cmd.Contains($serverScript))
    }
  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    } catch {
      # A stale process may already be gone.
    }
  }
}

function Start-StaticServer([int] $Port) {
  if (Test-LocalShare $Port) {
    return
  }

  $outLog = Join-Path $logDir "public-static-$Port.out.log"
  $errLog = Join-Path $logDir "public-static-$Port.err.log"
  $serverScript = Join-Path $PSScriptRoot 'serve-dist.mjs'
  $args = @($serverScript, '--port', "$Port")

  Start-Process `
    -FilePath $node.Source `
    -ArgumentList $args `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  for ($i = 0; $i -lt 40; $i += 1) {
    if (Test-LocalShare $Port) {
      return
    }
    Start-Sleep -Milliseconds 500
  }

  Write-Host "The local preview server did not start in time. Logs: $logDir"
  exit 1
}

function Start-PublicTunnel([string] $Cloudflared, [int] $Port) {
  $outLog = Join-Path $logDir "public-tunnel-$Port.out.log"
  $errLog = Join-Path $logDir "public-tunnel-$Port.err.log"
  Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue

  $args = @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port")
  Start-Process `
    -FilePath $Cloudflared `
    -ArgumentList $args `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden | Out-Null

  $pattern = 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'
  for ($i = 0; $i -lt 80; $i += 1) {
    $text = ''
    if (Test-Path $outLog) {
      $text += Get-Content -Raw -ErrorAction SilentlyContinue $outLog
    }
    if (Test-Path $errLog) {
      $text += "`n"
      $text += Get-Content -Raw -ErrorAction SilentlyContinue $errLog
    }
    $match = [regex]::Match($text, $pattern)
    if ($match.Success) {
      return $match.Value
    }
    Start-Sleep -Milliseconds 500
  }

  Write-Host "The public tunnel did not produce a URL in time. Logs: $logDir"
  exit 1
}

Ensure-BuiltGame
Stop-OldPublicShare
$port = Find-FreePort
Start-StaticServer $port
$cloudflared = Ensure-Cloudflared
$publicBaseUrl = Start-PublicTunnel $cloudflared $port
$publicShareUrl = "$publicBaseUrl/share.html"
$latestUrlFile = Join-Path $logDir 'latest-public-url.txt'
Set-Content -LiteralPath $latestUrlFile -Value $publicShareUrl -Encoding UTF8

try {
  Set-Clipboard -Value $publicShareUrl
} catch {
  # Clipboard access can fail in restricted shells; showing the URL is enough.
}

Start-Process $publicShareUrl | Out-Null

Write-Host ''
Write-Host 'Haibao Rainbow City public share version is running.'
Write-Host ''
Write-Host "Public URL: $publicShareUrl"
Write-Host 'The URL was copied to the clipboard when possible. Send it to your friend in WeChat.'
Write-Host 'Keep this computer online. The public URL changes each time you restart this script.'
Write-Host ''
