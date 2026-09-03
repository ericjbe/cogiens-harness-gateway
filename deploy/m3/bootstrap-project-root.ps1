param(
    [string]$ProjectRoot = "D:\FND\M3-Harness-Projects"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$dirs = @(
    "00_inbox",
    "01_projects",
    "02_worktrees\H01",
    "02_worktrees\H02",
    "02_worktrees\H03",
    "02_worktrees\H04",
    "02_worktrees\H05",
    "02_worktrees\H06",
    "02_worktrees\H07",
    "02_worktrees\H08",
    "03_shared",
    "04_artifacts",
    "05_evidence",
    "06_logs",
    "07_benchmarks",
    "08_archives",
    "09_quarantine"
)

New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null
foreach ($relative in $dirs) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $relative) -Force | Out-Null
}

$readme = @"
# M-3 Harness Project Root

ROOT: $ProjectRoot

Rules:
1. Harness infrastructure remains outside this root under D:\FND\M3-Harness.
2. Clean integration clones live under 01_projects.
3. H01-H08 consequential changes are made in isolated worktrees under 02_worktrees.
4. No Harness directly mutates a production deployment.
5. Evidence, artifacts and logs are preserved for consequential runs.
6. Unverified or failed outputs go to 09_quarantine.
7. GitHub main remains the canonical code source; this machine hosts working copies only.
8. Secrets and API keys must not be committed to source control.
"@

Set-Content -LiteralPath (Join-Path $ProjectRoot "README_M3_PROJECT_ROOT.md") -Value $readme -Encoding UTF8

Write-Host "M-3 project root ready: $ProjectRoot" -ForegroundColor Green
Get-ChildItem -LiteralPath $ProjectRoot -Directory | Sort-Object Name | Select-Object Name, FullName
