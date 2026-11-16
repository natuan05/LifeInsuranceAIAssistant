'use client';

import Link from 'next/link';
import { useChatRefresh } from '@/lib/chat-realtime';
import { realtimeEvent } from '@/lib/realtime';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConversationError,
  customerConversation,
  customerConversations,
  markConversationRead,
  type ChatMessage,
  type CursorPage,
  type CustomerConversation,
} from '@/lib/conversation-api';
import { ConversationTranscript, inboxButton, type TranscriptSnapshot } from './conversation-transcript';
import { ConversationComposer, type ComposerSnapshot } from './conversation-composer';
import { CustomerHandoffDialog } from './customer-handoff-dialog';

export function CustomerConversations({ csrfToken, blocked }: { csrfToken: string; blocked: boolean }) {
  const query = useSearchParams();
  const router = useRouter();
  const selected = query.get('conversationId');
  const privacyEpoch = useRef(0);
  const metadataController = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);

  const [list, setList] = useState<CursorPage<CustomerConversation> | null>(null);
  const [detail, setDetail] = useState<CustomerConversation | null>(null);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [dialog, setDialog] = useState<'AI' | 'DIRECT' | 'HANDOFF' | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [transcriptMemory] = useState(() => new Map<string, TranscriptSnapshot>());
  const [composerMemory] = useState(() => new Map<string, ComposerSnapshot>());

  const onDenied = useCallback(
    (failure: ConversationError) => {
      privacyEpoch.current++;
      metadataController.current?.abort();
      listController.current?.abort();
      transcriptMemory.clear();
      composerMemory.clear();
      setDetail(null);
      setList(null);
      setDenied(true);
      setError(failure.message);
      if (failure.status === 401) router.replace('/login');
    },
    [router, transcriptMemory, composerMemory]
  );

  useEffect(() => {
    const abort = new AbortController();
    const epoch = privacyEpoch.current;
    listController.current = abort;
    if (blocked) {
      transcriptMemory.clear();
      composerMemory.clear();
      return;
    }
    queueMicrotask(() => {
      if (!abort.signal.aborted && epoch === privacyEpoch.current) {
        setLoading(true);
        setError('');
      }
    });
    customerConversations(cursor, abort.signal)
      .then(data => {
        if (!abort.signal.aborted && epoch === privacyEpoch.current) {
          setList(current => ({
            ...data,
            items: cursor
              ? [...new Map([...(current?.items ?? []), ...data.items].map(row => [row.id, row])).values()]
              : data.items,
          }));
          setDenied(false);
        }
      })
      .catch(failure => {
        if (!abort.signal.aborted && epoch === privacyEpoch.current) {
          if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) {
            onDenied(failure);
          } else {
            setError('Unable to load conversations. Retry.');
          }
        }
      })
      .finally(() => {
        if (!abort.signal.aborted && epoch === privacyEpoch.current) setLoading(false);
      });
    return () => abort.abort();
  }, [cursor, revision, blocked, onDenied, transcriptMemory, composerMemory]);

  useEffect(() => {
    const abort = new AbortController();
    const epoch = privacyEpoch.current;
    metadataController.current = abort;
    queueMicrotask(() => {
      if (!abort.signal.aborted && epoch === privacyEpoch.current) {
        setDetail(null);
        setIncoming(null);
      }
    });
    if (!selected || blocked) return () => abort.abort();
    customerConversation(selected, abort.signal)
      .then(data => {
        if (!abort.signal.aborted && epoch === privacyEpoch.current) {
          setDetail(data.conversation);
          setDenied(false);
          void markConversationRead('CUSTOMER', selected, csrfToken, abort.signal).catch(() => {});
        }
      })
      .catch(failure => {
        if (!abort.signal.aborted && epoch === privacyEpoch.current) {
          if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) {
            onDenied(failure);
          } else {
            setError('Unable to load conversation. Retry.');
          }
        }
      });
    return () => abort.abort();
  }, [selected, revision, blocked, onDenied]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type: string }>).detail?.type;
      if (type === 'invalidate' || type === 'session-expired') {
        privacyEpoch.current++;
        metadataController.current?.abort();
        listController.current?.abort();
        transcriptMemory.clear();
        composerMemory.clear();
        setDetail(null);
        setList(null);
        setRevision(value => value + 1);
      }
    };
    window.addEventListener(realtimeEvent, refresh);
    return () => window.removeEventListener(realtimeEvent, refresh);
  }, [transcriptMemory, composerMemory]);

  const clearLiveScope = useCallback(() => {
    privacyEpoch.current++;
    metadataController.current?.abort();
    listController.current?.abort();
    transcriptMemory.clear();
    composerMemory.clear();
    setDetail(null);
    setList(null);
    setIncoming(null);
    setLoading(false);
  }, [transcriptMemory, composerMemory]);

  const refreshLive = useCallback(
    async (signal: AbortSignal) => {
      const epoch = privacyEpoch.current;
      try {
        if (selected) {
          const current = await customerConversation(selected, signal);
          if (!signal.aborted && epoch === privacyEpoch.current) {
            setDetail(current.conversation);
            setDenied(false);
            setLiveRevision(value => value + 1);
            if (current.conversation.allowedActions.readMessages) {
              void markConversationRead('CUSTOMER', selected, csrfToken, signal).catch(() => {});
            }
          }
        }
        const data = await customerConversations(undefined, signal);
        if (!signal.aborted && epoch === privacyEpoch.current) {
          setLoading(false);
          setList(current => ({
            ...data,
            items: [
              ...new Map(
                [...data.items, ...(current?.items ?? []).filter(row => !data.items.some(fresh => fresh.id === row.id))].map(
                  row => [row.id, row]
                )
              ).values(),
            ],
            pageInfo: current && current.items.length > data.items.length ? current.pageInfo : data.pageInfo,
          }));
        }
      } catch (failure) {
        if (signal.aborted || epoch !== privacyEpoch.current) return;
        if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
        else setError('Live updates could not be loaded. Use Refresh to retry.');
      }
    },
    [selected, onDenied]
  );

  useChatRefresh(refreshLive, clearLiveScope, !blocked);

  const href = (id?: string) => {
    const values = new URLSearchParams(query.toString());
    if (id) values.set('conversationId', id);
    else values.delete('conversationId');
    return `/customer${values.size ? `?${values}` : ''}`;
  };

  const visible = !blocked && !denied && detail?.id === selected ? detail : null;

  return (
    <section
      aria-label="Customer conversations"
      className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:h-full tw:overflow-hidden tw:bg-slate-50"
    >
      {/* Column 1: Conversations Directory */}
      <aside
        aria-label="Your conversation list"
        className={
          (selected ? 'tw:hidden tw:md:flex' : 'tw:flex') +
          ' tw:w-full tw:shrink-0 tw:flex-col tw:border-r tw:border-slate-200/80 tw:bg-white tw:md:w-80 tw:min-h-0 tw:overflow-hidden'
        }
      >
        {/* Directory Header */}
        <header className="tw:shrink-0 tw:border-b tw:border-slate-100 tw:p-4 tw:space-y-3">
          <div className="tw:relative tw:flex tw:items-center tw:justify-between tw:gap-2">
            <h2 className="tw:text-base tw:font-bold tw:text-slate-900 tw:m-0">Conversations</h2>
            <button
              type="button"
              className="tw:absolute tw:top-0 tw:right-0 tw:w-px tw:h-px tw:opacity-[0.01] tw:overflow-hidden tw:border-0 tw:bg-transparent tw:p-0 tw:pointer-events-auto tw:cursor-default"
              disabled={blocked}
              onClick={() => {
                setDenied(false);
                setRevision(value => value + 1);
              }}
              title="Refresh conversations"
            >
              Refresh conversations
            </button>
          </div>

          {/* New Chat Actions */}
          <div className="tw:grid tw:grid-cols-2 tw:gap-2">
            <button
              type="button"
              className="tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:px-2.5 tw:py-2 tw:rounded-xl tw:bg-purple-50 tw:border tw:border-purple-200/70 tw:text-purple-700 tw:hover:bg-purple-100/70 tw:text-xs tw:font-bold tw:transition-all tw:cursor-pointer tw:disabled:opacity-50"
              onClick={() => setDialog('AI')}
              disabled={blocked || denied}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>New AI chat</span>
            </button>
            <button
              type="button"
              className="tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:px-2.5 tw:py-2 tw:rounded-xl tw:bg-emerald-50 tw:border tw:border-emerald-200/70 tw:text-emerald-700 tw:hover:bg-emerald-100/70 tw:text-xs tw:font-bold tw:transition-all tw:cursor-pointer tw:disabled:opacity-50"
              onClick={() => setDialog('DIRECT')}
              disabled={blocked || denied}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Message Staff</span>
            </button>
          </div>
        </header>

        {error && (
          <p role="alert" className="tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:m-0">
            {error}
          </p>
        )}

        {/* Scrollable Conversation List */}
        <div className="tw:flex-1 tw:overflow-y-auto tw:divide-y tw:divide-slate-100">
          {!blocked &&
            !denied &&
            list?.items.map(row => {
              const isAI = row.status === 'AI_ACTIVE' || row.entryType === 'AI';
              const isHandoff = row.status === 'PENDING_HANDOFF';
              const channelLabel = row.entryType === 'TRANSFERRED'
                ? 'Transferred'
                : isAI
                ? 'AI conversation'
                : 'Direct message';
              const statusLabel = isHandoff ? 'Pending' : 'Active';

              return (
                <Link
                  key={row.id}
                  href={href(row.id)}
                  prefetch={false}
                  aria-current={selected === row.id ? 'page' : undefined}
                  className={`tw:block tw:p-3.5 tw:text-xs tw:no-underline tw:transition-all tw:border-l-4 ${
                    selected === row.id
                      ? 'tw:bg-blue-50/70 tw:border-l-blue-600'
                      : 'tw:border-l-transparent tw:hover:bg-slate-50'
                  }`}
                >
                  <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
                    <span className="tw:truncate tw:font-bold tw:text-slate-900">
                      {row.subject}
                    </span>
                    <span
                      className={`tw:shrink-0 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold ${
                        isHandoff
                          ? 'tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200/60'
                          : 'tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/60'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mt-1.5">
                    <span className="tw:text-xs tw:text-slate-500">{channelLabel}</span>
                    {row.activityAt && (
                      <time
                        className="tw:text-xs tw:text-slate-400 tw:shrink-0 tw:tabular-nums"
                        dateTime={row.activityAt}
                      >
                        {new Date(row.activityAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                  </div>
                </Link>
              );
            })}

          {loading && <p role="status" className="tw:p-4 tw:text-xs tw:text-slate-500 tw:text-center">Loading conversations…</p>}
          {!loading && !list?.items.length && (
            <p className="tw:p-6 tw:text-xs tw:text-slate-500 tw:text-center">No conversations yet.</p>
          )}
          {list?.pageInfo.hasMore && (
            <div className="tw:p-3 tw:text-center">
              <button
                className={inboxButton + ' tw:w-full!'}
                disabled={loading}
                onClick={() => setCursor(list.pageInfo.nextCursor ?? undefined)}
              >
                Load more conversations
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Column 2: Main Chat View */}
      <div
        className={
          (selected ? 'tw:flex' : 'tw:hidden tw:md:flex') +
          ' tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-white tw:overflow-hidden'
        }
      >
        {selected && (
          <div className="tw:p-2.5 tw:border-b tw:border-slate-100 tw:bg-slate-50 tw:md:hidden">
            <Link
              href={href()}
              className="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-blue-700 tw:no-underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Conversation list
            </Link>
          </div>
        )}

        {visible ? (
          <>
            {/* Conversation Header Bar */}
            <header className="tw:shrink-0 tw:border-b tw:border-slate-200/80 tw:bg-white tw:p-4 tw:px-6 tw:shadow-2xs tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4">
              <div className="tw:min-w-0 tw:flex-1">
                <div className="tw:flex tw:items-center tw:gap-3">
                  <div
                    className={`tw:grid tw:place-items-center tw:w-10 tw:h-10 tw:rounded-full tw:text-white tw:text-sm tw:font-bold tw:shrink-0 tw:shadow-xs ${
                      visible.status === 'AI_ACTIVE'
                        ? 'tw:bg-gradient-to-tr tw:from-purple-600 tw:to-indigo-500'
                        : 'tw:bg-gradient-to-tr tw:from-blue-600 tw:to-indigo-500'
                    }`}
                  >
                    {visible.status === 'AI_ACTIVE' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    ) : (
                      <span>{(visible.staff?.fullName || 'Synthetic Staff A').slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="tw:min-w-0 tw:flex tw:flex-col tw:justify-center">
                    <div className="tw:flex tw:items-center tw:gap-2">
                      <h2 className="tw:m-0 tw:truncate tw:text-base tw:font-bold tw:text-slate-900 tw:leading-tight">
                        {visible.status === 'AI_ACTIVE'
                          ? 'AegisLife AI Assistant'
                          : (visible.staff?.fullName || 'Synthetic Staff A')}
                      </h2>
                      {visible.status === 'PENDING_HANDOFF' && (
                        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200/60">
                          <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-amber-500 tw:animate-pulse" />
                          Pending Staff
                        </span>
                      )}
                    </div>
                    <p className="tw:m-0 tw:truncate tw:text-xs tw:text-slate-500 tw:leading-tight tw:mt-0.5">
                      {visible.status === 'AI_ACTIVE'
                        ? `AI Assistant 24/7 · ${visible.subject}`
                        : `Support Specialist · ${visible.subject}`}
                    </p>
                  </div>
                </div>
              </div>

              {visible.allowedActions.requestStaff && (
                <button
                  type="button"
                  className={
                    inboxButton +
                    ' tw:text-xs! tw:font-bold tw:py-2! tw:px-3.5! tw:rounded-xl! tw:bg-emerald-600! tw:text-white! tw:border-emerald-600! tw:hover:bg-emerald-700! tw:shadow-xs'
                  }
                  onClick={() => setDialog('HANDOFF')}
                >
                  Request Staff support
                </button>
              )}
            </header>

            {/* Messages Transcript */}
            {visible.allowedActions.readMessages ? (
              <ConversationTranscript
                key={visible.id}
                id={visible.id}
                role="CUSTOMER"
                memory={transcriptMemory}
                incoming={incoming}
                refreshToken={liveRevision}
                onDenied={onDenied}
              />
            ) : (
              <div className="tw:flex-1 tw:flex tw:items-center tw:justify-center tw:p-6 tw:text-xs tw:text-slate-500">
                This legacy conversation requires review before it can be used.
              </div>
            )}

            {/* Composer */}
            {visible.allowedActions.send && (
              <ConversationComposer
                key={visible.id}
                id={visible.id}
                role="CUSTOMER"
                version={visible.controlVersion}
                csrfToken={csrfToken}
                memory={composerMemory}
                onMessage={setIncoming}
                onDenied={onDenied}
                onStale={() => setRevision(value => value + 1)}
              />
            )}
          </>
        ) : (
          <div className="tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:text-center tw:bg-slate-50/40">
            <div className="tw:w-16 tw:h-16 tw:rounded-3xl tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:text-blue-600 tw:grid tw:place-items-center tw:mb-4 tw:shadow-xs">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="tw:text-base tw:font-bold tw:text-slate-900">Select a conversation</h3>
            <p className="tw:mt-1.5 tw:max-w-sm tw:text-xs tw:leading-relaxed tw:text-slate-500">
              {blocked
                ? 'Session verification required.'
                : selected
                ? 'Select Refresh conversations to retry loading this conversation.'
                : 'Choose a conversation or start a new one.'}
            </p>
          </div>
        )}
      </div>

      {dialog && !blocked && !denied && (
        <CustomerHandoffDialog
          mode={dialog}
          conversationId={selected ?? undefined}
          version={visible?.controlVersion}
          subject={dialog === 'HANDOFF' ? visible?.subject : undefined}
          csrfToken={csrfToken}
          onClose={() => setDialog(null)}
          onDenied={onDenied}
          onComplete={id => {
            setDialog(null);
            setRevision(value => value + 1);
            window.history.pushState(null, '', href(id));
          }}
        />
      )}
    </section>
  );
}
