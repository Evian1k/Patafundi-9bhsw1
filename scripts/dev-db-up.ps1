param(
  [switch]$NoMigrations
)

Write-Host "Starting local Postgres via docker-compose.dev.yml..."
docker compose -f docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) {
  Write-Error "docker compose failed. Ensure Docker Desktop is running and docker-compose v2 is available."
  exit 1
}

Write-Host "Waiting for Postgres to become healthy (up to 60s)..."
$healthy = $false
for ($i=0; $i -lt 24; $i++) {
  $status = docker inspect --format='{{json .State.Health.Status}}' patafundi-postgres-dev 2>$null
  if ($status -and $status -like '*"healthy"*') { $healthy = $true; break }
  Start-Sleep -Seconds 3
}

if (-not $healthy) {
  Write-Warning "Postgres container not reporting healthy. Proceeding but migrations may fail."
}

Write-Host "Writing .env.local with DATABASE_URL..."
$envPath = Join-Path -Path (Get-Location) -ChildPath '.env.local'
$dbUrl = 'postgres://postgres:postgres@127.0.0.1:5432/patafundi_dev'
"DATABASE_URL=$dbUrl" | Out-File -FilePath $envPath -Encoding ascii -Force

if (-not $NoMigrations) {
  Write-Host "Running project migrations (backend/scripts/ensure-dev-db.js)..."
  node backend/scripts/ensure-dev-db.js
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Migration script exited with non-zero code. Inspect output above."
  } else {
    Write-Host "Migrations applied."
  }
}

Write-Host "Done. You can now run: node backend/scripts/live-verification.js"
