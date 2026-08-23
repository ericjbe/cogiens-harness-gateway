[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Headers = @{}
if ($env:CHG_API_TOKEN) { $Headers["Authorization"] = "Bearer $($env:CHG_API_TOKEN)" }
$Health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health" -Headers $Headers
$Health | ConvertTo-Json -Depth 12
if ($Health.status -eq "degraded") {
    Write-Warning "Gateway is running, but no real adapter passed preflight. Run node scripts/detect-adapters.mjs after installing/authenticating a harness."
}
