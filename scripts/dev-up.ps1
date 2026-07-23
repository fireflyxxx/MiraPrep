param(
    [switch]$ValidateOnly,
    [ValidateRange(15, 300)][int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "dev-common.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDirectory = Join-Path $repoRoot ".runtime"
$logsDirectory = Join-Path $runtimeDirectory "logs"
$statePath = Join-Path $runtimeDirectory "dev-state.json"
$infraDirectory = Join-Path $repoRoot "infra"
$businessDirectory = Join-Path $repoRoot "backend\business"
$aiDirectory = Join-Path $repoRoot "backend\ai"
$frontendDirectory = Join-Path $repoRoot "frontend"

$infraEnvPath = Join-Path $infraDirectory ".env"
$aiEnvPath = Join-Path $aiDirectory ".env"
$infraEnv = Read-DotEnvFile -Path $infraEnvPath
$aiEnv = Read-DotEnvFile -Path $aiEnvPath
Assert-RequiredKeys -Values $infraEnv -Keys @(
    "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
    "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "MINIO_BUCKET"
) -SourceName $infraEnvPath
Assert-RequiredKeys -Values $aiEnv -Keys @(
    "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "BUSINESS_CALLBACK_URL"
) -SourceName $aiEnvPath

$docker = Resolve-RequiredCommand -Name "docker"
$uv = Resolve-RequiredCommand -Name "uv"
$npm = Resolve-RequiredCommand -Name "npm.cmd"
$javaHome = Resolve-Java21Home
$gradle = Join-Path $businessDirectory "gradlew.bat"
if (-not (Test-Path -LiteralPath $gradle -PathType Leaf)) {
    throw "Gradle wrapper is missing: $gradle"
}

if ($ValidateOnly) {
    Write-Host "Development startup validation passed."
    exit 0
}

New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
$internalToken = Get-OrCreateDevInternalToken -RuntimeDirectory $runtimeDirectory

if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    $existingState = Get-Content -Raw -LiteralPath $statePath -Encoding UTF8 | ConvertFrom-Json
    $running = @($existingState.services | Where-Object { Get-Process -Id $_.pid -ErrorAction SilentlyContinue })
    if ($running.Count -gt 0) {
        throw "MiraPrep is already managed by dev-up.ps1. Run .\scripts\dev-down.ps1 first."
    }
    Remove-Item -LiteralPath $statePath -Force
}

foreach ($port in @(3000, 8000, 8080)) {
    Assert-PortAvailable -Port $port
}

Write-Host "[1/5] Starting MySQL, Redis and MinIO..."
& $docker compose -f (Join-Path $infraDirectory "docker-compose.yml") up -d
if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed."
}
foreach ($container in @("miraprep-mysql-1", "miraprep-redis-1", "miraprep-minio-1")) {
    Wait-DockerContainerHealthy -ContainerName $container -TimeoutSeconds $StartupTimeoutSeconds
}

$state = [ordered]@{
    version = 1
    repoRoot = $repoRoot
    startedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    services = @()
}

$springEnvironment = @{
    JAVA_HOME = $javaHome
    PATH = "$(Join-Path $javaHome 'bin');$env:PATH"
    DB_URL = "jdbc:mysql://127.0.0.1:3306/$($infraEnv['MYSQL_DATABASE'])"
    DB_USER = $infraEnv["MYSQL_USER"]
    DB_PASSWORD = $infraEnv["MYSQL_PASSWORD"]
    REDIS_HOST = "127.0.0.1"
    REDIS_PORT = "6379"
    OSS_ENDPOINT = "http://127.0.0.1:9000"
    OSS_BUCKET = $infraEnv["MINIO_BUCKET"]
    OSS_ACCESS_KEY = $infraEnv["MINIO_ROOT_USER"]
    OSS_SECRET_KEY = $infraEnv["MINIO_ROOT_PASSWORD"]
    AI_SERVICE_BASE_URL = "http://127.0.0.1:8000"
    AI_INTERNAL_TOKEN = $internalToken
}
$aiEnvironment = @{
    INTERNAL_TOKEN = $internalToken
    BUSINESS_CALLBACK_URL = "http://127.0.0.1:8080/api/v1/internal"
}

try {
    Write-Host "[2/5] Starting FastAPI AI service..."
    $aiProcess = Start-LoggedProcess `
        -FilePath $uv `
        -Arguments @("run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $aiDirectory `
        -StdoutPath (Join-Path $logsDirectory "ai.stdout.log") `
        -StderrPath (Join-Path $logsDirectory "ai.stderr.log") `
        -ProcessEnvironment $aiEnvironment
    $state.services += New-DevProcessRecord -Name "ai" -Process $aiProcess
    Save-DevState -State $state -Path $statePath
    Wait-HttpEndpoint -Uri "http://127.0.0.1:8000/health" -TimeoutSeconds $StartupTimeoutSeconds | Out-Null
    Wait-HttpEndpoint -Uri "http://127.0.0.1:8000/internal/ping" `
        -Headers @{ "X-Internal-Token" = $internalToken } `
        -TimeoutSeconds $StartupTimeoutSeconds | Out-Null

    Write-Host "[3/5] Starting Spring business service..."
    $springProcess = Start-LoggedProcess `
        -FilePath $gradle `
        -Arguments @("bootRun", "--no-daemon") `
        -WorkingDirectory $businessDirectory `
        -StdoutPath (Join-Path $logsDirectory "spring.stdout.log") `
        -StderrPath (Join-Path $logsDirectory "spring.stderr.log") `
        -ProcessEnvironment $springEnvironment
    $state.services += New-DevProcessRecord -Name "spring" -Process $springProcess
    Save-DevState -State $state -Path $statePath
    Wait-HttpEndpoint -Uri "http://127.0.0.1:8080/api/v1/health" -TimeoutSeconds $StartupTimeoutSeconds | Out-Null
    Wait-HttpEndpoint -Uri "http://127.0.0.1:8080/api/v1/internal/ping" `
        -Headers @{ "X-Internal-Token" = $internalToken } `
        -TimeoutSeconds $StartupTimeoutSeconds | Out-Null

    Write-Host "[4/5] Starting Next.js frontend..."
    if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory "node_modules") -PathType Container)) {
        & $npm install --prefix $frontendDirectory
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed."
        }
    }
    $frontendProcess = Start-LoggedProcess `
        -FilePath $npm `
        -Arguments @("run", "dev") `
        -WorkingDirectory $frontendDirectory `
        -StdoutPath (Join-Path $logsDirectory "frontend.stdout.log") `
        -StderrPath (Join-Path $logsDirectory "frontend.stderr.log")
    $state.services += New-DevProcessRecord -Name "frontend" -Process $frontendProcess
    Save-DevState -State $state -Path $statePath
    Wait-HttpEndpoint -Uri "http://127.0.0.1:3000/auth" -TimeoutSeconds $StartupTimeoutSeconds | Out-Null

    Write-Host "[5/5] MiraPrep is ready."
    Write-Host "Frontend: http://localhost:3000"
    Write-Host "Spring API: http://localhost:8080"
    Write-Host "AI API: http://localhost:8000"
    Write-Host "Logs: $logsDirectory"
}
catch {
    Write-Error "Startup failed: $($_.Exception.Message) Logs: $logsDirectory"
    throw
}
