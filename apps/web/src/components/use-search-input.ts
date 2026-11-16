'use client';

import { useEffect, useRef } from 'react';

// A passive URL sync must not overwrite typing that started after navigation.
// Browser Back/Forward deliberately restores the search from that history entry.
export function useSearchInput(term: string) {
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  useEffect(() => {
    const current = (new URLSearchParams(window.location.search).get('search') ?? '').trim();
    if (input.current && !editing.current && current === term.trim()) input.current.value = term;
  }, [term]);
  useEffect(() => {
    const restore = () => {
      editing.current = false;
      if (input.current) input.current.value = (new URLSearchParams(window.location.search).get('search') ?? '').trim();
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  return { input, onInput: () => { editing.current = true; }, onSubmit: () => { editing.current = false; } };
}
