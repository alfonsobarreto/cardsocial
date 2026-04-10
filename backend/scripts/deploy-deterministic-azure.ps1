param(
  [string]$ResourceGroup = "CardSocial_Group",
  [string]$WebAppName = "card-social-api",
  [string]$BackendPath = "./backend",
  [string]$DeployBranch = "master"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$CommandName) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $CommandName"
  }
}

Assert-Command "az"
Assert-Command "npm"
Assert-Command "git"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendAbsolute = (Resolve-Path (Join-Path $repoRoot $BackendPath)).Path

if (-not (Test-Path (Join-Path $backendAbsolute "package.json"))) {
  throw "package.json not found under $backendAbsolute"
}

if (-not (Test-Path (Join-Path $backendAbsolute "src\server.js"))) {
  throw "src/server.js not found under $backendAbsolute"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempRoot = Join-Path $env:TEMP "card-social-backend-deploy-$timestamp"
$staging = Join-Path $tempRoot "staging"

Write-Step "Preparing clean staging folder"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$robocopyLog = Join-Path $tempRoot "robocopy.log"
$backendSource = $backendAbsolute
$excludeDirs = @("node_modules", "logs_extract", "webapp-logs", ".git")
$excludeFiles = @(".env", ".env.*", "*.zip", "*.log", "startup.sh")

$robocopyArgs = @(
  $backendSource,
  $staging,
  "/E",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP",
  "/XF"
) + $excludeFiles + @("/XD") + $excludeDirs + @("/LOG:$robocopyLog")

& robocopy @robocopyArgs | Out-Null
$robocopyCode = $LASTEXITCODE
if ($robocopyCode -ge 8) {
  throw "robocopy failed with exit code $robocopyCode. See $robocopyLog"
}

Write-Step "Installing production dependencies in staging"
Push-Location $staging
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
npm ci --omit=dev 2>&1 | Write-Host
$npmExit = $LASTEXITCODE
$ErrorActionPreference = $prevPref
if ($npmExit -ne 0) {
  Pop-Location
  throw "npm ci failed in staging folder (exit code $npmExit)"
}
Pop-Location

Write-Step "Applying deterministic app settings for local-git deploy"
az webapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $WebAppName `
  --settings WEBSITE_RUN_FROM_PACKAGE=0 SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false `
  -o none

Write-Step "Setting startup command"
az webapp config set `
  --resource-group $ResourceGroup `
  --name $WebAppName `
  --startup-file "node src/server.js" `
  -o none

Write-Step "Getting publishing profile (USER/PWD) via Azure CLI"
$profile = az webapp deployment list-publishing-profiles `
  --resource-group $ResourceGroup `
  --name $WebAppName `
  --query "[?publishMethod=='MSDeploy'] | [0]" `
  -o json | ConvertFrom-Json

if (-not $profile) {
  throw "Could not retrieve MSDeploy publishing profile"
}

$userEncoded = [System.Uri]::EscapeDataString([string]$profile.userName)
$pwdEncoded = [System.Uri]::EscapeDataString([string]$profile.userPWD)
$scmHost = (([string]$profile.publishUrl).Trim() -replace ':443$','')

if ([string]::IsNullOrWhiteSpace($scmHost)) {
  throw "Publishing host is empty"
}

$remoteUrl = "https://$userEncoded`:$pwdEncoded@$scmHost/$WebAppName.git"

Write-Step "Initializing temporary git repo and pushing to Kudu"
$deployRepo = Join-Path $tempRoot "deploy-repo"
New-Item -ItemType Directory -Path $deployRepo -Force | Out-Null

$copyLog = Join-Path $tempRoot "copy-to-deploy-repo.log"
$copyArgs = @(
  $staging,
  $deployRepo,
  "/E",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP",
  "/LOG:$copyLog"
)

& robocopy @copyArgs | Out-Null
$copyCode = $LASTEXITCODE
if ($copyCode -ge 8) {
  throw "copy to deploy-repo failed with exit code $copyCode. See $copyLog"
}

Push-Location $deployRepo
git init -b main | Out-Null
git config user.name "deploy-bot"
git config user.email "deploy-bot@local"
git add -A
git commit -m "Deterministic backend deploy" | Out-Null
git remote add azure $remoteUrl
git push azure "main:$DeployBranch" --force
Pop-Location

Write-Step "Validating deployment status via Azure"
$latest = $null
$maxAttempts = 30
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  $latest = az webapp log deployment list `
    --resource-group $ResourceGroup `
    --name $WebAppName `
    --query "[0]" `
    -o json | ConvertFrom-Json

  if ($latest -and $latest.status -eq 4) {
    break
  }

  if ($latest -and $latest.status -eq 3) {
    throw "Deployment failed. Latest id: $($latest.id) status: $($latest.status)"
  }

  Start-Sleep -Seconds 5
}

if (-not $latest -or $latest.status -ne 4) {
  throw "Deployment did not reach success state. Latest id: $($latest.id) status: $($latest.status)"
}

$state = az webapp show `
  --resource-group $ResourceGroup `
  --name $WebAppName `
  --query state `
  -o tsv

if ($state -ne "Running") {
  throw "WebApp state is '$state', expected 'Running'"
}

Write-Step "Deployment finished"
Write-Host "Deterministic deploy succeeded via local-git (non-interactive)." -ForegroundColor Green
Write-Host "Latest deployment id: $($latest.id)" -ForegroundColor Green
Write-Host "App state: $state" -ForegroundColor Green
Write-Host "Temporary artifacts kept at: $tempRoot" -ForegroundColor DarkGray
