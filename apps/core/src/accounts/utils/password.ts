import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcrypt';
import { registerDecorator } from 'class-validator';

export const BCRYPT_COST = 12;
export function MaxPasswordBytes() {
  return (object: object, propertyName: string) => registerDecorator({
    name: 'maxPasswordBytes', target: object.constructor, propertyName,
    validator: { validate: (value: unknown) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72 },
    options: { message: 'Password must not exceed 72 UTF-8 bytes.' },
  });
}
export const needsPasswordRehash = (encoded: string) => !encoded.startsWith(`$2b$${BCRYPT_COST}$`);

// Read-only compatibility with the previous local hash format. New writes use bcrypt.
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export function generateInitialPassword() { return `Dev-${randomBytes(12).toString('base64url')}`; }
export async function hashPassword(password: string) {
  if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password exceeds bcrypt byte limit.');
  return hash(password, BCRYPT_COST);
}
export async function verifyPassword(password: string, encoded: string) {
  if (/^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/.test(encoded)) {
    return Buffer.byteLength(password, 'utf8') <= 72 && await compare(password, encoded);
  }
  if (Array.from(password).length > 128 || !/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
  const parts = encoded.split('$');
  return timingSafeEqual(await derive(password, Buffer.from(parts[4], 'hex')), Buffer.from(parts[5], 'hex'));
}
