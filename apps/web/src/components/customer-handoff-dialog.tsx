'use client';
import { useEffect, useRef, useState } from 'react';
import { chatSupport, customerConversation, ConversationError, createConversation, requestHandoff, type ChatSupport, type CreateIntent, type HandoffIntent } from '@/lib/conversation-api';
import { inboxButton } from './conversation-transcript';
export function CustomerHandoffDialog({ mode, conversationId, version, subject, csrfToken, onClose, onComplete, onDenied }: {
  mode: 'AI' | 'DIRECT' | 'HANDOFF'; conversationId?: string; version?: number; subject?: string; csrfToken: string;
  onClose: () => void; onComplete: (id: string) => void; onDenied: (error: ConversationError) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [controlVersion, setControlVersion] = useState(version);
  const [support, setSupport] = useState<ChatSupport | null>(null);
  const [title, setTitle] = useState(subject ?? '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const command = useRef<CreateIntent | HandoffIntent | null>(null);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const element = dialog.current; const previous = document.activeElement;
    element?.showModal();
    return () => { controller.current?.abort(); element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    chatSupport(abort.signal).then(result => { if (!abort.signal.aborted) setSupport(result); }).catch(failure => { if (!abort.signal.aborted) { if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure); else setError(failure instanceof ConversationError ? failure.message : 'Unable to check staff availability. Retry.'); } });
    return () => abort.abort();
  }, [revision, onDenied]);
  const submit = async () => {
    if (lock.current || !support) return;
    if (mode === 'HANDOFF' && !title.trim()) { setError('Enter a subject to share with Staff.'); return; }
    lock.current = true; setPending(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const intent = command.current ?? (mode === 'HANDOFF' ? { clientRequestId: crypto.randomUUID(), expectedVersion: controlVersion!, expectedAssignmentVersion: support.assignmentVersion, sharedSubject: title.trim(), sharedReason: reason.trim(), consent: { confirmed: true as const, textVersion: support.handoffConsent.textVersion, scope: support.handoffConsent.scope } } : { clientRequestId: crypto.randomUUID(), kind: mode, subject: title.trim(), ...(mode === 'DIRECT' ? { expectedAssignmentVersion: support.assignmentVersion } : {}) });
    command.current = intent;
    try {
      const result = mode === 'HANDOFF' ? await requestHandoff(conversationId!, intent as HandoffIntent, csrfToken, abort.signal) : await createConversation(intent as CreateIntent, csrfToken, abort.signal);
      if (!abort.signal.aborted) onComplete(result.conversation.id);
    } catch (failure) {
      if (abort.signal.aborted) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) { onDenied(failure); onClose(); }
      else if (failure instanceof ConversationError && [400, 409, 429].includes(failure.status)) {
        command.current = null; setUnknown(false); setSupport(null); setRevision(value => value + 1);
        if (mode === 'HANDOFF' && failure.status === 409) {
          try { const current = await customerConversation(conversationId!, abort.signal); if (!abort.signal.aborted) setControlVersion(current.conversation.controlVersion); } catch { /* Explicit retry still rechecks the current version at Core. */ }
        }
        setError(failure.status === 409 ? 'Routing or conversation changed. Review the refreshed Staff information and confirm again.' : failure.message);
      } else { setUnknown(true); setError('Result unknown. Retry the same request to confirm its result.'); }
    } finally { if (!abort.signal.aborted) { lock.current = false; setPending(false); } }
  };
  const unavailable = mode !== 'AI' && support?.availability !== 'AVAILABLE';
  return <dialog ref={dialog} tabIndex={-1} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} aria-labelledby="customer-chat-dialog-title" className="tw:fixed tw:inset-0 tw:m-auto tw:max-h-[90dvh] tw:w-[min(92vw,32rem)] tw:overflow-auto tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:p-6 tw:text-slate-900 tw:backdrop:bg-slate-900/40" onCancel={event => { event.preventDefault(); if (!pending && !unknown) onClose(); }}>
    <h2 id="customer-chat-dialog-title" className="tw:text-xl tw:font-semibold">{mode === 'HANDOFF' ? 'Request Staff support' : mode === 'DIRECT' ? 'Message your Staff' : 'New AI conversation'}</h2>
    {mode === 'AI' ? <p className="tw:mt-3 tw:text-sm tw:leading-6 tw:text-slate-600">Your messages can be saved. Automatic AI replies are not available yet.</p> : support && <><p className="tw:mt-3 tw:text-sm">Staff: {support.staff?.fullName ?? 'Currently unavailable'}</p>{mode === 'HANDOFF' && <p className="tw:mt-3 tw:rounded-lg tw:bg-blue-50 tw:p-3 tw:text-sm tw:leading-6">The entire Customer-visible history of this conversation, including earlier AI messages, will be shared with this Staff member after they accept. This does not create a Ticket.</p>}</>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="tw:mt-4 tw:block tw:text-sm tw:font-medium" htmlFor="chat-subject">Subject</label><input autoFocus id="chat-subject" maxLength={180} required={mode === 'HANDOFF'} value={title} disabled={pending || unknown} onChange={event => setTitle(event.target.value)} className="tw:mt-2 tw:w-full tw:rounded-lg tw:border tw:border-slate-300 tw:p-3 tw:text-sm"/>
      {mode === 'HANDOFF' && <><label className="tw:mt-4 tw:block tw:text-sm tw:font-medium" htmlFor="chat-reason">Reason (optional)</label><textarea id="chat-reason" maxLength={1000} rows={3} value={reason} disabled={pending || unknown} onChange={event => setReason(event.target.value)} className="tw:mt-2 tw:w-full tw:rounded-lg tw:border tw:border-slate-300 tw:p-3 tw:text-sm"/></>}
      {!support && !error && <p role="status" className="tw:mt-3 tw:text-sm">Checking availability…</p>}
      {unavailable && support && <p className="tw:mt-3 tw:text-sm tw:text-amber-900">Staff support is currently unavailable.</p>}
      {error && <p role="alert" className="tw:mt-3 tw:text-sm tw:text-red-800">{error}</p>}
      {!support && error && <button type="button" className={inboxButton + ' tw:mt-3!'} onClick={() => { setError(''); setRevision(value => value + 1); }}>Retry availability</button>}
      <div className="tw:mt-6 tw:flex tw:flex-wrap tw:justify-end tw:gap-3"><button type="button" disabled={pending || unknown} onClick={onClose} className={inboxButton}>Cancel</button><button type="submit" disabled={pending || !support || unavailable || !csrfToken} className={inboxButton + ' tw:bg-blue-600! tw:text-white!'}>{pending ? 'Checking…' : unknown ? 'Retry same request' : mode === 'HANDOFF' ? 'Agree and request Staff support' : 'Create conversation'}</button></div>
    </form>
  </dialog>;
}
