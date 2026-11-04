'use client';

import { useEffect, useRef, useState } from 'react';
import { AuthError } from '@/lib/auth-api';
import type { PdfGrant } from '@/lib/product-api';
import { realtimeEvent } from '@/lib/realtime';
import { useAuthorizedRead, useCooldown } from './use-authorized-read';

const button = 'tw:inline-flex tw:cursor-pointer tw:items-center tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:text-xs tw:text-blue-700 tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600 tw:disabled:cursor-default tw:disabled:opacity-50';
export function SignedPdfPreview({ resourceKey, document, title, description, filename, access, compact = false, blocked = false, manualReload = true,
  unavailable = 'This information is unavailable or is no longer assigned to you.' }: {
  resourceKey: string; document: { title: string; versionNumber: string }; title: string; description: string; filename: string;
  access: (intent: 'view' | 'download', signal: AbortSignal) => Promise<PdfGrant>; compact?: boolean; blocked?: boolean; manualReload?: boolean; unavailable?: string;
}) {
  // Metadata parents reauthorize separately. Identical resource keys retain this
  // grant and iframe node through background metadata refreshes.
  const state = useAuthorizedRead(resourceKey, signal => access('view', signal), false, {
    unavailable,
    failure: status => status === 429 ? 'Too many document requests. Wait before trying again.' : 'Unable to load the PDF. Please try again.',
  });
  const [expiredGrant, setExpiredGrant] = useState<PdfGrant>();
  const [failedGrant, setFailedGrant] = useState<PdfGrant>();
  const expired = !!state.data && expiredGrant === state.data;
  const [downloadState, setDownloadState] = useState<{ pending: boolean; error: string; retryAt?: number }>({ pending: false, error: '' });
  const cooldown = useCooldown(downloadState.retryAt);
  const downloadAbort = useRef<AbortController | null>(null), downloadUrl = useRef<string | null>(null);
  useEffect(() => () => { downloadAbort.current?.abort(); if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current); }, []);
  useEffect(() => {
    const grant = state.data;
    if (!grant) return;
    const timer = setTimeout(() => setExpiredGrant(grant), Math.max(0, new Date(grant.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [state.data]);
  useEffect(() => {
    if (state.status && [401, 403, 404].includes(state.status)) {
      downloadAbort.current?.abort();
      if (downloadUrl.current) { URL.revokeObjectURL(downloadUrl.current); downloadUrl.current = null; }
      window.dispatchEvent(new Event(realtimeEvent));
    }
  }, [state.status]);
  async function download() {
    downloadAbort.current?.abort(); const controller = new AbortController(); downloadAbort.current = controller;
    setDownloadState({ pending: true, error: '' });
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
      const grant = await access('download', signal);
      const response = await fetch(grant.url, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error('PDF unavailable');
      const blob = await response.blob(); if (!blob.size) throw new Error('PDF unavailable');
      if (controller.signal.aborted) return;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const link = window.document.createElement('a'); link.href = downloadUrl.current;
      link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_'); link.click();
      setDownloadState({ pending: false, error: '' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const denied = error instanceof AuthError && [401, 403, 404].includes(error.status);
      if (denied) { state.revoke(error.status); window.dispatchEvent(new Event(realtimeEvent)); }
      setDownloadState({ pending: false, retryAt: error instanceof AuthError && error.status === 429 ? Date.now() + (error.retryAfter ?? 30) * 1000 : undefined,
        error: denied ? 'This document is unavailable or access has changed.' : error instanceof AuthError && error.status === 429
          ? 'Too many document requests. Wait before downloading again.' : 'Unable to download the PDF. Please try again.' });
    }
  }
  const reload = () => { setFailedGrant(undefined); state.retry(); };
  return <div className="tw:min-w-0">
    <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-4 tw:py-3 tw:sm:px-5"><div className="tw:min-w-0"><h2 className="tw:wrap-anywhere tw:text-sm tw:font-semibold tw:leading-6">{title}</h2><p className="tw:text-xs tw:leading-5 tw:text-slate-600">{description} · Version {document.versionNumber}</p></div><button type="button" className={`${button} tw:shrink-0 tw:gap-2! tw:border-blue-600! tw:bg-blue-600! tw:text-white! tw:hover:bg-blue-700!`} disabled={blocked || cooldown || downloadState.pending} onClick={() => void download()}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>{downloadState.pending ? 'Downloading…' : 'Download PDF'}</button></div>
    {downloadState.error && <p role="alert" className="tw:px-5 tw:py-3 tw:text-sm tw:text-red-700">{downloadState.error}</p>}
    {state.loading && <p role="status" className="tw:p-5 tw:text-sm tw:text-slate-600">Loading PDF…</p>}
    {state.error && <div role="alert" className="tw:p-5 tw:text-sm tw:text-red-700"><p>{state.error}</p><button type="button" className={`${button} tw:mt-3`} disabled={blocked || state.retryDisabled} onClick={reload}>Try again</button></div>}
    {state.data && (expired ? <div className="tw:px-5 tw:py-16 tw:text-center tw:text-sm tw:text-slate-600"><p className="tw:mb-4">The preview link has expired.</p><button type="button" className={button} disabled={blocked || state.refreshing || state.retryDisabled} onClick={reload}>Reload preview</button></div> : <>
      {failedGrant === state.data && <p role="alert" className="tw:px-5 tw:py-3 tw:text-sm tw:text-red-700">The browser could not open the preview. Reload it or open the PDF in a new tab.</p>}
      <iframe title={`PDF preview: ${document.title}, version ${document.versionNumber}`} src={`${state.data.url}#view=FitH&zoom=page-width`} onError={() => setFailedGrant(state.data)} referrerPolicy="no-referrer" className={`tw:block tw:w-full tw:border-0 tw:bg-slate-100 ${compact ? 'tw:h-[calc(100dvh-280px)] tw:min-h-[420px]' : 'tw:h-[76dvh] tw:min-h-[480px]'}`} />
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3 tw:text-xs"><a href={state.data.url} target="_blank" rel="noopener noreferrer" className="tw:text-blue-700 tw:no-underline tw:hover:underline">Open PDF in a new tab</a>{(manualReload || failedGrant === state.data) && <button type="button" disabled={blocked || state.refreshing || state.retryDisabled} className="tw:cursor-pointer tw:text-slate-600 tw:hover:text-blue-700 tw:hover:underline tw:disabled:opacity-50" onClick={reload}>Reload preview</button>}</div>
    </>)}
  </div>;
}
