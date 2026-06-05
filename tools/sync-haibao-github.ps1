$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$defaultRepoName = 'haibao-rainbow-city'

Set-Location $root

function Find-Executable([string[]] $Names, [string[]] $Fallbacks) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
      return $cmd.Source
    }
  }
  foreach ($path in $Fallbacks) {
    if (Test-Path $path) {
      return $path
    }
  }
  return $null
}

function Invoke-Text([scriptblock] $Command) {
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command 2>&1
    return ($output | Out-String).Trim()
  } finally {
    $ErrorActionPreference = $oldPreference
  }
}

function Ensure-GitIdentity([string] $Git, [string] $Gh) {
  $name = Invoke-Text { & $Git config --local user.name }
  $email = Invoke-Text { & $Git config --local user.email }
  if ($name.Length -gt 0 -and $email.Length -gt 0) {
    return
  }

  $login = ''
  $id = ''
  if ($Gh -and (Test-GhAuthenticated $Gh)) {
    $login = Invoke-Text { & $Gh api user --jq '.login' }
    $id = Invoke-Text { & $Gh api user --jq '.id' }
  }
  if ($login.Length -eq 0) {
    $login = $env:USERNAME
  }
  if ($login.Length -eq 0) {
    $login = 'haibao-player'
  }
  if ($id.Length -gt 0) {
    $email = "$id+$login@users.noreply.github.com"
  } else {
    $email = "$login@users.noreply.github.com"
  }

  & $Git config --local user.name $login
  & $Git config --local user.email $email
}

function Test-GhAuthenticated([string] $Gh) {
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Gh auth status --hostname github.com 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $oldPreference
  }
}

function Ensure-GitHubLogin([string] $Gh) {
  if (Test-GhAuthenticated $Gh) {
    return
  }

  Write-Host 'GitHub login is required. A browser authorization page will open.'
  & $Gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'GitHub login failed. Please run this script again after GitHub CLI is authorized.'
    exit $LASTEXITCODE
  }
}

function Ensure-Repository([string] $Git, [string] $Gh) {
  $remote = Invoke-Text { & $Git remote get-url origin }
  if ($LASTEXITCODE -eq 0 -and $remote.Length -gt 0) {
    return $remote
  }

  if (-not $Gh) {
    Write-Host 'No GitHub remote is configured, and GitHub CLI was not found.'
    Write-Host 'Create an empty GitHub repository, then run: git remote add origin <repository-url>'
    exit 1
  }

  Ensure-GitHubLogin $Gh
  $login = Invoke-Text { & $Gh api user --jq '.login' }
  if ($login.Length -eq 0) {
    Write-Host 'Could not detect the GitHub username.'
    exit 1
  }

  $repoFullName = "$login/$defaultRepoName"
  $repoUrl = "https://github.com/$repoFullName.git"
  & $Gh repo view $repoFullName *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating private GitHub repository: $repoFullName"
    & $Gh repo create $repoFullName --private --description 'Haibao Rainbow City game source' --confirm
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'GitHub repository creation failed.'
      exit $LASTEXITCODE
    }
  }

  & $Git remote add origin $repoUrl
  return $repoUrl
}

function Commit-IfNeeded([string] $Git) {
  & $Git add -A
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $staged = Invoke-Text { & $Git diff --cached --name-only }
  if ($staged.Length -eq 0) {
    return $false
  }

  $message = "Sync Haibao Rainbow City $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  & $Git commit -m $message
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  return $true
}

$git = Find-Executable `
  @('git.exe', 'git') `
  @(
    'D:\git\Git\cmd\git.exe',
    'C:\Program Files\Git\cmd\git.exe',
    'C:\Program Files\Git\bin\git.exe'
  )
if (-not $git) {
  Write-Host 'git was not found. Please install Git for Windows.'
  exit 1
}

$gitDir = Split-Path -Parent $git
$gitRoot = Resolve-Path (Join-Path $gitDir '..') -ErrorAction SilentlyContinue
if ($gitRoot) {
  $env:PATH = "$gitDir;$($gitRoot.Path)\bin;$env:PATH"
}

$gh = Find-Executable `
  @('gh.exe', 'gh') `
  @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe",
    'C:\Program Files\GitHub CLI\gh.exe'
  )

if (-not (Test-Path (Join-Path $root '.git'))) {
  & $git init -b main
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Ensure-GitIdentity $git $gh
$remoteUrl = Ensure-Repository $git $gh
$committed = Commit-IfNeeded $git

& $git branch -M main
& $git `
  -c credential.https://github.com.helper= `
  -c credential.https://github.com.helper=manager `
  push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host 'GitHub push failed.'
  exit $LASTEXITCODE
}

Write-Host ''
if ($committed) {
  Write-Host 'GitHub sync complete. Latest changes were committed and pushed.'
} else {
  Write-Host 'GitHub sync complete. No new local changes needed a commit.'
}
Write-Host "Repository: $($remoteUrl -replace '\.git$', '')"
Write-Host ''
