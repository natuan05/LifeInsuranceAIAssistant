'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthError } from '@/lib/auth-api';
import { realtimeEvent } from '@/lib/realtime';

export function useCooldown(until?: number) {
  const [elapsed, setElapsed] = useState<number>();
  useEffect(() => {
    if (!until) return;
    const timer = setTimeout(() => setElapsed(until), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until]);
  return until !== undefined && elapsed !== until;
}

type ReadOptions = { unavailable?: string; failure?: (status?: number, stale?: boolean) => string };
export function useAuthorizedRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>, realtime = true, options: ReadOptions = {}) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string; revision: number; data?: T; error?: string; status?: number; retryAt?: number }>({ key: '', revision: -1 });
  const current = state.key === key ? state : undefined;
  const retryDisabled = useCooldown(current?.retryAt);
  useEffect(() => {
    if (!realtime) return;
    const refresh = () => { if (!retryDisabled) setRevision(value => value + 1); };
    window.addEventListener(realtimeEvent, refresh);
    return () => window.removeEventListener(realtimeEvent, refresh);
  }, [realtime, retryDisabled]);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    void read(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(data => {
      if (!controller.signal.aborted) setState({ key, revision, data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const status = error instanceof AuthError ? error.status : undefined;
      if (status === 401) router.replace('/staff/login');
      const denied = status !== undefined && [401, 403, 404].includes(status);
      setState(previous => {
        const data = !denied && previous.key === key ? previous.data : undefined;
        return { key, revision, data, status, retryAt: status === 429 ? Date.now() + (error.retryAfter ?? 30) * 1000 : undefined,
          error: denied ? options.unavailable ?? 'This information is unavailable or is no longer assigned to you.'
            : options.failure ? options.failure(status, !!data)
              : data ? 'Unable to refresh. Previously loaded information may be out of date. Please try again.'
                : 'Unable to load this information. Please try again.' };
      });
    });
    return () => controller.abort();
    // The key covers resource inputs; callbacks/options must not restart the request on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision, router]);
  const settled = current?.revision === revision;
  return { data: current?.data, error: settled ? current?.error : undefined, status: settled ? current?.status : undefined,
    loading: !current?.data && !settled, refreshing: !!current?.data && !settled, retryDisabled,
    retry: () => { if (!retryDisabled) setRevision(value => value + 1); },
    revoke: (status: number) => {
      request.current?.abort();
      setState({ key, revision, status, error: options.unavailable ?? 'This information is unavailable or is no longer assigned to you.' });
      if (status === 401) router.replace('/staff/login');
    } };
}
