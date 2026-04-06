# Card-Social — frontend-admin (legacy)

Esta carpeta contiene archivos sueltos del portal admin web (p. ej. `AdminDashboard.tsx`, `index.html`, `vercel.json`). **No hay `package.json`** en el repositorio; el flujo de build puede depender de otro directorio o de un despliegue histórico.

## Documentación

- Detalle de flujos, endpoints y notas antiguas: **`README.md.old`** en esta misma carpeta.  
  Ese archivo llegó a incluir **usuario y contraseña en texto plano**. Si alguna vez usaste esas credenciales, **cámbialas** en el backend (`ADMIN_USER` / `ADMIN_PASS_HASH` en `backend/.env`) y en cualquier sistema que las comparta.

## Variables

Si usas entorno local para este frontend, coloca secretos en **`frontend-admin/.env.local`** (ya ignorado por Git en la raíz del monorepo). No commitees valores reales.

## API backend

El servidor Express expone admin bajo **`/api/admin`** (ver `backend/src/server.js` y `backend/src/routes/adminRoutes.js`).
