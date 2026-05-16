/**
 * Account Recovery Service
 * Permite al usuario recuperar su cuenta si perdió el celular o contraseña
 */

import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth, db } from '@/services/firebaseConfig';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Iniciar proceso de recuperación por Email
 */
export async function initiateAccountRecovery(
  email: string,
  locale: 'es' | 'en' = 'es'
): Promise<{
  success: boolean;
  message: string;
}> {
  const genericMessage = 'Si el email coincide con una cuenta, enviaremos un enlace de recuperación.';
  const baseUrl = getApiBase();
  try {
    if (!baseUrl) {
      return { success: false, message: 'Servicio de recuperación no configurado.' };
    }
    await fetch(`${baseUrl}/api/auth/send-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), locale }),
    });
    return { success: true, message: genericMessage };
  } catch {
    return { success: true, message: genericMessage };
  }
}

function getApiBase(): string {
  return (
    process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
}

function getGatewayKey(): string {
  return (
    process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GATEWAY_KEY?.trim() ||
    ''
  );
}

export async function requestUsernameRecoveryByPhone(phone: string): Promise<{
  success: boolean;
  message: string;
}> {
  const genericMessage = 'Si encontramos una cuenta con ese teléfono, enviaremos el usuario al email registrado.';
  const baseUrl = getApiBase();
  const gatewayKey = getGatewayKey();
  if (!baseUrl || !gatewayKey) {
    return { success: false, message: 'Servicio de recuperación no configurado.' };
  }
  try {
    await fetch(`${baseUrl}/api/recovery/username`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-gateway-key': gatewayKey,
      },
      body: JSON.stringify({ phone }),
    });
    return { success: true, message: genericMessage };
  } catch {
    return { success: true, message: genericMessage };
  }
}

/**
 * Verificar código de reset (desde link en email)
 */
export async function verifyResetCode(code: string): Promise<{
  success: boolean;
  email?: string;
  message: string;
}> {
  try {
    // Firebase ofrece esto automáticamente en web, en React Native usamos verifyPasswordResetCode
    const email = await verifyPasswordResetCode(auth, code);

    return {
      success: true,
      email,
      message: 'Código válido. Puedes resetear tu contraseña.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Código inválido o expirado. Solicita uno nuevo.',
    };
  }
}

/**
 * Confirmar reset de contraseña
 */
export async function confirmReset(
  code: string,
  newPassword: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    await confirmPasswordReset(auth, code, newPassword);

    return {
      success: true,
      message: 'Contraseña actualizada exitosamente. Inicia sesión con tu nueva contraseña.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Error actualizando contraseña.',
    };
  }
}

/**
 * Recuperación por Documento de Identidad (verificación manual)
 * Nivel 3: Si perdió email + teléfono
 */
export async function initiateDocumentVerification(params: {
  email: string;
  fullName: string;
  documentType: 'passport' | 'license' | 'id_card';
  documentImageUrl: string; // URL de imagen subida a Azure
}): Promise<{
  success: boolean;
  ticketId?: string;
  message: string;
}> {
  try {
    // Crear ticket de soporte
    const ticketId = `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const recoveryTicket = {
      ticketId,
      email: params.email,
      fullName: params.fullName,
      documentType: params.documentType,
      documentImageUrl: params.documentImageUrl,
      status: 'pending', // pending | verified | rejected
      createdAt: new Date(),
      verifiedAt: null,
      verifiedBy: null, // Admin ID
    };

    // Guardar ticket en Firestore bajo colección admin
    await setDoc(doc(db, 'admin', 'accountRecoveryTickets', 'tickets', ticketId), {
      ...recoveryTicket,
    });

    return {
      success: true,
      ticketId,
      message: `Solicitud creada. ID: ${ticketId}. Nuestro equipo revisará en 24-48 horas.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Error creando solicitud de recuperación.',
    };
  }
}

/**
 * Verificar estado de solicitud de recuperación
 */
export async function checkRecoveryRequestStatus(
  ticketId: string
): Promise<{
  status: 'pending' | 'verified' | 'rejected';
  message: string;
}> {
  try {
    const docRef = doc(db, 'admin', 'accountRecoveryTickets', 'tickets', ticketId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return {
        status: 'rejected',
        message: 'Ticket no encontrado.',
      };
    }

    const data = docSnap.data();

    return {
      status: data.status,
      message: getStatusMessage(data.status),
    };
  } catch (error: any) {
    return {
      status: 'rejected',
      message: error.message || 'Error consultando estado.',
    };
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Tu solicitud está siendo revisada. Recibirás un email cuando sea completada.';
    case 'verified':
      return '✅ Verificado. Recibirás instrucciones de reset en tu email.';
    case 'rejected':
      return '❌ Solicitud rechazada. Contacta a soporte.';
    default:
      return '';
  }
}

/**
 * Preguntas de seguridad (guardadas en registro)
 */
export interface SecurityQuestion {
  question:
    | 'pet_name'
    | 'mother_maiden'
    | 'first_school'
    | 'birth_city'
    | 'favorite_book';
  answer: string; // Hash de la respuesta
}

/**
 * Guardar preguntas de seguridad en perfil del usuario
 */
export async function saveSecurityQuestions(
  userId: string,
  questions: SecurityQuestion[]
): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'users', userId), {
      securityQuestions: questions,
      securityQuestionsUpdatedAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error('Error saving security questions:', error);
    return false;
  }
}

/**
 * Verificar respuestas de seguridad
 */
export async function verifySecurityAnswers(
  userId: string,
  userAnswers: { question: string; answer: string }[]
): Promise<boolean> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return false;

    const savedQuestions = userDoc.data().securityQuestions || [];

    // Compare answers (in production, use hashing)
    for (const userAnswer of userAnswers) {
      const savedQuestion = savedQuestions.find(
        (q: SecurityQuestion) => q.question === userAnswer.question
      );
      if (!savedQuestion || savedQuestion.answer !== userAnswer.answer) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error verifying security answers:', error);
    return false;
  }
}
