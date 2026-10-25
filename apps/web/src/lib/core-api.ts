export type CoreHealth = {
  status: 'ok';
  service: 'core';
  timestamp: string;
};

export const coreApiUrl = (
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4000/api/v1'
).replace(/\/$/, '');

export async function checkCoreConnection(): Promise<CoreHealth> {
  const response = await fetch(`${coreApiUrl}/health/live`, {
    cache: 'no-store',
    credentials: 'include',
    // This header intentionally triggers a browser CORS preflight.
    headers: { 'X-Connection-Check': 'web' },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Backend trả về HTTP ${response.status}.`);
  }

  const health: unknown = await response.json();
  if (
    typeof health !== 'object' || health === null ||
    !('status' in health) || health.status !== 'ok' ||
    !('service' in health) || health.service !== 'core' ||
    !('timestamp' in health) || typeof health.timestamp !== 'string'
  ) {
    throw new Error('Phản hồi backend chưa đúng định dạng health check.');
  }

  return health as CoreHealth;
}
