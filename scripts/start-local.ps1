param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
$workspaceDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $workspaceDirectory
try {
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env' -ErrorAction Stop
        Write-Host 'Created private root .env from .env.example; values hidden.'
    }
    $composeArguments = @('compose', 'up', '-d', '--wait')
    if (-not $NoBuild) { $composeArguments += '--build' }
    & docker @composeArguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed. Check service logs.' }

    Write-Host "`nLocal Docker stack is ready."
    Write-Host ('Root environment used by Compose: ' + (Join-Path $workspaceDirectory '.env'))
    foreach ($entry in @(
        @{ Label = 'Website'; Service = 'gateway'; Port = '80' },
        @{ Label = 'Swagger'; Service = 'gateway'; Port = '81' },
        @{ Label = 'Database UI'; Service = 'database-ui'; Port = '3000' },
        @{ Label = 'MinIO Console'; Service = 'minio'; Port = '9001' }
    )) {
        $binding = & docker compose port $entry.Service $entry.Port
        if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:\d+$') { throw 'Expected a local service port.' }
        Write-Host ($entry.Label + ': http://' + $binding)
    }

    if ($env:LOCALAPPDATA) {
        $privateDirectory = Join-Path $env:LOCALAPPDATA 'LifeInsuranceAIAssistant'
    } elseif ($IsMacOS) {
        $privateDirectory = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Library/Application Support/LifeInsuranceAIAssistant'
    } else {
        $stateBaseDirectory = $env:XDG_STATE_HOME
        if (-not $stateBaseDirectory) { $stateBaseDirectory = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.local/state' }
        $privateDirectory = Join-Path $stateBaseDirectory 'LifeInsuranceAIAssistant'
    }
    Write-Host "Private tool files (outside repository): $privateDirectory"
    $operatorLoginFile = Join-Path $privateDirectory 'operator/operator-initial.txt'
    $operatorFileStatus = if (Test-Path -LiteralPath $operatorLoginFile) { 'exists' } else { 'not present' }
    Write-Host "Operator login [$operatorFileStatus]: $operatorLoginFile"
    Write-Host '  Create/preserve operator: npm run admin:setup; start admin: npm run admin'
    $storageLoginFile = Join-Path $privateDirectory 'storage/console.json'
    $storageFileStatus = if (Test-Path -LiteralPath $storageLoginFile) { 'exists' } else { 'not exported yet' }
    Write-Host "MinIO login [$storageFileStatus]: $storageLoginFile"
    Write-Host '  Export existing MinIO login: npm run storage:credentials'
    Write-Host 'These files are created by the tool commands above, not by Compose itself. Tool commands require Node/npm.'
    Write-Host 'Database, PDFs and runtime credentials stay in Docker volumes. No passwords are printed.'
} finally {
    Pop-Location
}
