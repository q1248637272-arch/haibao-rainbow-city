$ErrorActionPreference = 'SilentlyContinue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$binDir = Join-Path $PSScriptRoot 'bin'
$cloudflaredPath = (Join-Path $binDir 'cloudflared.exe').ToLowerInvariant()
$serverScript = (Join-Path $PSScriptRoot 'serve-dist.mjs').ToLowerInvariant()

$processes = Get-CimInstance Win32_Process |
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
  Stop-Process -Id $process.ProcessId -Force
}

Write-Host 'Haibao public share processes were stopped.'
