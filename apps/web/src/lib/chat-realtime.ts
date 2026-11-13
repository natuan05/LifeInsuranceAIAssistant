'use client';
import { useEffect } from 'react';
export const chatEvent = 'core:chat-changed';
export const chatScopeEvent = 'core:chat-scope-changed';
export const notificationEvent = 'core:notifications-changed';
export const connectionEvent = 'core:connection-changed';

// Debounced, single-flight resync. Events during a request set dirty rather than
// aborting its response or losing the final event. Ownership changes abort work.
export function useChatRefresh(refresh: (signal: AbortSignal) => Promise<void>, clearScope: () => void, enabled = true, eventName = chatEvent) {
  useEffect(() => {
    if (!enabled) return;
    let controller = new AbortController();
    let busy = false, dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (controller.signal.aborted || busy || !dirty) return;
      busy = true; dirty = false;
      try { await refresh(controller.signal); } catch { /* Region renders its own error; another event/manual retry can recover. */ }
      finally { busy = false; if (dirty && !controller.signal.aborted) timer = setTimeout(() => void run(), 100); }
    };
    const schedule = () => { dirty = true; if (!busy) { clearTimeout(timer); timer = setTimeout(() => void run(), 100); } };
    const revoke = () => { controller.abort(); controller = new AbortController(); clearScope(); schedule(); };
    window.addEventListener(eventName, schedule); window.addEventListener(chatScopeEvent, revoke);
    window.addEventListener('online', schedule);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener(eventName, schedule); window.removeEventListener(chatScopeEvent, revoke); window.removeEventListener('online', schedule); };
  }, [refresh, clearScope, enabled, eventName]);
}
