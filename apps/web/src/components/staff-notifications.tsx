'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notificationEvent, useChatRefresh } from '@/lib/chat-realtime';
import {
  ConversationError,
  readStaffNotification,
  staffNotifications,
  type CursorPage,
  type StaffNotification,
} from '@/lib/conversation-api';
import { inboxButton } from './conversation-transcript';
import { realtimeEvent } from '@/lib/realtime';

export function StaffNotifications({
  csrfToken,
  onDenied,
  passwordChangeRecommended = false,
}: {
  csrfToken: string;
  onDenied: (error: ConversationError) => void;
  passwordChangeRecommended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 56, left: 16, width: 360 });
  const [data, setData] = useState<CursorPage<StaffNotification> | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [passwordDismissed, setPasswordDismissed] = useState(false);

  const button = useRef<HTMLButtonElement>(null);
  const readController = useRef<AbortController | null>(null);
  const scopeRevision = useRef(0);
  const router = useRouter();

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, window.innerWidth - 32);
    setPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 100),
      left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
      width,
    });
  }, []);

  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const epoch = scopeRevision.current;
      setPending(true);
      setError('');
      try {
        const result = await staffNotifications(cursor, signal);
        if (!signal.aborted && epoch === scopeRevision.current) {
          setData(result);
        }
      } catch (failure) {
        if (!signal.aborted && epoch === scopeRevision.current) {
          if (failure instanceof ConversationError && [401, 403].includes(failure.status)) {
            setData(null);
            onDenied(failure);
          }
          setError('Unable to load notifications. Retry.');
        }
      } finally {
        if (!signal.aborted && epoch === scopeRevision.current) {
          setPending(false);
        }
      }
    },
    [cursor, onDenied],
  );

  const clear = useCallback(() => {
    setData(null);
    setCursor(undefined);
  }, []);

  useChatRefresh(refresh, clear, true, notificationEvent);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh, revision]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => controller.abort();
  }, [open, refresh]);

  useEffect(() => () => readController.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);

  useEffect(() => {
    const revoke = () => {
      scopeRevision.current++;
      readController.current?.abort();
      readController.current = null;
      setReading(null);
      setData(null);
      setCursor(undefined);
      setRevision(value => value + 1);
    };
    window.addEventListener(realtimeEvent, revoke);
    return () => window.removeEventListener(realtimeEvent, revoke);
  }, []);

  const select = async (item: StaffNotification) => {
    if (readController.current) return;
    const controller = new AbortController();
    readController.current = controller;
    setReading(item.id);
    try {
      await readStaffNotification(item.id, csrfToken, controller.signal);
      if (!controller.signal.aborted) {
        setData(prev =>
          prev
            ? {
                ...prev,
                items: prev.items.map(it => (it.id === item.id ? { ...it, isRead: true } : it)),
              }
            : null,
        );
        setOpen(false);
        router.push(
          item.target.type === 'TICKET'
            ? `/staff/tickets/${encodeURIComponent(item.target.id)}`
            : `/staff/inbox/${encodeURIComponent(item.target.id)}?filter=requests`,
        );
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof ConversationError && [403, 404].includes(failure.status)
            ? 'This notification is no longer available to you.'
            : failure instanceof ConversationError
              ? failure.message
              : 'Unable to open this notification. Retry.',
        );
        if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) {
          setData(null);
          if (failure.status === 401) onDenied(failure);
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        readController.current = null;
        setReading(null);
      }
    }
  };

  const markSingleRead = async (id: string) => {
    setReading(id);
    const controller = new AbortController();
    try {
      await readStaffNotification(id, csrfToken, controller.signal);
      setData(prev =>
        prev
          ? {
              ...prev,
              items: prev.items.map(it => (it.id === id ? { ...it, isRead: true } : it)),
            }
          : null,
      );
    } catch {
      setError('Unable to mark notification as read.');
    } finally {
      setReading(null);
    }
  };

  const markAllAsRead = async () => {
    if (markingAll) return;
    const unread = data?.items.filter(it => !it.isRead) ?? [];
    setMarkingAll(true);
    const controller = new AbortController();
    try {
      if (unread.length > 0) {
        await Promise.allSettled(
          unread.map(it => readStaffNotification(it.id, csrfToken, controller.signal)),
        );
        setData(prev =>
          prev
            ? {
                ...prev,
                items: prev.items.map(it => ({ ...it, isRead: true })),
              }
            : null,
        );
      }
      if (passwordChangeRecommended) {
        setPasswordDismissed(true);
      }
    } catch {
      // Best effort update
    } finally {
      setMarkingAll(false);
    }
  };

  const serverUnreadCount = data?.items.filter(item => !item.isRead).length ?? 0;
  const passwordUnread = passwordChangeRecommended && !passwordDismissed;
  const totalUnreadCount = serverUnreadCount + (passwordUnread ? 1 : 0);

  return (
    <div className="tw:relative">
      <button
        ref={button}
        className="tw:relative tw:inline-flex tw:h-9 tw:w-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-slate-500 tw:hover:text-slate-800 tw:hover:bg-slate-50 tw:shadow-2xs tw:transition-all tw:cursor-pointer tw:disabled:opacity-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600"
        aria-expanded={open}
        aria-controls="staff-notifications"
        aria-label="Notifications"
        title="Notifications"
        onClick={() => {
          place();
          setOpen(value => !value);
        }}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>

        {/* Unread Notifications Count Badge */}
        {totalUnreadCount > 0 && (
          <span
            aria-hidden="true"
            className="tw:absolute tw:-top-1.5 tw:-right-1.5 tw:flex tw:h-4.5 tw:min-w-4.5 tw:items-center tw:justify-center tw:rounded-full tw:bg-rose-500 tw:px-1 tw:text-[10px] tw:font-bold tw:text-white tw:ring-2 tw:ring-white tw:shadow-xs"
          >
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <section
            style={position}
            id="staff-notifications"
            aria-label="Staff notifications"
            className="tw:font-login tw:text-slate-900 tw:fixed tw:z-[100] tw:max-h-[min(70dvh,600px)] tw:overflow-y-auto tw:rounded-2xl tw:border tw:border-slate-200 tw:bg-white tw:p-4 tw:shadow-xl"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setOpen(false);
                button.current?.focus();
              }
            }}
          >
            {/* Header with Title, Count, and Mark All As Read */}
            <div className="tw:mb-3 tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-slate-100 tw:pb-2.5">
              <div className="tw:flex tw:items-center tw:gap-2">
                <h2 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:m-0">Notifications</h2>
                {totalUnreadCount > 0 && (
                  <span className="tw:rounded-full tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold tw:text-blue-700">
                    {totalUnreadCount} new
                  </span>
                )}
              </div>
              <div className="tw:flex tw:items-center tw:gap-2">
                {totalUnreadCount > 0 && (
                  <button
                    type="button"
                    disabled={markingAll}
                    onClick={() => void markAllAsRead()}
                    className="tw:text-[11px] tw:font-semibold tw:text-blue-600 tw:hover:text-blue-800 tw:cursor-pointer tw:disabled:opacity-50"
                  >
                    {markingAll ? 'Marking all read…' : 'Mark all as read'}
                  </button>
                )}
                {error && (
                  <button
                    className={inboxButton + ' tw:text-[11px]! tw:py-1! tw:px-2!'}
                    disabled={pending}
                    onClick={() => setRevision(value => value + 1)}
                  >
                    Try again
                  </button>
                )}
              </div>
            </div>

            {/* Password Change Security Notice (moved from floating banner to inside notifications) */}
            {passwordChangeRecommended && !passwordDismissed && (
              <div className="tw:mb-3 tw:rounded-xl tw:border tw:border-amber-200 tw:bg-amber-50/80 tw:p-3 tw:text-xs tw:shadow-2xs">
                <div className="tw:flex tw:items-start tw:justify-between tw:gap-2">
                  <div className="tw:flex tw:items-center tw:gap-1.5 tw:font-bold tw:text-amber-900">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="tw:text-amber-600"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Security Notice</span>
                  </div>
                  <button
                    type="button"
                    title="Dismiss"
                    aria-label="Dismiss password change notice"
                    onClick={() => setPasswordDismissed(true)}
                    className="tw:p-0.5 tw:text-amber-700 tw:hover:text-amber-900 tw:cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <p className="tw:mt-1 tw:text-slate-600 tw:leading-relaxed">
                  You are using an initially issued password. Please change your password to keep your account secure.
                </p>
                <div className="tw:mt-2.5 tw:flex tw:items-center tw:gap-3">
                  <Link
                    href="/account#change-password"
                    onClick={() => setOpen(false)}
                    className="tw:inline-flex tw:items-center tw:gap-1 tw:font-semibold tw:text-amber-800 tw:hover:underline tw:no-underline"
                  >
                    <span>Change password now</span>
                    <span>→</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPasswordDismissed(true)}
                    className="tw:text-[11px] tw:text-slate-500 tw:hover:text-slate-800 tw:cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="tw:mb-3 tw:text-xs tw:text-red-700">
                {error}
              </p>
            )}
            {pending && (
              <p role="status" className="tw:text-xs tw:text-slate-500 tw:py-2">
                Loading notifications…
              </p>
            )}

            {/* Notification Items List */}
            {data?.items.map(item => (
              <div
                key={item.id}
                className={
                  'tw:mb-2 tw:flex tw:items-start tw:gap-1 tw:rounded-xl tw:border tw:transition-all ' +
                  (item.isRead
                    ? 'tw:border-slate-100 tw:bg-white'
                    : 'tw:border-blue-200/60 tw:bg-blue-50/40')
                }
              >
                <button
                  disabled={Boolean(reading)}
                  className="tw:flex-1 tw:rounded-lg tw:p-3 tw:text-left tw:cursor-pointer tw:min-w-0"
                  onClick={() => void select(item)}
                >
                  <div className="tw:flex tw:items-center tw:gap-1.5 tw:min-w-0">
                    {!item.isRead && (
                      <span
                        className="tw:h-2 tw:w-2 tw:shrink-0 tw:rounded-full tw:bg-blue-600"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={
                        'tw:block tw:text-xs tw:leading-snug tw:truncate ' +
                        (item.isRead
                          ? 'tw:font-medium tw:text-slate-700'
                          : 'tw:font-bold tw:text-slate-900')
                      }
                    >
                      {item.title}
                    </span>
                  </div>
                  <time
                    className="tw:mt-1 tw:block tw:text-[11px] tw:text-slate-500"
                    dateTime={item.createdAt}
                  >
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                  <span className="tw:mt-1 tw:block tw:text-[11px] tw:font-medium tw:text-blue-700">
                    {item.isRead ? 'Read' : 'Unread'} ·{' '}
                    {item.target.type === 'TICKET' ? 'Open ticket' : 'Open request'}
                  </span>
                </button>

                {/* Inline Mark As Read Check Button */}
                {!item.isRead && (
                  <button
                    type="button"
                    title="Mark as read"
                    aria-label="Mark as read"
                    disabled={reading === item.id}
                    onClick={async e => {
                      e.stopPropagation();
                      await markSingleRead(item.id);
                    }}
                    className="tw:mt-2.5 tw:mr-2 tw:shrink-0 tw:p-1.5 tw:rounded-lg tw:text-slate-400 tw:hover:text-blue-600 tw:hover:bg-blue-100/60 tw:transition-colors tw:cursor-pointer"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {!pending && !error && !data?.items.length && !passwordChangeRecommended && (
              <p className="tw:text-xs tw:text-slate-500 tw:py-4 tw:text-center">
                No notifications yet.
              </p>
            )}

            {data?.pageInfo?.hasMore && (
              <button
                className={inboxButton + ' tw:w-full! tw:mt-2!'}
                disabled={pending}
                onClick={() => setCursor(data.pageInfo.nextCursor ?? undefined)}
              >
                Load more notifications
              </button>
            )}

            <button
              className={inboxButton + ' tw:w-full! tw:mt-3!'}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              Close notifications
            </button>
          </section>,
          document.body,
        )}
    </div>
  );
}
