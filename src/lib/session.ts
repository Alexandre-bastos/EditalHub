import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'editalhub-super-secret-key-replaces-in-production-123456789';

export interface SessionUser {
  id: string;
  email: string;
  nome: string;
  expiresAt: number;
}

/**
 * Assina e encripta um payload de sessão retornando um token serializado.
 */
export function encryptSession(user: Omit<SessionUser, 'expiresAt'>): string {
  // A sessão expira em 7 dias
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload: SessionUser = {
    id: user.id,
    email: user.email,
    nome: user.nome,
    expiresAt
  };

  const serializedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Cria uma assinatura digital usando HMAC-SHA256
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(serializedPayload);
  const signature = hmac.digest('base64url');

  return `${serializedPayload}.${signature}`;
}

/**
 * Valida a integridade do token de sessão e decodifica seu payload.
 * Retorna o usuário da sessão ou null se for inválido ou estiver expirado.
 */
export function decryptSession(token: string | undefined): Omit<SessionUser, 'expiresAt'> | null {
  if (!token) return null;

  try {
    const [serializedPayload, signature] = token.split('.');
    if (!serializedPayload || !signature) return null;

    // Valida a assinatura digital usando timing seguro
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(serializedPayload);
    const expectedSignature = hmac.digest('base64url');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedSignatureBuffer.length || 
        !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
      return null; // Token adulterado!
    }

    // Decodifica o payload
    const decoded = JSON.parse(Buffer.from(serializedPayload, 'base64url').toString('utf8')) as SessionUser;
    
    // Verifica se a sessão está expirada
    if (Date.now() > decoded.expiresAt) {
      return null; // Sessão expirada
    }

    return {
      id: decoded.id,
      email: decoded.email,
      nome: decoded.nome
    };
  } catch (error) {
    return null;
  }
}
