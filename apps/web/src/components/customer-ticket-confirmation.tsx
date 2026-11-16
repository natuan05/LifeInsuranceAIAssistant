'use client';
import { useEffect, useRef, useState } from 'react';
import { customerGetDraft, customerUpdateDraft, submitCustomerTicketIntent, type CustomerTicketIntent, type DraftWithConfirmation } from '@/lib/ticket-api';
import { CustomerTicketPolicySelect } from './customer-ticket-policy-select';
import { AuthError } from '@/lib/auth-api';
interface Props {
  actorId: string; conversationId: string; draftId: string; csrfToken: string; isOpen: boolean; blocked?: boolean;
  onClose: () => void; onSuccess: (ticket: { id: string; ticketCode: string; status: string }) => void;
}
export function CustomerTicketConfirmation(props: Props) {
  return <DraftScope key={`${props.actorId}:${props.conversationId}:${props.draftId}:${props.csrfToken}`} {...props} />;
}
function DraftScope(props: Props) {
  const [pendingIntent, setPendingIntent] = useState<CustomerTicketIntent | null>(null);
  return props.isOpen && !props.blocked ? <DraftDialog {...props} pendingIntent={pendingIntent} setPendingIntent={setPendingIntent} /> : null;
}
function DraftDialog({ conversationId, draftId, csrfToken, onClose, onSuccess, pendingIntent, setPendingIntent }: Props & {
  pendingIntent: CustomerTicketIntent | null; setPendingIntent: (intent: CustomerTicketIntent | null) => void;
}) {
  const [result, setResult] = useState<DraftWithConfirmation | null>(null);
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [policyId, setPolicyId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [unresolved, setUnresolved] = useState(Boolean(pendingIntent)), [revision, setRevision] = useState(0);
  const command = useRef<AbortController | null>(null), intent = useRef<CustomerTicketIntent | null>(pendingIntent);
  const dialog = useRef<HTMLDivElement>(null), closeCallback = useRef(onClose);
  useEffect(() => { closeCallback.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); command.current?.abort(); command.current = null; closeCallback.current(); }
    };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController(); command.current = controller;
    void customerGetDraft(conversationId, draftId, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(value => {
      if (controller.signal.aborted) return;
      setResult(value); setTitle(value.draft.title); setDescription(value.draft.description); setPolicyId(value.draft.policyId || ''); setError('');
    }).catch(() => { if (!controller.signal.aborted) setError('Unable to load this draft.'); }).finally(() => { if (command.current === controller) command.current = null; });
    return () => { controller.abort(); command.current?.abort(); command.current = null; };
  }, [conversationId, draftId, revision]);
  function close() { command.current?.abort(); command.current = null; onClose(); }
  async function save() {
    if (!result || command.current || unresolved || !title.trim() || !description.trim()) return;
    const controller = new AbortController(); command.current = controller; setBusy(true); setError('');
    try {
      const value = await customerUpdateDraft(conversationId, draftId, { expectedVersion: result.draft.version, title: title.trim(), description: description.trim(), policyId: policyId || null }, csrfToken, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (controller.signal.aborted || command.current !== controller) return;
      setResult(value); setTitle(value.draft.title); setDescription(value.draft.description); setPolicyId(value.draft.policyId || ''); setEditing(false);
    } catch { if (!controller.signal.aborted) setError('Unable to save. Reload the draft and review its latest revision before confirming.'); }
    finally { if (command.current === controller) { command.current = null; setBusy(false); } }
  }
  async function confirm() {
    if (command.current || editing || (!result && !intent.current) || (result?.draft.state !== 'DRAFT' && !intent.current)) return;
    const checking = Boolean(intent.current);
    if (!intent.current) intent.current = { key: crypto.randomUUID(), operation: 'CONFIRM', draftId, version: result!.draft.version, textVersion: result!.confirmation.textVersion };
    setPendingIntent(intent.current);
    const current = intent.current, controller = new AbortController(); command.current = controller; setBusy(true); setUnresolved(true); setError('');
    try {
      const receipt = await submitCustomerTicketIntent(current, csrfToken, controller.signal, checking);
      if (controller.signal.aborted || command.current !== controller || intent.current !== current) return;
      intent.current = null; setPendingIntent(null); onSuccess(receipt.ticket); onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof AuthError && [400, 404, 409].includes(cause.status)) {
          intent.current = null; setPendingIntent(null); setUnresolved(false);
          setResult(null); setEditing(false);
          setError('This draft cannot be confirmed from the current review. Reload the draft and review its latest state.');
        } else setError(cause instanceof Error ? cause.message : 'Check this request before submitting again.');
      }
    }
    finally { if (command.current === controller) { command.current = null; setBusy(false); } }
  }
  const field = 'tw:w-full tw:rounded-xl tw:border tw:border-slate-300 tw:p-2 tw:text-sm';
  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ticket-confirm-title" className="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:items-center tw:justify-center tw:bg-slate-900/50 tw:p-4">
    <div className="tw:w-full tw:max-w-lg tw:max-h-[90dvh] tw:overflow-y-auto tw:space-y-4 tw:rounded-2xl tw:bg-white tw:p-6 tw:shadow-xl">
      <h2 id="ticket-confirm-title" className="tw:text-lg tw:font-bold">Review support ticket</h2>
      {error && <p role="alert" className="tw:text-sm tw:text-red-700">{error}</p>}
      {!result ? <p role="status">{error ? 'Reload the draft to continue.' : 'Loading draft...'}</p> : editing ? <div className="tw:space-y-3">
        <label className="tw:block">Ticket title<input className={field} value={title} maxLength={255} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
        <label className="tw:block">Description<textarea className={field} value={description} maxLength={4000} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
        <CustomerTicketPolicySelect value={policyId} onChange={setPolicyId} disabled={busy} />
      </div> : <section className="tw:space-y-2 tw:text-sm">
        <h3 className="tw:font-semibold">{result.draft.title}</h3><p className="tw:whitespace-pre-wrap tw:break-words">{result.draft.description}</p>
        <p>{result.draft.policyNumber || 'No related policy'} &middot; Revision {result.draft.version}</p>
        <p>{result.confirmation.text}</p><p className="tw:text-xs tw:text-slate-500">{result.confirmation.textVersion}</p>
      </section>}
      <div className="tw:flex tw:flex-wrap tw:gap-3 tw:text-sm">
        <button type="button" onClick={close}>Close</button>
        {!unresolved && <button type="button" disabled={busy} onClick={() => { setResult(null); setEditing(false); setRevision(v => v + 1); }}>Reload draft</button>}
        {result && !unresolved && !editing && <button type="button" disabled={busy || result.draft.state !== 'DRAFT'} onClick={() => setEditing(true)}>Edit draft</button>}
        {editing ? <button type="button" disabled={busy} onClick={() => void save()}>Save and review</button> : <button type="button" disabled={busy || (!result && !unresolved) || (result?.draft.state !== 'DRAFT' && !unresolved)} onClick={() => void confirm()}>{busy ? 'Checking...' : unresolved ? 'Check and retry' : 'Confirm ticket'}</button>}
      </div>
    </div>
  </div>;
}
