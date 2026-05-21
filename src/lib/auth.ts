import crypto from 'crypto';

/**
 * Gera um hash seguro a partir de uma senha em texto plano.
 * Retorna uma string no formato 'salt:hash'
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifica se a senha em texto plano corresponde ao hash armazenado no banco.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    
    const verifyHash = crypto.scryptSync(password, salt, 64);
    const hashBuffer = Buffer.from(hash, 'hex');
    
    // Comparação de tempo seguro para evitar Side-Channel Timing Attacks
    return crypto.timingSafeEqual(hashBuffer, verifyHash);
  } catch (error) {
    return false;
  }
}
