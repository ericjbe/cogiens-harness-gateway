[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20 or newer is required. Install Node.js, reopen PowerShell, and run this script again."
}
$NodeVersion = (& node --version).TrimStart("v").Split(".")[0]
if ([int]$NodeVersion -lt 20) { throw "Node.js 20 or newer is required." }

New-Item -ItemType Directory -Force -Path (Join-Path $Root "var\logs") | Out-Null
if (-not (Test-Path (Join-Path $Root "config\harnesses.local.json"))) {
    Copy-Item (Join-Path $Root "config\harnesses.example.json") (Join-Path $Root "config\harnesses.local.json")
}

Write-Host "Detecting real harness executables and authentication..."
& node scripts/detect-adapters.mjs
if ($LASTEXITCODE -ne 0) { throw "Adapter detection failed." }

Write-Host "Running acceptance checks..."
& npm run verify
if ($LASTEXITCODE -ne 0) { throw "Verification failed; the gateway was not accepted." }

Write-Host ""
Write-Host "CHG installation checks passed. No API keys were written."
Write-Host "Next: .\deploy\windows\Start-CHG.ps1"
Write-Host "Then: .\deploy\windows\Test-CHG.ps1"
