'use client';
import { useEffect, useRef, useState } from 'react';
import { ConversationError, lookupMessage, sendMessage, type ChatMessage, type SendIntent } from '@/lib/conversation-api';
import { inboxButton } from './conversation-transcript';
export type ComposerSnapshot = { draft: string; intent: SendIntent | null; unknown: boolean };
export function ConversationComposer({ id, role, version, csrfToken, memory, onMessage, onDenied, onStale }: {
  id: string; role: 'STAFF' | 'CUSTOMER'; version: number; csrfToken: string; memory: Map<string, ComposerSnapshot>;
  onMessage: (message: ChatMessage) => void; onDenied: (error: ConversationError) => void; onStale: () => void;
}) {
  const [draft, setDraft] = useState(() => memory.get(id)?.draft ?? '');
  const [intent, setIntent] = useState<SendIntent | null>(() => memory.get(id)?.intent ?? null);
  const [unknown, setUnknown] = useState(() => Boolean(memory.get(id)?.intent));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false), composing = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const send = async () => {
    if (lock.current) return;
    const content = draft.replace(/\r\n?/g, '\n');
    if (!intent && (!content.trim() || [...content].length > 4000)) { setError('Enter a message of 1–4000 characters.'); input.current?.focus(); return; }
    const command = intent ?? { clientMessageId: crypto.randomUUID(), expectedVersion: version, content };
    memory.set(id, { draft, intent: command, unknown: true });
    setIntent(command); setPending(true); setError(''); lock.current = true;
    const abort = new AbortController(); controller.current = abort;
    try {
      let ack;
      if (unknown) {
        try { ack = await lookupMessage(role, id, command.clientMessageId, abort.signal); }
        catch (failure) { if (!(failure instanceof ConversationError && failure.status === 404)) throw failure; }
      }
      ack ??= await sendMessage(role, id, command, csrfToken, abort.signal);
      if (abort.signal.aborted) return;
      onMessage(ack.message); setIntent(null); setUnknown(false);
      const latest = memory.get(id)?.draft ?? draft;
      const remaining = latest.replace(/\r\n?/g, '\n') === command.content ? '' : latest;
      setDraft(remaining); memory.set(id, { draft: remaining, intent: null, unknown: false });
      input.current?.focus();
    } catch (failure) {
      if (abort.signal.aborted) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) { memory.delete(id); onDenied(failure); }
      else if (failure instanceof ConversationError && failure.status === 429 && unknown) {
        setUnknown(true); setError('Please wait a minute, then check the same message again. Its result is still unknown.');
      } else if (failure instanceof ConversationError && [400, 409, 429].includes(failure.status)) {
        setIntent(null); setUnknown(false); memory.set(id, { draft: memory.get(id)?.draft ?? draft, intent: null, unknown: false });
        setError(failure.status === 409 ? 'Conversation changed. Review its current state before sending again.' : failure.status === 429 ? 'Too many messages. Wait a minute before retrying.' : 'Message was rejected. Check its length and content.');
        if (failure.status === 409) onStale();
      } else { setUnknown(true); setError('The result is unknown. Check this message before sending another.'); }
    } finally { if (!abort.signal.aborted) { lock.current = false; setPending(false); } }
  };
  return <form aria-label="Message composer" className="tw:shrink-0 tw:border-t tw:border-slate-200/80 tw:bg-white tw:p-3" onSubmit={event => { event.preventDefault(); void send(); }}>
    {intent && <div className="tw:mb-2 tw:rounded-lg tw:bg-blue-50 tw:p-2.5 tw:text-xs tw:whitespace-pre-wrap tw:break-words tw:[overflow-wrap:anywhere]"><p>{intent.content}</p><p role="status" className="tw:mt-1 tw:text-[11px] tw:text-slate-600">{pending ? 'Sending / checking result…' : 'Result unknown'}</p></div>}
    <label htmlFor={`compose-${id}`} className="tw:sr-only">Message</label>
    <div className="tw:flex tw:items-end tw:gap-2 tw:rounded-xl tw:border tw:border-slate-300 tw:bg-white tw:p-1.5 tw:focus-within:border-blue-600 tw:focus-within:ring-2 tw:focus-within:ring-blue-600/20 tw:transition-all">
      <textarea 
        ref={input} 
        id={`compose-${id}`} 
        rows={1} 
        value={draft} 
        readOnly={unknown && !pending} 
        placeholder="Write a message…" 
        className="tw:min-h-[38px] tw:max-h-24 tw:flex-1 tw:resize-none tw:border-0 tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-sm tw:leading-5 tw:text-slate-900 tw:outline-none tw:placeholder:text-slate-400" 
        onChange={event => { 
          setDraft(event.target.value); 
          const current = memory.get(id); 
          memory.set(id, { draft: event.target.value, intent: current?.intent ?? null, unknown: current?.unknown ?? false }); 
        }} 
        onCompositionStart={() => { composing.current = true; }} 
        onCompositionEnd={() => { composing.current = false; }} 
        onKeyDown={event => { 
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) { 
            event.preventDefault(); 
            void send(); 
          } 
        }}
      />
      <button 
        type="submit" 
        disabled={pending || !csrfToken} 
        className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-blue-600 tw:px-4 tw:py-2 tw:text-xs tw:font-semibold tw:text-white tw:shadow-xs tw:hover:bg-blue-700 tw:disabled:opacity-50 tw:cursor-pointer tw:transition-all tw:shrink-0">
        <span>{unknown ? 'Check message result' : pending ? 'Sending…' : 'Send'}</span>
        {!unknown && !pending && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        )}
      </button>
    </div>
    {role === 'CUSTOMER' && <p className="tw:mt-1 tw:text-[11px] tw:text-slate-500">Enter to send · Shift+Enter for a new line</p>}
    {error && <p role="alert" className="tw:mt-2 tw:text-sm tw:text-red-800">{error}</p>}
  </form>;
}
