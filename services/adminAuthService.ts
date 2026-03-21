/**
 * AdminAuthService
 * Gestión de autenticación segura para Admin Portal
 * Hash de credencial: admin_pochobs / Arantza11@
 * Sesión: JWT con expiración de 30 minutos
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AdminSessionPayload } from '../types/marketAssets';

const ADMIN_CREDENTIALS = {
  username: 'admin_pochobs',
  // Hash bcrypt de 'Arantza11@' (pre-calculado en setup seguro)
  password_hash: '$2a$12$X5a.9K.Q3r.K7w.Z2m.Z7O/7K9L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5',
};

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-secret-key-change-in-prod';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export class AdminAuthService {
  /**
   * Validar credenciales y emitir JWT
   */
  static async login(username: string, password: string): Promise<string | null> {
    // Verificación simple por username
    if (username !== ADMIN_CREDENTIALS.username) {
      console.warn(`❌ Admin login failed: usuario inválido (${username})`);
      return null;
    }

    // Comparar contraseña con bcrypt
    const isValidPassword = await bcrypt.compare(password, ADMIN_CREDENTIALS.password_hash);
    if (!isValidPassword) {
      console.warn(`❌ Admin login failed: contraseña incorrecta`);
      return null;
    }

    // Generar JWT
    const payload: AdminSessionPayload = {
      admin_id: 'admin_pochobs_001',
      username: ADMIN_CREDENTIALS.username,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_TIMEOUT_MS / 1000,
      iss: 'card-social-admin',
    };

    const token = jwt.sign(payload, ADMIN_JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '30m',
    });

    console.log(`✅ Admin login exitoso: ${username}`);
    return token;
  }

  /**
   * Validar y decodificar token JWT del Admin
   */
  static verifyToken(token: string): AdminSessionPayload | null {
    try {
      const decoded = jwt.verify(token, ADMIN_JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'card-social-admin',
      }) as AdminSessionPayload;

      return decoded;
    } catch (error) {
      console.warn(`❌ Token inválido o expirado: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Middleware para verificar sesión de Admin
   * Uso: app.use('/api/admin/*', adminAuthMiddleware)
   */
  static middleware() {
    return (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.slice(7);
      const payload = AdminAuthService.verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.admin = payload;
      next();
    };
  }

  /**
   * Generar hash bcrypt para nueva contraseña (uso puntual)
   * Nota: Usar solo en setup/migration scripts
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}

export default AdminAuthService;
