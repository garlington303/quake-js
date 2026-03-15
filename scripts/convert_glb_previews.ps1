$blenderPath = "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe"
$blender = Get-Command blender -ErrorAction SilentlyContinue
if (-not $blender -and -not (Test-Path $blenderPath)) {
  Write-Host "Blender not found in PATH or at $blenderPath."
  Write-Host "Install Blender or add it to PATH, then rerun:"
  Write-Host "  blender -b -P scripts\\blender_glb_to_obj.py -- --input public\\models --output public\\preview"
  exit 1
}

$project = Split-Path -Parent $PSScriptRoot
$inputDir = Join-Path $project "public\\models"
$outputDir = Join-Path $project "public\\preview"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

if ($blender) {
  & $blender.Source -b -P (Join-Path $project "scripts\\blender_glb_to_obj.py") -- --input $inputDir --output $outputDir
} else {
  & $blenderPath -b -P (Join-Path $project "scripts\\blender_glb_to_obj.py") -- --input $inputDir --output $outputDir
}

# Fix absolute texture paths in MTL files to be relative
Get-ChildItem -Path $outputDir -Recurse -Filter *.mtl | ForEach-Object {
  $content = Get-Content -Raw $_.FullName
  $content = $content -replace '(?m)^map_Kd\\s+.*[\\\\/](.+)$', 'map_Kd $1'
  Set-Content -Path $_.FullName -Value $content -NoNewline
}
