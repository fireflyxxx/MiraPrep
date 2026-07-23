param([switch]$KeepInfra)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "dev-common.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDirectory = Join-Path $repoRoot ".runtime"
$statePath = Join-Path $runtimeDirectory "dev-state.json"
$composePath = Join-Path $repoRoot "infra\docker-compose.yml"

if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    $state = Get-Content -Raw -LiteralPath $statePath -Encoding UTF8 | ConvertFrom-Json
    $services = @($state.services)
    [array]::Reverse($services)
    foreach ($service in $services) {
        Write-Host "Stopping $($service.name)..."
        Stop-TrackedProcessTree -Record $service
    }
    Remove-Item -LiteralPath $statePath -Force
}
else {
    Write-Host "No processes managed by dev-up.ps1 were found."
}

if (-not $KeepInfra) {
    $docker = Resolve-RequiredCommand -Name "docker"
    Write-Host "Stopping MySQL, Redis and MinIO (data volumes are preserved)..."
    & $docker compose -f $composePath stop
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose stop failed."
    }
}

Write-Host "MiraPrep development services stopped."
