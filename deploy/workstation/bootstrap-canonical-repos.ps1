param(
    [string]$Root = "D:\FND\Projects",
    [string]$HarnessRepo = "https://github.com/ericjbe/cogiens-harness-gateway.git",
    [string]$WaterRepo = "https://github.com/ericjbe/Water-science.git"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Ensure-GitRepo {
    param([string]$Url, [string]$Path)

    if (Test-Path (Join-Path $Path ".git")) {
        git -C $Path fetch --all --prune
        git -C $Path switch main
        git -C $Path pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw "Git update failed: $Path" }
        return
    }

    if (Test-Path $Path) { throw "Path exists but is not a Git repository: $Path" }
    git clone $Url $Path
    if ($LASTEXITCODE -ne 0) { throw "Git clone failed: $Url" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not in PATH."
}

New-Item -ItemType Directory -Path $Root -Force | Out-Null

$harnessPath = Join-Path $Root "cogiens-harness-gateway"
$waterPath = Join-Path $Root "water-intelligence"

Ensure-GitRepo -Url $HarnessRepo -Path $harnessPath
Ensure-GitRepo -Url $WaterRepo -Path $waterPath

Write-Host "Main workstation canonical working copies are ready." -ForegroundColor Green
Write-Host "Harness Gateway: $harnessPath"
Write-Host "Water Intelligence: $waterPath"
Write-Host "Use task branches and WIP commit + push when moving work to M-3." -ForegroundColor Yellow
