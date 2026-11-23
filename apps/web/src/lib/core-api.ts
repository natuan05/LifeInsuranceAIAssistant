if (
  typeof globalThis.crypto !== 'undefined' &&
  typeof globalThis.crypto.randomUUID !== 'function' &&
  typeof globalThis.crypto.getRandomValues === 'function'
) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}` as `${string}-${string}-${string}-${string}-${string}`;
    },
    configurable: true,
  });
}

export type CoreHealth = {
  status: 'ok';
  service: 'core';
  timestamp: string;
};

export const coreApiUrl = (
  process.env.NEXT_PUBLIC_CORE_API_URL ?? '/api/v1'
).replace(/\/$/, '');

export async function checkCoreConnection(): Promise<CoreHealth> {
  const response = await fetch(`${coreApiUrl}/health/live`, {
    cache: 'no-store',
    credentials: 'include',
    // Diagnostic request uses the same-origin gateway as other business APIs.
    headers: { 'X-Connection-Check': 'web' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}.`);
  }

  const health: unknown = await response.json();
  if (
    typeof health !== 'object' || health === null ||
    !('status' in health) || health.status !== 'ok' ||
    !('service' in health) || health.service !== 'core' ||
    !('timestamp' in health) || typeof health.timestamp !== 'string'
  ) {
    throw new Error('Invalid backend health response.');
  }

  return health as CoreHealth;
}
