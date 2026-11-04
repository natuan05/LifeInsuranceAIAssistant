'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notificationEvent, useChatRefresh } from '@/lib/chat-realtime';
import { ConversationError, readStaffNotification, staffNotifications, type CursorPage, type StaffNotification } from '@/lib/conversation-api';
import { inboxButton } from './conversation-transcript';
export function StaffNotifications({ csrfToken, onDenied }: { csrfToken: string; onDenied: (error: ConversationError) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CursorPage<StaffNotification> | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const readController = useRef<AbortController | null>(null);
  const router = useRouter();
  const refresh = useCallback(async (signal: AbortSignal) => {
    if (!open) return;
    setPending(true); setError('');
    try { const result = await staffNotifications(cursor, signal); if (!signal.aborted) setData(result); }
    catch (failure) { if (!signal.aborted) { if (failure instanceof ConversationError && [401, 403].includes(failure.status)) onDenied(failure); setError('Unable to load notifications. Retry.'); } }
    finally { if (!signal.aborted) setPending(false); }
  }, [open, cursor, onDenied]);
  const clear = useCallback(() => { setData(null); setCursor(undefined); }, []);
  useChatRefresh(refresh, clear, true, notificationEvent);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void refresh(controller.signal); }); return () => controller.abort(); }, [refresh, revision]);
  useEffect(() => () => readController.current?.abort(), []);
  const select = async (item: StaffNotification) => {
    if (readController.current) return;
    const controller = new AbortController(); readController.current = controller; setReading(item.id);
    try {
      await readStaffNotification(item.id, csrfToken, controller.signal);
      if (!controller.signal.aborted) { setOpen(false); router.push(`/staff/inbox/${encodeURIComponent(item.target.id)}?filter=requests`); }
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure instanceof ConversationError ? failure.message : 'Unable to open this notification. Retry.'); if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) { setData(null); if (failure.status === 401) onDenied(failure); } }
    } finally { if (!controller.signal.aborted) { readController.current = null; setReading(null); } }
  };
  return <div className="tw:relative">
    <button ref={button} className={inboxButton} aria-expanded={open} aria-controls="staff-notifications" aria-label="Notifications" title="Notifications" onClick={() => setOpen(value => !value)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button>
    {open && <section id="staff-notifications" aria-label="Staff notifications" className="tw:absolute tw:-left-12 tw:top-full tw:z-40 tw:mt-2 tw:max-h-[65dvh] tw:w-[min(320px,80vw)] tw:overflow-y-auto tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:shadow-lg" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } }}>
      <div className="tw:mb-3 tw:flex tw:items-center tw:justify-between tw:gap-2"><h2 className="tw:text-sm tw:font-semibold">Notifications</h2><button className={inboxButton} disabled={pending} onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
      {error && <p role="alert" className="tw:mb-3 tw:text-sm tw:text-red-800">{error}</p>}{pending && <p role="status" className="tw:text-sm tw:text-slate-600">Loading notifications…</p>}
      {data?.items.map(item => <button key={item.id} disabled={Boolean(reading)} className={'tw:mb-2! tw:block! tw:w-full! tw:rounded-lg! tw:p-3! tw:text-left tw:hover:bg-blue-50 ' + (item.isRead ? 'tw:bg-white' : 'tw:bg-blue-50')} onClick={() => void select(item)}><span className="tw:block tw:text-sm tw:font-medium">{item.title}</span><time className="tw:mt-1 tw:block tw:text-xs tw:text-slate-600" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time><span className="tw:mt-1 tw:block tw:text-xs tw:text-blue-700">{item.isRead ? 'Read' : 'Unread'} · Open request</span></button>)}
      {!pending && !error && !data?.items.length && <p className="tw:text-sm tw:text-slate-600">No notifications.</p>}
      {data?.pageInfo?.hasMore && <button className={inboxButton} disabled={pending} onClick={() => setCursor(data.pageInfo.nextCursor ?? undefined)}>Load more notifications</button>}
      <button className={inboxButton + ' tw:mt-3!'} onClick={() => { setOpen(false); button.current?.focus(); }}>Close notifications</button>
    </section>}
  </div>;
}
