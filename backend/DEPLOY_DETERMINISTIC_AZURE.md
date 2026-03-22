# Deterministic Azure Deploy (Backend)

This document defines the only supported production deploy flow for `card-social-api`.

## Goal

Use a non-interactive local-git push to Kudu with credentials from Azure CLI publishing profiles, and keep startup fixed to `node src/server.js`.

## Preconditions

- Azure CLI logged in: `az login`
- Correct subscription selected
- Node.js and npm installed locally
- Run from repository root: `card-social`

## One-command deploy

```powershell
./backend/scripts/deploy-deterministic-azure.ps1 \
  -ResourceGroup CardSocial_Group \
  -WebAppName card-social-api
```

## What the script does

1. Creates a clean staging folder (no `node_modules`, no logs, no local env files).
2. Forces deterministic app settings:
  - `WEBSITE_RUN_FROM_PACKAGE=0`
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
   - `ENABLE_ORYX_BUILD=false`
3. Forces startup command to `node src/server.js`.
4. Fetches publishing profile via CLI (`MSDeploy`): `userName`, `userPWD`, `publishUrl`.
5. Builds a temporary git repo from staging and pushes `main -> master` to Kudu remote using credentials embedded in URL.
6. Validates deployment status with `az webapp log deployment list` (`status=4`).
7. Validates app state with `az webapp show` (`Running`).

This avoids the OneDeploy zip extraction bug seen in this environment (`starter.sh` with missing `/tmp/zipdeploy/extracted`).

## Post-deploy smoke checklist

Run these checks after every deploy.

1. Deployment and runtime state:
```powershell
az webapp log deployment list -g CardSocial_Group -n card-social-api --query "[0].{id:id,status:status,message:message,author:author}" -o table
az webapp show -g CardSocial_Group -n card-social-api --query "{state:state,defaultHostName:defaultHostName}" -o table
```
Expected: latest `status = 4` and `state = Running`.

2. (Optional) Health endpoint check from shell:
```powershell
Invoke-WebRequest "https://card-social-api.azurewebsites.net/api/health" -UseBasicParsing
```

3. Moderation token + text moderation:
```powershell
$base='https://card-social-api.azurewebsites.net'
$gateway='<API_GATEWAY_KEY>'
$tokenReq='token-request.json'
$modReq='moderate-request.json'
'{"ownerUid":"qa-live","scope":"moderation.upload"}' | Set-Content -Path $tokenReq -NoNewline
'{"text":"Smoke test moderation"}' | Set-Content -Path $modReq -NoNewline
$tokenJson = az rest --method post --url "$base/api/auth/token" --skip-authorization-header --headers "x-api-gateway-key=$gateway" "Content-Type=application/json" --body "@$tokenReq"
$uploadToken = ($tokenJson | ConvertFrom-Json).token
az rest --method post --url "$base/api/moderate/text" --skip-authorization-header --headers "x-api-gateway-key=$gateway" "Authorization=Bearer $uploadToken" "Content-Type=application/json" --body "@$modReq"
```

4. Admin billing route returns auth error without token (route existence check):
```powershell
$base='https://card-social-api.azurewebsites.net'
$gateway='<API_GATEWAY_KEY>'
az rest --method get --url "$base/api/admin/billing-status" --skip-authorization-header --headers "x-api-gateway-key=$gateway"
```
Expected: `401` or `403` (route exists and auth is enforced).

## Drift guardrails

If these values drift, set them back before deploying:

```powershell
az webapp config appsettings set -g CardSocial_Group -n card-social-api --settings WEBSITE_RUN_FROM_PACKAGE=0 SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false
az webapp config set -g CardSocial_Group -n card-social-api --startup-file "node src/server.js"
```

## Rollback

Keep the previous successful commit/tag and redeploy using the same script.

Alternative emergency rollback with local-git:

```powershell
# Use a known good backend snapshot and push it to Kudu remote:
# git push azure <known-good-commit>:master --force
```
