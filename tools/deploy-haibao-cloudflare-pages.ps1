$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$logDir = Join-Path $root 'logs'
$projectFile = Join-Path $PSScriptRoot 'cloudflare-pages-project.txt'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Host 'npm was not found. Please install Node.js 20 or newer.'
  exit 1
}

$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npx) {
  Write-Host 'npx was not found. Please install Node.js 20 or newer.'
  exit 1
}

Set-Location $root

function Normalize-ProjectName([string] $Value) {
  $name = $Value.ToLowerInvariant() -replace '[^a-z0-9-]+', '-'
  $name = $name.Trim('-')
  if ($name.Length -lt 3) {
    return 'haibao-rainbow-city'
  }
  if ($name.Length -gt 48) {
    return $name.Substring(0, 48).Trim('-')
  }
  return $name
}

function New-DefaultProjectName {
  $user = $env:USERNAME
  if (-not $user) {
    $user = 'player'
  }
  return Normalize-ProjectName "haibao-rainbow-city-$user"
}

function Get-SavedProjectName {
  if (Test-Path $projectFile) {
    $saved = (Get-Content -Raw -LiteralPath $projectFile).Trim()
    if ($saved.Length -gt 0) {
      return (Normalize-ProjectName $saved)
    }
  }
  return (New-DefaultProjectName)
}

function Invoke-CaptureText([scriptblock] $Command) {
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command 2>&1
    return ($output | Out-String)
  } finally {
    $ErrorActionPreference = $oldPreference
  }
}

function Read-LogPair([string] $OutLog, [string] $ErrLog) {
  $text = ''
  if (Test-Path $OutLog) {
    $text += Get-Content -Raw -LiteralPath $OutLog -ErrorAction SilentlyContinue
  }
  if (Test-Path $ErrLog) {
    $text += "`n"
    $text += Get-Content -Raw -LiteralPath $ErrLog -ErrorAction SilentlyContinue
  }
  return $text
}

function Show-LogTail([string] $OutLog, [string] $ErrLog, [int] $Lines) {
  if (Test-Path $OutLog) {
    Get-Content -LiteralPath $OutLog -ErrorAction SilentlyContinue | Select-Object -Last $Lines
  }
  if (Test-Path $ErrLog) {
    Get-Content -LiteralPath $ErrLog -ErrorAction SilentlyContinue | Select-Object -Last $Lines
  }
}

function Ensure-WranglerLogin {
  $whoami = Invoke-CaptureText { & $npx.Source wrangler whoami }
  if ($whoami -match 'not authenticated' -or $whoami -match 'not logged in') {
    Write-Host 'Cloudflare login is required. A browser window will open.'
    & $npx.Source wrangler login
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Cloudflare login failed.'
      exit $LASTEXITCODE
    }
  }
}

function Ensure-PagesProject([string] $InitialProjectName) {
  $projectName = $InitialProjectName
  $list = Invoke-CaptureText { & $npx.Source wrangler pages project list }
  if ($list -match [regex]::Escape($projectName)) {
    Set-Content -LiteralPath $projectFile -Value $projectName -Encoding UTF8
    return $projectName
  }

  for ($attempt = 0; $attempt -lt 5; $attempt += 1) {
    if ($attempt -gt 0) {
      $suffix = -join ((48..57) + (97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
      $projectName = Normalize-ProjectName "$InitialProjectName-$suffix"
    }

    Write-Host "Creating Cloudflare Pages project: $projectName"
    $create = Invoke-CaptureText {
      & $npx.Source wrangler pages project create $projectName --production-branch=main
    }
    if ($LASTEXITCODE -eq 0 -or $create -match 'already exists' -or $create -match 'project.*exists') {
      Set-Content -LiteralPath $projectFile -Value $projectName -Encoding UTF8
      return $projectName
    }
  }

  Write-Host 'Could not create the Cloudflare Pages project.'
  exit 1
}

function Deploy-Pages([string] $ProjectName) {
  Write-Host 'Building the permanent hosted version...'
  $buildOutLog = Join-Path $logDir 'cloudflare-pages-build.out.log'
  $buildErrLog = Join-Path $logDir 'cloudflare-pages-build.err.log'
  Remove-Item -LiteralPath $buildOutLog, $buildErrLog -Force -ErrorAction SilentlyContinue
  $buildProcess = Start-Process `
    -FilePath $npm.Source `
    -ArgumentList @('run', 'build') `
    -WorkingDirectory $root `
    -RedirectStandardOutput $buildOutLog `
    -RedirectStandardError $buildErrLog `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
  if ($buildProcess.ExitCode -ne 0) {
    Write-Host 'Build failed.'
    Show-LogTail $buildOutLog $buildErrLog 80
    exit $buildProcess.ExitCode
  }
  Write-Host 'Build complete.'

  Write-Host 'Uploading to Cloudflare Pages...'
  $deployLog = Join-Path $logDir 'cloudflare-pages-deploy.log'
  $deployOutLog = Join-Path $logDir 'cloudflare-pages-deploy.out.log'
  $deployErrLog = Join-Path $logDir 'cloudflare-pages-deploy.err.log'
  Remove-Item -LiteralPath $deployLog, $deployOutLog, $deployErrLog -Force -ErrorAction SilentlyContinue
  $deployProcess = Start-Process `
    -FilePath $npx.Source `
    -ArgumentList @(
      'wrangler',
      'pages',
      'deploy',
      'dist',
      '--project-name',
      $ProjectName,
      '--branch',
      'main',
      '--commit-dirty=true'
    ) `
    -WorkingDirectory $root `
    -RedirectStandardOutput $deployOutLog `
    -RedirectStandardError $deployErrLog `
    -WindowStyle Hidden `
    -Wait `
    -PassThru

  $deployText = Read-LogPair $deployOutLog $deployErrLog
  Set-Content -LiteralPath $deployLog -Value $deployText -Encoding UTF8

  if ($deployProcess.ExitCode -ne 0) {
    Show-LogTail $deployOutLog $deployErrLog 120
    Write-Host 'Cloudflare Pages deploy failed.'
    exit $deployProcess.ExitCode
  }

  $urls = [regex]::Matches($deployText, 'https://[^\s]+\.pages\.dev') |
    ForEach-Object { $_.Value.TrimEnd('.') } |
    Sort-Object Length

  $baseUrl = "https://$($ProjectName).pages.dev"
  $production = $urls | Where-Object { $_ -eq $baseUrl } | Select-Object -First 1
  if ($production) {
    $baseUrl = $production
  }

  Write-Output "$($baseUrl)/share"
}

function Sync-GitHubIfAvailable {
  $syncScript = Join-Path $PSScriptRoot 'sync-haibao-github.ps1'
  if (-not (Test-Path $syncScript)) {
    return
  }

  Write-Host 'Syncing the project to GitHub...'
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'GitHub sync failed; Cloudflare deployment will continue.'
    }
  } catch {
    Write-Host 'GitHub sync failed; Cloudflare deployment will continue.'
    Write-Host $_.Exception.Message
  }
}

Ensure-WranglerLogin
$projectName = Ensure-PagesProject (Get-SavedProjectName)
$publicUrl = (Deploy-Pages $projectName | Select-Object -Last 1).Trim()
Sync-GitHubIfAvailable

$latestUrlFile = Join-Path $logDir 'latest-cloudflare-pages-url.txt'
Set-Content -LiteralPath $latestUrlFile -Value $publicUrl -Encoding UTF8

try {
  Set-Clipboard -Value $publicUrl
} catch {
  # Clipboard access can fail in restricted shells; showing the URL is enough.
}

Start-Process $publicUrl | Out-Null

Write-Host ''
Write-Host 'Haibao Rainbow City permanent hosted version is ready.'
Write-Host ''
Write-Host "Permanent URL: $publicUrl"
Write-Host 'The URL was copied to the clipboard when possible. Your computer does not need to stay on.'
Write-Host ''
