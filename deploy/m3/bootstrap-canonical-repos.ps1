param(
    [string]$ProjectRoot = "D:\FND\M3-Harness-Projects",
    [string]$HarnessRepo = "https://github.com/ericjbe/cogiens-harness-gateway.git",
    [string]$WaterRepo = "https://github.com/ericjbe/Water-science.git"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Ensure-GitRepo {
    param(
        [Parameter(Mandatory=$true)][string]$Url,
        [Parameter(Mandatory=$true)][string]$Path
    )

    if (Test-Path (Join-Path $Path ".git")) {
        Write-Host "Updating $Path" -ForegroundColor Cyan
        git -C $Path fetch --all --prune
        git -C $Path switch main
        git -C $Path pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw "Git update failed: $Path" }
        return
    }

    if (Test-Path $Path) {
        throw "Path exists but is not a Git repository: $Path"
    }

    Write-Host "Cloning $Url -> $Path" -ForegroundColor Cyan
    git clone $Url $Path
    if ($LASTEXITCODE -ne 0) { throw "Git clone failed: $Url" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not in PATH."
}

$bootstrap = Join-Path $PSScriptRoot "bootstrap-project-root.ps1"
if (Test-Path $bootstrap) {
    & $bootstrap -ProjectRoot $ProjectRoot
} else {
    New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "01_projects") -Force | Out-Null
}

$projects = Join-Path $ProjectRoot "01_projects"
$harnessPath = Join-Path $projects "cogiens-harness-gateway"
$waterPath = Join-Path $projects "water-intelligence"

Ensure-GitRepo -Url $HarnessRepo -Path $harnessPath
Ensure-GitRepo -Url $WaterRepo -Path $waterPath

Write-Host "" 
Write-Host "Canonical working copies are ready on M-3." -ForegroundColor Green
Write-Host "Harness Gateway: $harnessPath"
Write-Host "Water Intelligence (provisional repo Water-science): $waterPath"
Write-Host ""
Write-Host "IMPORTANT: GitHub main is canonical. H01-H08 must use isolated worktrees/branches under 02_worktrees." -ForegroundColor Yellow
