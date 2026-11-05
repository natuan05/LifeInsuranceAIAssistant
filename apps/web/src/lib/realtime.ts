'use client';
import { useEffect } from 'react';
import { chatEvent, chatScopeEvent, notificationEvent, connectionEvent } from './chat-realtime';
import { coreApiUrl } from './core-api';

export const realtimeEvent = 'core:data-changed';
export const ticketEvent = 'core:tickets-changed';

export function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const seen = new Set<string>();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function connect() {
      const base = new URL(coreApiUrl, window.location.origin);
      if (['localhost', '127.0.0.1'].includes(base.hostname) && ['localhost', '127.0.0.1'].includes(window.location.hostname)) base.hostname = window.location.hostname;
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      base.pathname = `${base.pathname.replace(/\/$/, '')}/realtime`;
      socket = new WebSocket(base);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type?: string; eventId?: string; conversationId?: string };
          if (['ready', 'invalidate', 'session-expired'].includes(message.type ?? '')) window.dispatchEvent(new CustomEvent(realtimeEvent, { detail: { type: message.type } }));
          if (message.type === 'ready') { delay = 1000; window.dispatchEvent(new CustomEvent(connectionEvent, { detail: { connected: true } })); window.dispatchEvent(new CustomEvent(chatEvent, { detail: { type: 'resync' } })); window.dispatchEvent(new CustomEvent(notificationEvent)); }
          if (['chat-invalidated', 'chat-scope-invalidated', 'notifications-invalidated', 'tickets-invalidated'].includes(message.type ?? '') && uuid.test(message.eventId ?? '') && (message.type !== 'chat-invalidated' || uuid.test(message.conversationId ?? ''))) {
            const key = `${message.type}:${message.eventId}`;
            if (seen.has(key)) return;
            seen.add(key); if (seen.size > 256) seen.delete(seen.values().next().value!);
            const name = message.type === 'tickets-invalidated' ? ticketEvent : message.type === 'chat-invalidated' ? chatEvent : message.type === 'chat-scope-invalidated' ? chatScopeEvent : notificationEvent;
            window.dispatchEvent(new CustomEvent(name, { detail: message }));
          }
        } catch { /* Ignore unsupported messages. */ }
      };
      socket.onclose = event => {
        if (stopped) return;
        window.dispatchEvent(new CustomEvent(connectionEvent, { detail: { connected: false } }));
        if (event.code === 4001) { window.dispatchEvent(new CustomEvent(realtimeEvent, { detail: { type: 'session-expired' } })); return; }
        retry = setTimeout(connect, delay + Math.random() * 500);
        delay = Math.min(delay * 2, 30000);
      };
    }
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, [enabled]);
}
