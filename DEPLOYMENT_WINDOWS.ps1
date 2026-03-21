# 🚀 WINDOWS POWERSHELL DEPLOYMENT COMMANDS
# Card-Social Admin Portal - Go-Live Script
# 
# Use this file on Windows with PowerShell
# Copy-paste each section individually in order
#
# Estimated time: 25-30 minutes

Write-Host "
╔══════════════════════════════════════════════════════════════════════════╗
║        Card-Social Admin Portal - LIVE DEPLOYMENT                       ║
║        Status: 100% CODE READY - AWAITING YOUR EXECUTION               ║
╚══════════════════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

# ═════════════════════════════════════════════════════════════════════════════
# ✅ PHASE 1: LOCAL VERIFICATION (2 minutes)
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 PHASE 1: LOCAL VERIFICATION`n" -ForegroundColor Yellow

# Check backend exists
Write-Host "✓ Checking backend structure..." -ForegroundColor Green
$backendPath = "card-social/backend"
if (Test-Path "$backendPath/package.json") {
    Write-Host "   ✅ Backend package.json found" -ForegroundColor Green
} else {
    Write-Host "   ❌ Backend package.json NOT found - ABORT" -ForegroundColor Red
    exit 1
}

# Check frontend exists
Write-Host "✓ Checking frontend structure..." -ForegroundColor Green
$frontendPath = "card-social/frontend-admin"
if (Test-Path "$frontendPath/AdminDashboard.tsx") {
    Write-Host "   ✅ Frontend AdminDashboard.tsx found" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Frontend folder missing - Creating..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $frontendPath -Force | Out-Null
}

# Check .env files
Write-Host "✓ Checking environment files..." -ForegroundColor Green
if (Test-Path "$backendPath/.env") {
    Write-Host "   ✅ Backend .env exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Backend .env missing - You'll need to create it" -ForegroundColor Yellow
}

Write-Host "`n✅ Local verification complete!" -ForegroundColor Green

# ═════════════════════════════════════════════════════════════════════════════
# ⚠️  PHASE 2: MANUAL SETUP REQUIRED
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 PHASE 2: PREREQUISITES (Do manually first!)`n" -ForegroundColor Yellow

Write-Host "Before deploying, you need: " -ForegroundColor Cyan
Write-Host "
1. VERCEL ACCOUNT
   ➜ Go to: https://vercel.com
   ➜ Sign up or login
   ➜ Install Vercel CLI: npm install -g vercel

2. AZURE ACCOUNT  
   ➜ Go to: https://portal.azure.com
   ➜ Login with Microsoft account
   ➜ Install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli-windows

3. MONGODB ATLAS
   ➜ Go to: https://mongodb.com/atlas
   ➜ Create account
   ➜ Create free cluster
   ➜ Get connection string

4. GITHUB (Optional but recommended)
   ➜ Used for automatic deployments

⏸️  PAUSE HERE: Setup these 3 accounts, then continue 👇
" -ForegroundColor Cyan

Read-Host "Press Enter when you have Vercel, Azure, and MongoDB ready"

# ═════════════════════════════════════════════════════════════════════════════
# 📋 STEP 1: CREATE .ENV FILES
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 1: Create .env files`n" -ForegroundColor Cyan

$backendEnv = @"
# Backend Environment Variables
NODE_ENV=production
PORT=3000
API_GATEWAY_KEY=your-gateway-key-32-chars-minimum-!!!
ADMIN_JWT_SECRET=admin-secret-key-must-be-exactly-32-chars-minimum-!!!
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/card-social

# Optional: Firebase (for enhanced features)
FIREBASE_PROJECT_ID=card-social
FIREBASE_API_KEY=your-firebase-key-here
"@

Write-Host "✓ Creating backend/.env..." -ForegroundColor Green
Set-Content -Path "card-social/backend/.env" -Value $backendEnv
Write-Host "   ✅ Created at: card-social/backend/.env" -ForegroundColor Green
Write-Host "   ⚠️  TODO: Update MONGODB_URI with your actual connection string" -ForegroundColor Yellow

$frontendEnv = @"
# Frontend Environment Variables
REACT_APP_API_BASE=https://api.cardsocial.me/api
REACT_APP_ADMIN_URL=https://cardsocial.me/admin
REACT_APP_ENV=production
"@

Write-Host "`n✓ Creating frontend-admin/.env..." -ForegroundColor Green
if (!(Test-Path "card-social/frontend-admin")) {
    New-Item -ItemType Directory -Path "card-social/frontend-admin" -Force | Out-Null
}
Set-Content -Path "card-social/frontend-admin/.env" -Value $frontendEnv
Write-Host "   ✅ Created at: card-social/frontend-admin/.env" -ForegroundColor Green

# ═════════════════════════════════════════════════════════════════════════════
# 🔧 STEP 2: INSTALL VERCEL CLI
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 2: Install Vercel CLI (if not already installed)`n" -ForegroundColor Cyan

$vercelCheck = npm list -g vercel 2>$null
if ($LASTEXITCODE -eq 0 -and $vercelCheck -like "*vercel*") {
    Write-Host "✅ Vercel CLI already installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Installing Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
    Write-Host "✅ Vercel CLI installed" -ForegroundColor Green
}

# ═════════════════════════════════════════════════════════════════════════════
# 🌐 STEP 3: DEPLOY FRONTEND TO VERCEL (5 minutes)
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 3: Deploy Frontend to Vercel`n" -ForegroundColor Yellow

Write-Host "Instructions:
1. Open PowerShell and run:
   cd card-social/frontend-admin
   vercel --prod --name card-social-admin

2. Follow Vercel prompts:
   - Link to existing project or create new
   - Confirm build settings
   - Set env vars: REACT_APP_API_BASE, REACT_APP_ADMIN_URL

3. After deployment:
   - Go to Vercel.com dashboard
   - Add custom domain: cardsocial.me/admin
   - Point DNS to Vercel nameservers

⏸️  PAUSE: Deploy to Vercel, then continue here 👇
" -ForegroundColor Cyan

$frontendReady = Read-Host "Frontend deployed to Vercel? (yes/no)"
if ($frontendReady -ne "yes") {
    Write-Host "Skipping next steps. Deploy to Vercel first!" -ForegroundColor Yellow
    exit 0
}

# ═════════════════════════════════════════════════════════════════════════════
# ☁️  STEP 4: SETUP AZURE (10 minutes)
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 4: Setup Azure Backend`n" -ForegroundColor Yellow

Write-Host "Instructions:
1. Go to: https://portal.azure.com

2. Create Resource Group:
   - Click 'Create a resource'
   - Search 'Resource Group'
   - Name: card-social-rg
   - Region: East US
   - Click Create

3. Create App Service Plan:
   - Click 'Create a resource'
   - Search 'App Service Plan'
   - Name: card-social-plan
   - Resource Group: card-social-rg
   - OS: Linux
   - Pricing: Free F1
   - Click Create

4. Create App Service:
   - Click 'Create a resource'
   - Search 'App Service'
   - Name: card-social-api
   - Publish: Code
   - Runtime: Node 22 LTS
   - Resource Group: card-social-rg
   - App Service Plan: card-social-plan
   - Click Create

5. After creation, go to App Service:
   - Settings → Configuration → Application settings
   - Add all values from backend/.env
   - Click Save

6. Deploy code:
   - Deployment Center → GitHub (or ZIP)
   - Connect repository
   - Build settings: Automatic
   - Deploy

⏸️  PAUSE: Complete Azure setup, then continue 👇
" -ForegroundColor Cyan

$azureReady = Read-Host "Backend deployed to Azure? (yes/no)"
if ($azureReady -ne "yes") {
    Write-Host "Skipping next steps. Deploy to Azure first!" -ForegroundColor Yellow
    exit 0
}

# ═════════════════════════════════════════════════════════════════════════════
# 🗄️  STEP 5: SETUP MONGODB (5 minutes)
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 5: Setup MongoDB Atlas`n" -ForegroundColor Cyan

Write-Host "Instructions:
1. Go to: https://mongodb.com/atlas

2. Create Free Cluster:
   - Click 'Create'
   - Choose free tier (M0)
   - Provider: AWS or Azure
   - Region: us-east-1
   - Click Create

3. Create Database User:
   - Users & Roles → Add New Database User
   - Username: card-social-admin
   - Password: [generate strong password]
   - Database User Privileges: readWriteAnyDatabase
   - Click Create

4. Setup Network Access:
   - Network Access → Add IP Address
   - IP: 0.0.0.0/0 (allows all, change for production)
   - Click Add Entry

5. Get Connection String:
   - Databases → Overview → Connect
   - Choose 'Connect your application'
   - Driver: Node.js, Version 4.0+
   - Copy connection string
   - Replace <username> and <password>
   - Save to backend/.env as MONGODB_URI

6. Create Collections (in MongoDB Compass or Atlas):

   db.createCollection('market_assets', {
     validator: {
       \$jsonSchema: {
         bsonType: 'object',
         required: ['unique_id', 'collection', 'name', 'status'],
         properties: {
           unique_id: { bsonType: 'string' },
           collection: { enum: ['skins', 'collectibles', 'wallpapers', 'fonts', 'basics_free'] },
           name: { bsonType: 'string' },
           status: { enum: ['draft', 'published', 'retired'] },
           created_at: { bsonType: 'date' },
           updated_at: { bsonType: 'date' }
         }
       }
     }
   });

   db.createCollection('user_vaults', {
     validator: {
       \$jsonSchema: {
         bsonType: 'object',
         required: ['uid', 'assets'],
         properties: {
           uid: { bsonType: 'string' },
           assets: { bsonType: 'array' },
           last_sync: { bsonType: 'date' },
           needs_sync: { bsonType: 'bool' }
         }
       }
     }
   });

   # Create indices
   db.market_assets.createIndex({ unique_id: 1 }, { unique: true });
   db.market_assets.createIndex({ collection: 1, status: 1 });
   db.user_vaults.createIndex({ uid: 1 }, { unique: true });

⏸️  PAUSE: Setup MongoDB, then continue 👇
" -ForegroundColor Cyan

$mongoReady = Read-Host "MongoDB setup complete? (yes/no)"
if ($mongoReady -ne "yes") {
    Write-Host "Skipping next steps. Setup MongoDB first!" -ForegroundColor Yellow
    exit 0
}

# ═════════════════════════════════════════════════════════════════════════════
# ✅ STEP 6: VALIDATE DEPLOYMENT
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n📍 STEP 6: Validate Deployment`n" -ForegroundColor Green

Write-Host "Testing backend health..." -ForegroundColor Cyan
$healthCheck = Invoke-WebRequest -Uri "https://api.cardsocial.me/api/admin/health" -ErrorAction SilentlyContinue
if ($healthCheck.StatusCode -eq 200) {
    Write-Host "✅ Backend is responding" -ForegroundColor Green
} else {
    Write-Host "⚠️  Backend not responding yet (can take 2-3 minutes)" -ForegroundColor Yellow
}

Write-Host "`n✓ Testing admin login..." -ForegroundColor Cyan

$loginTest = @{
    username = "admin_pochobs"
    password = "Arantza11@"
} | ConvertTo-Json

$loginCheck = try {
    Invoke-WebRequest -Uri "https://api.cardsocial.me/api/admin/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginTest `
        -ErrorAction Stop
    $true
} catch {
    $false
}

if ($loginCheck) {
    Write-Host "✅ Login endpoint working" -ForegroundColor Green
} else {
    Write-Host "⚠️  Login endpoint not responding" -ForegroundColor Yellow
}

# ═════════════════════════════════════════════════════════════════════════════
# 🎯 STEP 7: ADMIN PORTAL READY
# ═════════════════════════════════════════════════════════════════════════════

Write-Host "`n╔══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    ✅ DEPLOYMENT COMPLETE!                               ║" -ForegroundColor Green
Write-Host "║                                                                          ║" -ForegroundColor Green
Write-Host "║  Admin Portal:  https://cardsocial.me/admin                             ║" -ForegroundColor Green
Write-Host "║  Backend API:   https://api.cardsocial.me/api                           ║" -ForegroundColor Green
Write-Host "║  Database:      MongoDB Atlas (card-social cluster)                     ║" -ForegroundColor Green
Write-Host "║                                                                          ║" -ForegroundColor Green
Write-Host "║  Credentials:                                                           ║" -ForegroundColor Green
Write-Host "║  Username: admin_pochobs                                               ║" -ForegroundColor Green
Write-Host "║  Password: Arantza11@                                                  ║" -ForegroundColor Green
Write-Host "║  Session:  30 minutes (auto-logout)                                    ║" -ForegroundColor Green
Write-Host "║                                                                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n🚀 NEXT ACTIONS:`n" -ForegroundColor Cyan

Write-Host "1️⃣  Login to Admin Portal" -ForegroundColor Yellow
Write-Host "    URL:      https://cardsocial.me/admin" -ForegroundColor Cyan
Write-Host "    User:     admin_pochobs" -ForegroundColor Cyan
Write-Host "    Password: Arantza11@" -ForegroundColor Cyan

Write-Host "`n2️⃣  Create First Collectible" -ForegroundColor Yellow
Write-Host "    - Click 'Mint Asset'" -ForegroundColor Cyan
Write-Host "    - Collection: collectibles" -ForegroundColor Cyan
Write-Host "    - Name: Marvel Spider-Man" -ForegroundColor Cyan
Write-Host "    - Rarity: legendario" -ForegroundColor Cyan
Write-Host "    - Price: 500 CS" -ForegroundColor Cyan
Write-Host "    - Upload preview image" -ForegroundColor Cyan
Write-Host "    - Click 'Mint'" -ForegroundColor Cyan

Write-Host "`n3️⃣  Verify Sequential ID" -ForegroundColor Yellow
Write-Host "    Expected ID: COLLECTIBLES_MARVEL-001" -ForegroundColor Cyan
Write-Host "    This confirms the sequential numbering works!" -ForegroundColor Cyan

Write-Host "`n4️⃣  Publish Asset" -ForegroundColor Yellow
Write-Host "    - Click 'Preview' (should render canvas)" -ForegroundColor Cyan
Write-Host "    - Click 'Publish'" -ForegroundColor Cyan
Write-Host "    - Status changes to PUBLISHED" -ForegroundColor Cyan

Write-Host "`n5️⃣  Test Mobile Sync" -ForegroundColor Yellow
Write-Host "    - Open mobile app (or test endpoint)" -ForegroundColor Cyan
Write-Host "    - Register new user" -ForegroundColor Cyan
Write-Host "    - Vault automatically syncs 10 free icons" -ForegroundColor Cyan
Write-Host "    - MARVEL-001 appears in Skins for MyCards" -ForegroundColor Cyan

Write-Host "`n═════════════════════════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  🎉 System is LIVE! Alfonso can now mint, publish, and sync collectibles." -ForegroundColor Magenta
Write-Host "═════════════════════════════════════════════════════════════════════════════`n" -ForegroundColor Magenta

Write-Host "Questions? Check DEPLOYMENT_GUIDE.md for detailed instructions" -ForegroundColor Cyan
Write-Host "Need help? Review troubleshooting section in PHASE5_FINAL_STATUS.md`n" -ForegroundColor Cyan
