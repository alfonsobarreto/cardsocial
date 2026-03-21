# 🎨 ICON PACKS SETUP - GUÍA PARA POCHOBS

## // LIMPIEZA DOCUMENTAL (2026-03-21)
// ESTADO: Documento activo de operación de tienda.
// INACTIVO: Cualquier mención heredada de premium mensual debe considerarse histórica.

Alfonso, tu **Tienda de Iconos** está lista para operar. Aquí está cómo funciona:

---

## 📊 MODELO DE NEGOCIO

### Usuarios Gratis
- 👁️ **Ven**: Todos los packs disponibles en la tienda
- 💳 **Compran**: Con créditos CS (50-100 CS por pack)
- 🎁 **Obtienen**: Acceso permanente a ese pack de iconos
- 📂 **Usan**: Los iconos del pack en sus tarjetas y bóveda

### Usuarios Premium
- 💎 **Acceso**: Todos los packs desbloqueados automáticamente
- 🎁 **No necesitan**: Gastar créditos
- ✨ **Beneficio**: Diseño exclusivo sin restricciones

### Pochobs (Admin)
- 🎨 **Sube**: Diseños 3D/PNG/GIF a Firebase Storage
- 📁 **Categoriza**: communication, social, payment, custom, premium
- 💰 **Fija precio**: En créditos CS por pack
- 📊 **Monitorea**: Popularidad (total de ventas)

---

## 🔧 PASO 1: CREAR UN ICON PACK EN FIRESTORE

Un "Icon Pack" es un contenedor que agrupa múltiples iconos relacionados.

### Estructura en Firestore:
```
Collection: icon_packs
Document: {packId}
{
  "name": "3D Neon Pack",
  "description": "Iconos 3D con efecto neón brillante",
  "category": "premium",  // communication | social | payment | custom | premium
  "iconCount": 12,
  "creditsPrice": 85,  // Costo en Créditos CS
  "previewImages": [
    "https://firebasestorage.../preview1.png",
    "https://firebasestorage.../preview2.png"
  ],
  "folderPath": "premium-icons/3d-neon-pack/",  // Ruta en Firebase Storage
  "rarity": "epic",  // common | rare | epic | legendary
  "createdBy": "Pochobs_UID",
  "createdAt": Timestamp.now(),
  "isActive": true,
  "totalSales": 0  // Se incrementa con cada compra
}
```

### Pasos para crear un pack:
1. Ve a: [Firebase Console](https://console.firebase.google.com)
2. Proyecto: `card-social-app`
3. Firestore Database → Collection `icon_packs`
4. Click "Add document"
5. **Document ID**: Usa un ID único (ej: `3d-neon-pack-2026`)
6. Llena los campos según la estructura arriba

---

## 🎨 PASO 2: PREPARAR TUS DISEÑOS

### Formato de Archivos:
- ✅ PNG (recomendado - transparencia)
- ✅ GIF (para iconos animados)
- ❌ JPG (no soportado - sin transparencia)

### Dimensiones:
- **Min**: 128x128 px
- **Recomendado**: 256x256 px
- **Max**: 512x512 px

### Peso:
- **Máximo**: 2MB por icono
- **Recomendado**: < 500KB comprimido

### Naming Convention:
```
{packId}/{category}/{descriptiveFileName}.png

Ejemplos:
  3d-neon-pack/communication/phone-neon.png
  3d-neon-pack/communication/email-neon.png
  3d-neon-pack/social/instagram-neon.png
  minimal-set/communication/phone-clean.png
```

---

## 📤 PASO 3: SUBIR ICONOS A FIREBASE STORAGE

### Opción A: Desde Admin Dashboard (Recomendado)

1. **Login** con `pochobs@gmail.com`
2. **Drawer** → "🎨 Tienda de Iconos" ← ¡NUEVA SECCIÓN!
3. **Aquí aparecerá**: Un botón para crear nuevos packs
4. **Upload**: PNG/GIF con categoria + tipo (Free/Premium)
5. **Automático**: Se guarda en `/free-icons/` o `/premium-icons/`

### Opción B: Firebase Console Directa

1. [Firebase Console](https://console.firebase.google.com) → Storage
2. Navega a `/free-icons/community/` o `/premium-icons/`
3. Click "Upload file" o "Upload folder"
4. Sube tus archivos PNG/GIF

---

## 💻 PASO 4: CREAR PACK DESDE FIRESTORE MANUALMENTE

Si prefieres crear el pack manualmente en Firestore:

1. Firebase Console → Firestore Database
2. Collection: `icon_packs`
3. Document: Auto-generate ID (haz clic en "Auto-generate")
4. Copia/pega esta estructura:

```json
{
  "category": "premium",
  "createdAt": "2026-03-21T14:30:00.000Z",
  "createdBy": "pochobs_super_admin_uid",
  "creditsPrice": 85,
  "description": "Iconos 3D con efecto neón brillante para usuarios premium",
  "folderPath": "premium-icons/3d-neon-pack/",
  "iconCount": 12,
  "isActive": true,
  "name": "3D Neon Pack",
  "previewImages": [
    "https://firebasestorage.googleapis.com/v0/b/card-social-app.firebasestorage.app/o/premium-icons%2F3d-neon-pack%2Fpreview.png?alt=media"
  ],
  "rarity": "epic",
  "totalSales": 0
}
```

---

## 🎁 STEP 5: TESTING - VERIFICAR QUE TODO FUNCIONA

### Test como Usuario Gratis:
1. Crea una cuenta TEST con otro email
2. Haz que confirme el pago (para recibir 100 CS de welcome bonus)
3. Abre drawer → "🎨 Tienda de Iconos"
4. **Verás**: Grid de packs disponibles con precios en CS
5. **Haz clic**: "Comprar" en un pack (si tienes suficientes CS)
6. ✅ **Confirma**: Se deducen los CS y pack aparece como "Comprado"

### Test como Premium:
1. Usa cuenta premium
2. Abre "🎨 Tienda de Iconos"
3. **Verás**: Todos los packs con badge "Premium +"
4. **Sin costo**: No se puede comprar (ya incluído)

### Test de Iconos en Vault:
1. Ve a **Vault**
2. Crea nuevo dato (type: link)
3. Al seleccionar icono: Debería mostrar tus packs comprados
4. ✅ **Confirma**: Iconos se renderizan correctamente

---

## 📊 ESTADÍSTICAS Y MONITOREO

### Ver Popularidad de Packs:
1. Firebase Console → Firestore
2. Collection: `icon_packs`
3. Campo: `totalSales` se incrementa automáticamente con cada compra

### Ejemplo de Data que ves:
```
Pack: "3D Neon Pack"
- totalSales: 24 (vendidos 24 veces)
- creditsPrice: 85 CS
- Ingresos teóricos: 24 × 85 = 2,040 CS
```

---

## 💡 RECOMENDACIONES DE PACKS (MVP)

### Pack #1: "Essentials Free"
- **Price**: 0 CS (incluído por defecto)
- **Rarity**: common
- **Icons**: 20 básicos (phone, email, instagram, facebook, etc)
- **Target**: Todos los usuarios

### Pack #2: "Premium 3D"
- **Price**: 75 CS
- **Rarity**: epic
- **Icons**: 15 iconos 3D animados
- **Target**: Usuarios gratis que quieren lujo

### Pack #3: "Business Minimal"
- **Price**: 60 CS
- **Rarity**: rare
- **Icons**: 12 iconos minimalistas profesionales
- **Target**: Usuarios con tarjetas de negocio

### Pack #4: "Legendary Rainbow" (Premium only)
- **Price**: N/A (Premium automático)
- **Rarity**: legendary
- **Icons**: 20 iconos con gradientes arcoíris
- **Target**: Usuarios Premium exclusivo

---

## 🚀 PRÓXIMAS ACCIONES

1. **Hoy**:
   - [ ] Prepara tus primeros diseños (12-20 PNG/GIF)
   - [ ] Decide nombres y precios de 2-3 packs

2. **Mañana**:
   - [ ] Crea primeros packs en Firestore
   - [ ] Sube iconos a Firebase Storage
   - [ ] Test en Admin Dashboard

3. **Esta semana**:
   - [ ] Crea 3-4 packs distintos (Free + Premium mix)
   - [ ] Test como usuario gratis: compra un pack
   - [ ] Verifica deducción de CS e iconos se ven en Vault

4. **Escalabilidad Futura**:
   - [ ] Crear packs temáticos (Halloween, Christmas, etc)
   - [ ] Colecciones limitadas (edición) con rarity épica
   - [ ] Colaboración con diseñadores externos

---

## ⚠️ REGLAS ESTRICTAS

✅ **Debe cumplirse**:
- Todos los iconos son PNG/GIF con transparencia
- Cada icono respeta dimensión 256x256 px ±
- Los nombres de archivos son descriptivos (no "icon1.png")
- Los packs están en categorías específicas (no "custom" random)

❌ **NO permitido**:
- Iconos con derechos de autor (sin permiso)
- Contenido NSFW o violento
- Pesos mayores a 2MB por archivo
- Rutas de carpetas inconsistentes

---

## 🎯 ENDPOINT TÉCNICO PARA CREAR PACKS

Si prefieres crear packs por código (desde tu backend/script):

```javascript
import { createIconPack } from '@/services/iconPackService';

const newPack = await createIconPack(userId, {
  name: '3D Neon Pack',
  description: 'Iconos 3D con efecto neón brillante',
  category: 'premium',
  iconCount: 12,
  creditsPrice: 85,
  previewImages: ['https://...preview1.png'],
  folderPath: 'premium-icons/3d-neon-pack/',
  rarity: 'epic',
  isActive: true,
});

// Resultado: { packId: '3d-neon-pack-2026' }
```

---

## 📞 SOPORTE

Si algo no funciona:

1. **Iconos no aparecer en Vault**: Verifica que carpeta exista en Firebase Storage
2. **Compra falla**: Asegúrate de que el usuario tiene suficientes CS
3. **Pack no se muestra**: Verifica `isActive: true` en Firestore

¡**Tu mercado de diseños está listo!** 🎨👑

```plaintext
┌─────────────────────────────────────┐
│  Tienda de Iconos de Card-Social    │
│                                     │
│  ✅ Estructura: Firestore + Storage │
│  ✅ Economía: Créditos CS           │
│  ✅ Admin: Crear + Subir desde APP  │
│  ✅ Usuarios: Comprar + Usar        │
│                                     │
│  Status: READY FOR LAUNCH 🚀        │
└─────────────────────────────────────┘
```
