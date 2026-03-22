# 🎨 Card-Social Admin Portal
## Deployable at: `cardsocial.me/admin`

### Quick Start

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build producción
npm run build
```

---

## 🔐 Autenticación

**Credenciales Admin:**
- Usuario: `admin_pochobs`
- Contraseña: `Arantza11@`

**Seguridad:**
- Login con JWT Bearer Token
- Sesión con expiración: **30 minutos**
- tokens guardados en localStorage (se borran al logout/expiración)
- Gateway Key validation en backend

---

## 📊 Características

### 1. Dashboard
- Panel de control principal
- Estadísticas de assets (total, published, drafts)
- Acceso rápido a todas las secciones

### 2. CARD-STUDIO
- Interface para crear nuevos assets (Skins, Collectibles, Wallpapers, Fonts)
- Carga de archivos:
  - Wallpaper vertical/horizontal
  - Hasta 24 iconos
  - Font personalizada
  - Preview de miniatura
- Generador automático de ID: `[COLLECTION]_[NAME]-[###]`

### 3. Real-Time Preview
- Compone en tiempo real:
  - Wallpaper de fondo
  - Grid dinámico de iconos (4 columnas)
  - Fuente personalizada aplicada
- Canvas-based rendering
- Exporta PNG en alta resolución

### 4. Publish Asset
- Transición DRAFT → PUBLISHED
- Inicializa contadores de stock según colección
- Activa distribución inmediata

### 5. Estadísticas
- Desglose por colección
- Total de assets vs publicados vs borradores
- Visualización en tiempo real

---

## 🔄 Backend API Endpoints

### Authentication
```
POST /api/admin/login
Body: { username, password }
Response: { token, expires_in, token_type }
```

### Asset Management
```
POST /api/admin/mint_asset
Headers: Authorization: Bearer {token}
Form-Data: collection, name, rarity, price_cs, files

POST /api/admin/publish_asset
Headers: Authorization: Bearer {token}
Body: { mint_id, confirm_ready }

GET /api/admin/assets
Headers: Authorization: Bearer {token}
Query: ?collection=skins&status=published

GET /api/admin/stats
Headers: Authorization: Bearer {token}

GET /api/admin/preview/:mint_id
Headers: Authorization: Bearer {token}
Response: PNG image buffer
```

---

## 🏗️ Arquitectura

### Frontend Stack
- React 18+ (TypeScript)
- Session management con JWT
- Canvas-based preview rendering
- Responsive design (mobile + desktop)

### Backend Stack
- Express.js
- MongoDB (market_assets collection)
- bcryptjs (password hashing)
- jsonwebtoken (JWT)
- multer (file uploads)
- Azure Content Safety (moderation)

### Seguridad
- JWT Bearer Token con 30min expiry
- bcryptjs password hashing (admin_pochobs)
- Gateway Key validation en middleware
- CORS enablement
- File upload size limits (50MB max)

---

## 📋 ID Format Specification

Format: `[COLLECTION]_[NAME]-[###]`

Ejemplos:
- `SKINS_MARVEL-001`
- `COLLECTIBLES_BIRTHDAY-042`
- `WALLPAPERS_NEONEGG-007`
- `FONTS_COMIC-099`

**Componentes:**
- `[COLLECTION]`: skins, collectibles, wallpapers, fonts (UPPERCASE)
- `[NAME]`: Nombre del asset sin espacios (UPPERCASE)
- `[###]`: Número serial de edición (padded 3 dígitos: 001-100 para collectibles, 001-1000 para skins)

---

## 🎨 Rareza Levels

- **gratis**: Free tier (0 CS)
- **comun**: Common (15-50 CS)
- **lujo**: Luxury (75-200 CS)
- **legendario**: Legendary (300-500 CS)
- **coleccionable**: Collectible (Edition limited, configurable)

---

## 🚀 Deployment

### Vercel (Recomendado para Frontend Admin)
```bash
# package.json
{
  "name": "card-social-admin",
  "version": "1.0.0",
  "scripts": {
    "build": "typescript && react-scripts build",
    "start": "react-scripts start"
  }
}

# Deploy
vercel --prod --target=production
```

### Backend (Azure App Service)
```bash
# Backend runs as Express API
# Connect to MongoDB Atlas URI
# Set env vars: ADMIN_JWT_SECRET, MONGODB_URI, etc.

npm start
```

---

## 🛠️ Environment Variables

**Frontend (.env)**
```
REACT_APP_API_BASE=https://api.cardsocial.me/api
REACT_APP_ADMIN_URL=https://cardsocial.me/admin
```

**Backend (.env)**
```
ADMIN_JWT_SECRET=your-secret-key-30-chars-min
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/card-social
ADMIN_PASSWORD_HASH=bcrypt(Arantza11@)
API_GATEWAY_KEY=your-gateway-key
AZURE_CONTENT_SAFETY_KEY=your-key
```

---

## 📸 Screenshots Flow

1. **Login**: Formulario con credenciales seguras
2. **Dashboard**: Overview de assets y acciones rápidas
3. **CARD-STUDIO**: Form con carga de archivos
4. **Preview**: Canvas en tiempo real con composición
5. **Publish**: Confirmación final y distribución

---

## 🔧 Troubleshooting

### "Invalid credentials"
- Verifica usuario: `admin_pochobs`
- Verifica contraseña: `Arantza11@`
- Comprueba el hash en DB

### "Token expired"
- Sesión tiene límite de 30 minutos
- Vuelve a iniciar sesión

### "Preview not rendering"
- Verifica URLs de imágenes (CORS enabled)
- Comprueba formato de archivos (PNG/JPG)
- Limpia cache del navegador

### "File upload failed"
- Máximo 50MB por archivo
- Formatos aceptados: PNG, JPG, OTF, TTF
- Verifica permisos de Azure Blob Storage

---

## 📝 Changelog

### v1.0.0 (2026-03-21)
- ✅ Login con JWT 30min expiry
- ✅ CARD-STUDIO con file uploads
- ✅ Real-time preview renderer
- ✅ Publish asset workflow
- ✅ Statistics & analytics
- ✅ Session management

---

## 📞 Support

Para preguntas o issues, contacta al team de Card-Social.

---

**© 2026 Card-Social. All rights reserved.**
