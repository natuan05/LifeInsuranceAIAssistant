import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';

export const PROFILE = 'LI-HMAC-SHA256-v1';
export const MAX_BODY_BYTES = 1024 * 1024;
export const SKEW_SECONDS = 120;
export const NONCE_WINDOW_SECONDS = 600;
export const MIN_KEY_BYTES = 32;

export const H_KEY_ID = 'X-LI-Key-Id';
export const H_TIMESTAMP = 'X-LI-Timestamp';
export const H_NONCE = 'X-LI-Nonce';
export const H_CONTENT = 'X-LI-Content-SHA256';
export const H_SIGNATURE = 'X-LI-Signature';

const KEY_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const B64URL_SIG_RE = /^[A-Za-z0-9_-]{43}$/;
const TIMESTAMP_RE = /^[0-9]{1,12}$/;

export class AuthFailed extends Error {
  readonly code: string = 'AUTH_FAILED';
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export class ReplayRejected extends AuthFailed {
  override readonly code = 'REPLAY_REJECTED';
}

export interface NonceStore {
  rememberNonce(keyId: string, nonce: string, windowSeconds: number): Promise<boolean> | boolean;
}

export class MemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();
  constructor(private readonly clock: () => number = () => Math.floor(Date.now() / 1000)) {}

  rememberNonce(keyId: string, nonce: string, windowSeconds: number): boolean {
    const now = this.clock();
    for (const [k, exp] of this.seen.entries()) {
      if (exp <= now) this.seen.delete(k);
    }
    const composite = `${keyId}:${nonce}`;
    const existing = this.seen.get(composite);
    if (existing !== undefined && existing > now) return false;
    this.seen.set(composite, now + windowSeconds);
    return true;
  }
}

export function b64url(data: Buffer): string {
  return data.toString('base64url');
}

export function contentSha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function stringToSign(
  method: string,
  target: string,
  timestamp: string,
  nonce: string,
  digest: string,
  keyId: string,
): string {
  return [PROFILE, method.toUpperCase(), target, timestamp, nonce, digest, keyId].join('\n');
}

export function computeSignature(
  key: Buffer,
  method: string,
  target: string,
  timestamp: string,
  nonce: string,
  digest: string,
  keyId: string,
): string {
  return createHmac('sha256', key)
    .update(stringToSign(method, target, timestamp, nonce, digest, keyId), 'utf8')
    .digest('base64url');
}

export class Keyring {
  readonly currentId: string;
  readonly keys: ReadonlyMap<string, Buffer>;

  constructor(currentId: string, keys: Record<string, Buffer> | Map<string, Buffer>) {
    const map = keys instanceof Map ? new Map(keys) : new Map(Object.entries(keys));
    if (!map.has(currentId)) {
      throw new Error('current key id is not in the keyring');
    }
    for (const [keyId, key] of map.entries()) {
      if (!KEY_ID_RE.test(keyId)) throw new Error('invalid key id');
      if (key.length < MIN_KEY_BYTES) throw new Error('HMAC keys must be at least 32 random bytes');
    }
    this.currentId = currentId;
    this.keys = map;
  }

  static fromConfig(currentId: string, encoded: Record<string, string>): Keyring {
    const decoded: Record<string, Buffer> = {};
    for (const [k, v] of Object.entries(encoded)) {
      if (!/^[A-Za-z0-9_-]+$/.test(v)) throw new Error('invalid base64url key');
      decoded[k] = Buffer.from(v, 'base64url');
    }
    return new Keyring(currentId, decoded);
  }

  static fromEnv(
    prefix: string,
    env: Record<string, string | undefined> = process.env,
    defaultId?: string,
    defaultKeys?: string,
  ): Keyring {
    const currentId = (env[`${prefix}_KEY_ID`] || defaultId || '').trim();
    const rawKeys = (env[`${prefix}_KEYS`] || defaultKeys || '').trim();
    if (!currentId || !rawKeys) {
      throw new Error(`${prefix}_KEY_ID and ${prefix}_KEYS are required`);
    }
    const pairs: Record<string, string> = {};
    for (const item of rawKeys.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx <= 0) throw new Error(`Invalid key entry in ${prefix}_KEYS`);
      pairs[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return Keyring.fromConfig(currentId, pairs);
  }

  get currentKey(): Buffer {
    return this.keys.get(this.currentId)!;
  }
}

export function sign(
  keyring: Keyring,
  method: string,
  target: string,
  body: Buffer | string,
  options: { now?: number; nonce?: string } = {},
): Record<string, string> {
  const raw = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  if (raw.length > MAX_BODY_BYTES) throw new Error('body larger than 1 MiB');
  if (!target.startsWith('/')) throw new Error('target must start with /');
  const timestamp = String(Math.floor(options.now ?? Date.now() / 1000));
  const nonce = options.nonce ?? b64url(randomBytes(16));
  if (!NONCE_RE.test(nonce)) throw new Error('invalid nonce');
  const digest = contentSha256(raw);
  const sig = computeSignature(keyring.currentKey, method, target, timestamp, nonce, digest, keyring.currentId);
  return {
    [H_KEY_ID]: keyring.currentId,
    [H_TIMESTAMP]: timestamp,
    [H_NONCE]: nonce,
    [H_CONTENT]: digest,
    [H_SIGNATURE]: sig,
  };
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct) && direct.length === 1) return direct[0];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name.toLowerCase()) {
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length === 1) return v[0];
    }
  }
  return '';
}

export async function verify(
  keyring: Keyring,
  nonces: NonceStore,
  method: string,
  target: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
  options: { now?: () => number } = {},
): Promise<string> {
  if (body.length > MAX_BODY_BYTES) throw new AuthFailed('body larger than 1 MiB');
  if (!target.startsWith('/')) throw new AuthFailed('invalid target');
  const keyId = getHeader(headers, H_KEY_ID);
  const timestampText = getHeader(headers, H_TIMESTAMP);
  const nonce = getHeader(headers, H_NONCE);
  const claimedDigest = getHeader(headers, H_CONTENT);
  const claimedSig = getHeader(headers, H_SIGNATURE);

  if (!keyId || !timestampText || !nonce || !claimedDigest || !claimedSig) {
    throw new AuthFailed('missing signature header');
  }
  if (!KEY_ID_RE.test(keyId) || !NONCE_RE.test(nonce) || !HEX64_RE.test(claimedDigest) || !B64URL_SIG_RE.test(claimedSig)) {
    throw new AuthFailed('malformed signature header');
  }
  if (!TIMESTAMP_RE.test(timestampText)) {
    throw new AuthFailed('malformed timestamp');
  }
  const key = keyring.keys.get(keyId);
  if (!key) throw new AuthFailed('unknown key id');

  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const timestamp = Number(timestampText);
  if (Math.abs(now - timestamp) > SKEW_SECONDS) {
    throw new AuthFailed('timestamp outside skew window');
  }

  const actualDigest = contentSha256(body);
  const digestA = Buffer.from(actualDigest, 'utf8');
  const digestB = Buffer.from(claimedDigest, 'utf8');
  if (digestA.length !== digestB.length || !timingSafeEqual(digestA, digestB)) {
    throw new AuthFailed('body digest mismatch');
  }

  const expectedSig = computeSignature(key, method, target, timestampText, nonce, actualDigest, keyId);
  const sigA = Buffer.from(expectedSig, 'utf8');
  const sigB = Buffer.from(claimedSig, 'utf8');
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    throw new AuthFailed('signature mismatch');
  }

  const fresh = await nonces.rememberNonce(keyId, nonce, NONCE_WINDOW_SECONDS);
  if (!fresh) {
    throw new ReplayRejected('nonce already used');
  }
  return keyId;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter(k => record[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

let ajvInstance: Ajv2020 | null = null;
const validators = new Map<string, ValidateFunction>();

function getAjv(): Ajv2020 {
  if (!ajvInstance) {
    const candidates = [
      process.env.LIFE_AGENT_CONTRACTS_DIR,
      resolve(__dirname, '../../../../../contracts'),
      resolve(__dirname, '../../../../contracts'),
      resolve(process.cwd(), 'contracts'),
      resolve(process.cwd(), '../../contracts'),
    ].filter((p): p is string => Boolean(p));
    let rawSchema: Record<string, unknown> | null = null;
    for (const dir of candidates) {
      try {
        rawSchema = JSON.parse(readFileSync(resolve(dir, 'agent-v1.schema.json'), 'utf8')) as Record<string, unknown>;
        break;
      } catch {
        continue;
      }
    }
    if (!rawSchema) throw new Error('Unable to locate contracts/agent-v1.schema.json');
    const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
    ajv.addSchema(rawSchema);
    ajvInstance = ajv;
  }
  return ajvInstance;
}

export function validateContract<T = unknown>(typeName: string, value: unknown): T {
  let validate = validators.get(typeName);
  if (!validate) {
    const ajv = getAjv();
    const fn = ajv.getSchema(`urn:life-insurance:contracts:agent-v1#/$defs/${typeName}`);
    if (!fn) throw new Error(`Unknown contract type ${typeName}`);
    validate = fn;
    validators.set(typeName, validate);
  }
  if (!validate(value)) {
    const err = new Error(`Contract validation failed for ${typeName}`);
    (err as Error & { code?: string }).code = 'SCHEMA_INVALID';
    throw err;
  }
  return value as T;
}
