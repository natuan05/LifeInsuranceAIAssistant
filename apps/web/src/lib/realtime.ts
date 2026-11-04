'use client';
import { useEffect } from 'react';
import { coreApiUrl } from './core-api';

export const realtimeEvent = 'core:data-changed';

export function useRealtime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    function connect() {
      const base = new URL(coreApiUrl, window.location.origin);
      if (['localhost', '127.0.0.1'].includes(base.hostname) && ['localhost', '127.0.0.1'].includes(window.location.hostname)) base.hostname = window.location.hostname;
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      base.pathname = `${base.pathname.replace(/\/$/, '')}/realtime`;
      socket = new WebSocket(base);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type?: string };
          if (['ready', 'invalidate', 'session-expired'].includes(message.type ?? '')) window.dispatchEvent(new Event(realtimeEvent));
          if (message.type === 'ready') delay = 1000;
        } catch { /* Ignore unsupported messages. */ }
      };
      socket.onclose = event => {
        if (stopped) return;
        if (event.code === 4001) { window.dispatchEvent(new Event(realtimeEvent)); return; }
        retry = setTimeout(connect, delay + Math.random() * 500);
        delay = Math.min(delay * 2, 30000);
      };
    }
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, [enabled]);
}
