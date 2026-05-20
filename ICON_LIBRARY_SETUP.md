# 🎨 SISTEMA DE ESTÉTICA DINÁMICA - GUÍA DE CONFIGURACIÓN

## // LIMPIEZA DOCUMENTAL (2026-03-21)
// ESTADO: Documento activo de configuración técnica.
// INACTIVO: Ningún bloque marcado en esta limpieza.

## 📁 ESTRUCTURA FIREBASE STORAGE

Tu Firebase Storage debe tener esta estructura exacta:

```
bucket: card-social-app.firebasestorage.app
│
├── free-icons/                  ← Iconos gratuitos (visible para todos)
│   ├── communication/           ← Categoría
│   │   ├── phone-default.png
│   │   ├── email-default.png
│   │   ├── whatsapp.png
│   │   └── telegram.png
│   │
│   ├── social/                  ← Categoría
│   │   ├── instagram-default.png
│   │   ├── facebook.png
│   │   ├── twitter.png
│   │   └── tiktok.png
│   │
│   ├── payment/                 ← Categoría
│   │   ├── paypal.png
│   │   ├── stripe.png
│   │   └── bitcoin.png
│   │
│   └── custom/                  ← Categoría
│       └── generic-icon.png
│
└── premium-icons/               ← Iconos premium (solo usuarios Premium)
    ├── communication/
    │   ├── signal.png
    │   ├── viber.png
    │   └── skype.png
    │
    ├── social/
    │   ├── linkedin.png
    │   ├── youtube.png
    │   └── reddit.png
    │
    ├── payment/
    │   ├── apple-pay.png
    │   ├── google-pay.png
    │   └── crypto-premium.png
    │
    └── branding/
        ├── card-social-logo.png
        └── pochobs-signature.png
```

---

## ✅ PASO 1: ACCEDER A FIREBASE STORAGE

1. **Ve a**: [Firebase Console](https://console.firebase.google.com)
2. **Proyecto**: `card-social-app`
3. **Sección**: `Storage`
4. **Verás**: Un botón azul "Start" o ya estarás en la vista de archivos

---

## ✅ PASO 2: CREAR ESTRUCTURA DE CARPETAS (MANUALMENTE PRIMERO)

Firebase Storage no tiene "crear carpetas" como un filesystem normal.
**Los folders se crean automáticamente cuando subes archivos.**

**Pero para que sea limpio, vamos a crear la estructura:**

1. Toca el botón **"Crear carpeta"** (o simplemente sube archivos con path)
2. Crea estas carpetas raíz primero:
   - `free-icons`
   - `premium-icons`

3. Dentro de `free-icons`, crea estas subcarpetas:
   - `communication`
   - `social`
   - `payment`
   - `custom`

4. Dentro de `premium-icons`, crea las mismas subcarpetas

---

## ✅ PASO 3: SUBIR ICONOS USANDO TU ADMIN DASHBOARD

**Ahora la forma fácil: Usa el Admin Dashboard de Card-Social**

1. **Inicia sesión** con tu cuenta (`pochobs@gmail.com`)
2. **Abre el drawer** (3 líneas)
3. **Toca "Promociones QR 👑"** → Admin Dashboard
4. **Click en tab "Icons"** (el último tab con icono de paleta)
5. **Panel "Admin Icon Uploader" aparece 💎**

### Interfaz del Uploader:

```
┌─ Icon Library Manager
│
├─ 📷 Seleccionar Imagen
│  └─ [Selecciona PNG o GIF desde tu galería]
│
├─ 🏷️ Tipo de Icono
│  ├─ Gratis (Free) - Todos lo ven
│  └─ Premium - Solo usuarios Premium
│
├─ 📁 Categoría
│  ├─ communication
│  ├─ social
│  ├─ payment
│  ├─ custom
│  └─ [+] Crear nueva categoría
│
└─ [Subir Icono a Firebase] ← Click para subir
```

### Ejemplo de Flujo:

1. **Seleccionar Imagen** → Tapa en el área de dashed border → Elige `whatsapp.png`
2. **Tipo** → Toca "Gratis" (porque es un icono común)
3. **Categoría** → Toca "communication"
4. **Ruta Final**: `/free-icons/communication/whatsapp.png`
5. **Subir** → Click "Subir Icono a Firebase"
6. ✅ **Confirmación**: "Icono subido exitosamente"

---

## ✅ PASO 4: VERIFICAR EN FIREBASE CONSOLE

Después de subir desde tu Admin Dashboard:

1. **Firebase Console** → `Storage`
2. **Navega**: `free-icons/communication/`
3. **Verás**: `whatsapp.png` + otros que hayas subido
4. **Cada icono tiene**: URL de descarga pública (acceso directo)

---

## 🎯 RECOMENDACIONES DE ICONOS

### FREE ICONS (Base):
```
communication/
  ✓ phone-default.png (OBLIGATORIO para Default Data)
  ✓ email-default.png (OBLIGATORIO para Default Data)
  ✓ whatsapp.png
  ✓ telegram.png
  ✓ messenger.png
  ✓ viber.png

social/
  ✓ instagram-default.png (OBLIGATORIO para Default Data)
  ✓ facebook.png
  ✓ twitter.png
  ✓ youtube.png
  ✓ tiktok.png
  ✓ snapchat.png

payment/
  ✓ paypal.png
  ✓ stripe.png
  ✓ credit-card.png
  ✓ bitcoin.png
  ✓ ethereum.png

custom/
  ✓ generic-icon.png (Fallback para cualquier dato)
```

### PREMIUM ICONS (Exclusivos):
```
communication/
  ✓ signal.png
  ✓ threema.png
  ✓ wickr.png

social/
  ✓ linkedIn.png
  ✓ reddit.png
  ✓ medium.png

payment/
  ✓ apple-pay.png
  ✓ google-pay.png
  ✓ square-cash.png

branding/
  ✓ card-social-logo.png
  ✓ pochobs-signature.png
  ✓ vip-badge.png
```

---

## 🔐 PERMISOS FIREBASE STORAGE

Tu Storage debe tener estas reglas (ya están configuradas):

```json
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Iconos son públicos (lectura para todos)
    match /{allPaths=**} {
      allow read;
      allow write: if request.auth.uid != null;
    }
  }
}
```

Esto significa:
- ✅ **Lectura**: Cualquiera puede descargar iconos (públicos)
- ✅ **Escritura**: Solo usuarios autenticados (tú via Admin)
- ✅ **Super Admin**: Tu código valida `super_admin` antes de upload

---

## 🚀 FLUJO COMPLETO END-TO-END

```
1. POCHOBS SUBO ICONO
   └─ Admin Dashboard → Tab "Icons"
      └─ AdminIconUploader
         └─ Selecciona: PNG + Tipo + Categoría
            └─ Click "Subir"
               └─ uploadIconAsAdmin() + Firebase Storage
                  └─ ✅ Guardado en /free-icons/{cat}/ o /premium-icons/{cat}/

2. USUARIO GRATIS VE SOLO FREE ICONS
   └─ getAvailableIcons()
      └─ Valida isPremium
         └─ Solo retorna free-icons/
            └─ UI muestra grid de iconos gratis

3. USUARIO PREMIUM VE FREE + PREMIUM
   └─ getAvailableIcons()
      └─ Valida isPremium
         └─ Retorna free-icons/ + premium-icons/
            └─ UI muestra grid COMPLETO (todo desbloqueado)

4. DEFAULT DATA NACE CON ICONO FREE
   └─ createDefaultVaultData(uid)
      └─ Para cada dato (teléfono, email, social)
         └─ Busca DefaultIconAssignment
            └─ Asigna iconPath = "/free-icons/{category}/{file}"
               └─ Se guarda en Firestore
                  └─ UI renderiza con icono automáticamente
```

---

## 📊 CARACTERÍSTICAS IMPLEMENTADAS

✅ **Icon Library Service** (`iconLibraryService.ts`)
- `getFreeIcons()` - Lista todos los iconos gratis
- `getPremiumIcons()` - Lista iconos premium (con validación)
- `getAvailableIcons()` - Inteligente: retorna free o free+premium según rol
- `getIconsByCategory()` - Filtra por categoría
- `uploadIconAsAdmin()` - ADMIN ONLY: sube nuevos iconos
- `getIconCategories()` - Lista todas las categorías

✅ **Admin Icon Uploader** (`AdminIconUploader.tsx`)
- UI hermosa para subir PNGs/GIFs
- Selector de Tipo (Free/Premium)
- Selector de Categoría (con opción crear nuevas)
- Progress de upload
- Validación de admin role

✅ **Default Icon Assignments** (`defaultIconAssignments.ts`)
- Mapeo automático: Phone → /free-icons/communication/phone-default.png
- Email → /free-icons/communication/email-default.png
- Social → /free-icons/social/instagram-default.png

✅ **Firebase Storage Integration**
- Storage agregado a `firebaseConfig.ts`
- Rutas públicas: `/free-icons/` y `/premium-icons/`
- Download URLs automáticas para cada archivo

---

## 🎁 PRÓXIMOS PASOS PARA TI

1. **Hoy**:
   - [ ] Crea estructura de carpetas en Firebase Storage (manualmente o via uploader)
   - [ ] Sube tus primeros 3 iconos: phone-default.png, email-default.png, instagram-default.png

2. **Esta semana**:
   - [ ] Crea icons para todas las categorías (communication, social, payment, custom)
   - [ ] Crea versiones Premium (signal, linkedin, apple-pay, etc)

3. **Escalabilidad**:
   - [ ] Los usuarios Premium ven tu librería completa
   - [ ] Usuarios gratis solo ven los 3 por defecto + categoría free
   - [ ] Puedes monetizar diseños premium en el futuro ($1.99 por pack de 5 icons)

---

## 💬 PREGUNTAS FRECUENTES

**P: ¿Necesito crear las carpetas?**
A: Tecnicamente no, Firebase crea las carpetas cuando subes archivos. Pero recomiendo crearlas primero para una estructura limpia.

**P: ¿Qué tamaño de archivo debo usar?**
A: PNG 256x256px o 512x512px. GIF animado también funciona (max 5MB recomendado).

**P: ¿Cuál es el límite de ionos?**
A: Sin límite técnico. Firebase Storage tier gratis ofrece 5GB storage.

**P: ¿Puedo cambiar un icono después?**
A: Sí, simplemente sube uno nuevo con el mismo nombre y sobrescribe la versión vieja.

---

## ✅ CONFIRMACIÓN FINAL

**Alfonso, está todo listo. Las carpetas en Firebase Storage están conectadas.**

**Tus acciones:**
1. ✅ Abre Admin Dashboard (Tab "Icons")
2. ✅ Uploads tus primeros diseños
3. ✅ Verás que se guardan automáticamente en Firebase Storage
4. ✅ Los usuarios gratis/premium ven los iconos según su rol

**Ruta final de cada icono que subas:**
```
https://firebasestorage.googleapis.com/v0/b/card-social-app.firebasestorage.app/o/
{free|premium}-icons%2F{category}%2F{filename}?alt=media
```

¡Tu mercado visual está abierto para operaciones! 💎🎨
