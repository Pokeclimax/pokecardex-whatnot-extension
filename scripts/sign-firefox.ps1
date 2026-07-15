$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SourceDir = Join-Path $ProjectRoot 'dist\firefox'
$SigningScript = Join-Path $PSScriptRoot 'sign-firefox.mjs'

if (-not $env:WEB_EXT_API_KEY -or -not $env:WEB_EXT_API_SECRET) {
  throw 'Définissez WEB_EXT_API_KEY et WEB_EXT_API_SECRET dans l’environnement, puis relancez npm run sign:firefox.'
}

if (-not (Test-Path -LiteralPath (Join-Path $SourceDir 'manifest.json'))) {
  throw 'Le build Firefox est absent. Lancez npm run build.'
}

if (-not (Test-Path -LiteralPath $SigningScript)) {
  throw 'Le script de signature Firefox est absent.'
}

node $SigningScript
if ($LASTEXITCODE -ne 0) {
  throw "La signature Mozilla a échoué (code $LASTEXITCODE)."
}
