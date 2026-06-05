[CmdletBinding()]
param(
  [string]$BaseUrl = $env:OPENAI_BASE_URL,
  [string]$ApiKey = $env:OPENAI_API_KEY,
  [string]$Model = 'gpt-image-2',
  [ValidateSet('all', 'title', 'maps', 'characters', 'pets', 'dolls')]
  [string[]]$Groups = @('all'),
  [int]$Limit = 0,
  [string]$Only = '',
  [switch]$Force,
  [switch]$DryRun,
  [string]$ChromaKey = '#ff00ff',
  [string]$OutputRoot = 'public/assets/legacy/image2-restored',
  [string]$WorkRoot = 'logs/image2-work'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ImageApiConfig {
  if ($BaseUrl -and $ApiKey) {
    return @{ BaseUrl = $BaseUrl.TrimEnd('/'); ApiKey = $ApiKey }
  }

  $cockpitConfig = Join-Path $HOME '.antigravity_cockpit\codex_local_access.json'
  if (Test-Path -LiteralPath $cockpitConfig) {
    $cfg = Get-Content -LiteralPath $cockpitConfig -Raw | ConvertFrom-Json
    if (!$BaseUrl -and $cfg.port) {
      $script:BaseUrl = "http://127.0.0.1:$($cfg.port)"
    }
    if (!$ApiKey -and $cfg.apiKey) {
      $script:ApiKey = [string]$cfg.apiKey
    }
  }

  if (!$BaseUrl -or !$ApiKey) {
    throw 'No image API config found. Set OPENAI_BASE_URL/OPENAI_API_KEY or enable Cockpit Codex local access.'
  }

  return @{ BaseUrl = $BaseUrl.TrimEnd('/'); ApiKey = $ApiKey }
}

function Get-ImageEndpoint([string]$RootUrl) {
  if ($RootUrl.EndsWith('/v1')) {
    return "$RootUrl/images/edits"
  }
  return "$RootUrl/v1/images/edits"
}

function Add-Asset {
  param(
    [System.Collections.Generic.List[object]]$List,
    [string]$Group,
    [string]$InputPath,
    [string]$OutputPath,
    [string]$Kind,
    [string]$Size
  )

  if (Test-Path -LiteralPath $InputPath) {
    $List.Add([pscustomobject]@{
      Group = $Group
      Input = $InputPath
      Output = $OutputPath
      Kind = $Kind
      Size = $Size
    }) | Out-Null
  }
}

function Build-Manifest {
  $assets = [System.Collections.Generic.List[object]]::new()
  $expanded = if ($Groups -contains 'all') {
    @('title', 'maps', 'characters', 'pets', 'dolls')
  } else {
    $Groups
  }

  if ($expanded -contains 'title') {
    Add-Asset $assets 'title' 'public/assets/legacy/title/legacy_entry_full.png' `
      (Join-Path $OutputRoot 'title/legacy_entry_full_image2.png') 'map' ''
    Add-Asset $assets 'title' 'public/assets/legacy/title/legacy_world_map_full.png' `
      (Join-Path $OutputRoot 'title/legacy_world_map_full_image2.png') 'map' ''
  }

  if ($expanded -contains 'maps') {
    Get-ChildItem -LiteralPath 'public/assets/legacy/restored' -File -Include *.png -ErrorAction SilentlyContinue |
      ForEach-Object {
        Add-Asset $assets 'maps' $_.FullName `
          (Join-Path $OutputRoot ("maps/{0}_image2.png" -f $_.BaseName)) 'map' ''
      }
    Get-ChildItem -LiteralPath 'public/assets/legacy/screens' -File -Include *.jpg,*.jpeg,*.png -ErrorAction SilentlyContinue |
      ForEach-Object {
        Add-Asset $assets 'maps' $_.FullName `
          (Join-Path $OutputRoot ("maps/screens/{0}_image2.png" -f $_.BaseName)) 'map' ''
      }
  }

  if ($expanded -contains 'characters') {
    Get-ChildItem -LiteralPath 'public/assets/legacy/characters' -File -Include *.png -ErrorAction SilentlyContinue |
      ForEach-Object {
        Add-Asset $assets 'characters' $_.FullName `
          (Join-Path $OutputRoot ("characters/{0}_image2.png" -f $_.BaseName)) 'sprite' '1024x1024'
      }
  }

  if ($expanded -contains 'pets') {
    Get-ChildItem -LiteralPath 'public/assets/legacy/pets' -File -Include *.png -ErrorAction SilentlyContinue |
      ForEach-Object {
        Add-Asset $assets 'pets' $_.FullName `
          (Join-Path $OutputRoot ("pets/{0}_image2.png" -f $_.BaseName)) 'sprite' '1024x1024'
      }
  }

  if ($expanded -contains 'dolls') {
    Get-ChildItem -LiteralPath 'public/assets/legacy/dolls' -File -Include *.png -ErrorAction SilentlyContinue |
      ForEach-Object {
        Add-Asset $assets 'dolls' $_.FullName `
          (Join-Path $OutputRoot ("dolls/{0}_image2.png" -f $_.BaseName)) 'sprite' '1024x1024'
      }
  }

  $selected = if ($Only) {
    @($assets | Where-Object {
      $_.Input -like "*$Only*" -or $_.Output -like "*$Only*"
    })
  } else {
    @($assets)
  }

  if ($Limit -gt 0) {
    return @($selected | Select-Object -First $Limit)
  }
  return @($selected)
}

function Get-Prompt([string]$Kind, [string]$FileName, [string]$KeyColor) {
  if ($Kind -eq 'map') {
    return "Restore this original Haibao Rainbow City browser-game map/screen asset for private local play. Preserve the exact old layout, UI panels, Chinese web-game nostalgia, composition, camera angle, and object positions. Remove compression noise and dirt, gently increase resolution and line clarity, repair small artifacts, and keep all text/logo-like shapes in their original places without inventing new labels. Do not redesign the scene."
  }

  if ($FileName -like '*sheet*') {
    return "Restore this vintage 2D browser-game character sprite sheet for private local play. Preserve the exact frame grid, poses, character identity, costume, chibi proportions, silhouette, and nostalgic look. Use a perfectly flat solid $KeyColor chroma-key background only. Clean jagged edges, sharpen line art, and improve color clarity. Do not use the chroma-key color anywhere in the sprite. Do not change the grid, do not merge frames, do not add shadows, and do not add text."
  }

  return "Restore this vintage 2D browser-game sprite for private local play. Preserve the exact character or pet identity, pose, outfit/body parts, silhouette, chibi proportions, and nostalgic Chinese browser-game look. Use a perfectly flat solid $KeyColor chroma-key background only, with no checkerboard, no shadows, no gradients, and no texture in the background. Do not use the chroma-key color anywhere in the sprite. Remove compression noise, clean jagged edges, sharpen line art, and improve color clarity. Do not redesign and do not add text."
}

function Prepare-Input([object]$Asset, [string]$PreparedPath, [string]$KeyColor) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $PreparedPath) -Force | Out-Null
  if ($Asset.Kind -ne 'sprite') {
    Copy-Item -LiteralPath $Asset.Input -Destination $PreparedPath -Force
    return
  }

$py = @'
import shutil
import sys
from PIL import Image

src, dst, key = sys.argv[1], sys.argv[2], sys.argv[3].lstrip("#")
r, g, b = int(key[0:2], 16), int(key[2:4], 16), int(key[4:6], 16)
img = Image.open(src).convert("RGBA")
bg = Image.new("RGBA", img.size, (r, g, b, 255))
bg.alpha_composite(img)
bg.convert("RGB").save(dst)
'@
  $py | python - $Asset.Input $PreparedPath $KeyColor
}

function Decode-ImageResponse([string]$ResponsePath, [string]$RawOutputPath) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $RawOutputPath) -Force | Out-Null
  $json = Get-Content -LiteralPath $ResponsePath -Raw | ConvertFrom-Json
  if ($json.data -and $json.data[0].b64_json) {
    [IO.File]::WriteAllBytes($RawOutputPath, [Convert]::FromBase64String([string]$json.data[0].b64_json))
    return
  }
  if ($json.data -and $json.data[0].url) {
    Invoke-WebRequest -Uri $json.data[0].url -OutFile $RawOutputPath -UseBasicParsing
    return
  }
  throw "Unexpected image API response in $ResponsePath"
}

function Remove-Chroma([string]$RawOutputPath, [string]$FinalOutputPath) {
  $helper = Join-Path $HOME '.codex\skills\.system\imagegen\scripts\remove_chroma_key.py'
  if (!(Test-Path -LiteralPath $helper)) {
    Copy-Item -LiteralPath $RawOutputPath -Destination $FinalOutputPath -Force
    Write-Warning "Chroma helper not found; kept raw RGB output: $FinalOutputPath"
    return
  }

  & python $helper `
    --input $RawOutputPath `
    --out $FinalOutputPath `
    --key-color $ChromaKey `
    --soft-matte `
    --transparent-threshold 16 `
    --opaque-threshold 225 `
    --despill `
    --force | Out-Null
}

$config = Resolve-ImageApiConfig
$endpoint = Get-ImageEndpoint $config.BaseUrl
$manifest = @(Build-Manifest)

if ($manifest.Count -eq 0) {
  throw 'No assets matched the requested groups.'
}

Write-Output ("image2_endpoint={0}" -f $endpoint)
Write-Output ("asset_count={0}" -f $manifest.Count)

foreach ($asset in $manifest) {
  $out = $asset.Output
  if ((Test-Path -LiteralPath $out) -and !$Force) {
    Write-Output ("skip existing: {0}" -f $out)
    continue
  }

  if ($DryRun) {
    Write-Output ("dry-run: {0} -> {1}" -f $asset.Input, $out)
    continue
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $out) -Force | Out-Null
  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null

  $safeName = ([IO.Path]::GetFileNameWithoutExtension($asset.Output)) -replace '[^A-Za-z0-9_.-]', '_'
  $prepared = Join-Path $WorkRoot "$safeName.input.png"
  $response = Join-Path $WorkRoot "$safeName.response.json"
  $raw = Join-Path $WorkRoot "$safeName.raw.png"
  $prompt = Get-Prompt $asset.Kind ([IO.Path]::GetFileName($asset.Input)) $ChromaKey

  Prepare-Input $asset $prepared $ChromaKey
  Write-Output ("restore: {0}" -f $asset.Input)

  $curlArgs = @(
    '-sS',
    '--fail',
    '-X',
    'POST',
    $endpoint,
    '-H',
    "Authorization: Bearer $($config.ApiKey)",
    '-F',
    "model=$Model",
    '-F',
    "image=@$prepared",
    '-F',
    "prompt=$prompt"
  )
  if ($asset.Size) {
    $curlArgs += @('-F', "size=$($asset.Size)")
  }
  $curlArgs += @('-o', $response)

  & curl.exe @curlArgs
  if (!(Test-Path -LiteralPath $response)) {
    throw "Image API request failed before a response file was written for $($asset.Input)"
  }

  Decode-ImageResponse $response $raw
  if ($asset.Kind -eq 'sprite') {
    Remove-Chroma $raw $out
  } else {
    Copy-Item -LiteralPath $raw -Destination $out -Force
  }

  Write-Output ("done: {0}" -f $out)
}
