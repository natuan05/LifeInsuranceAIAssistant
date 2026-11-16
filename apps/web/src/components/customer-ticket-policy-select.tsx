'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ownPolicies, ownPolicyDetail } from '@/lib/policy-api';
type PolicyOption = { id: string; policyNumber: string };
export function CustomerTicketPolicySelect({ value, onChange, disabled = false }: {
  value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [options, setOptions] = useState<PolicyOption[]>([]);
  const [page, setPage] = useState(0), [hasMore, setHasMore] = useState(true), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<PolicyOption | null>(null);
  const [selectedError, setSelectedError] = useState<{ id: string; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const readPage = useCallback(async (nextPage: number, controller: AbortController) => {
    if (controller.signal.aborted) return;
    try {
      const result = await ownPolicies(nextPage, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (controller.signal.aborted || request.current !== controller) return;
      setOptions(previous => [...new Map([...previous, ...result.items.map(policy => ({ id: policy.id, policyNumber: policy.policyNumber }))].map(policy => [policy.id, policy])).values()]);
      setPage(result.page); setHasMore(result.page * result.pageSize < result.total); setError('');
    } catch {
      if (!controller.signal.aborted && request.current === controller) setError('Unable to load policies. Try again.');
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    void Promise.resolve().then(() => readPage(1, controller));
    return () => { request.current?.abort(); request.current = null; };
  }, [readPage]);
  const hasSelection = options.some(policy => policy.id === value);
  const selectedResolved = selected?.id === value;
  useEffect(() => {
    if (!value || hasSelection || page === 0 || selectedResolved) return;
    const controller = new AbortController();
    void ownPolicyDetail(value, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(({ policy }) => {
      if (!controller.signal.aborted) { setSelected({ id: policy.id, policyNumber: policy.policyNumber }); setSelectedError(null); }
    }).catch(() => {
      if (!controller.signal.aborted) setSelectedError({ id: value, message: 'The selected policy is unavailable. Choose another policy or no related policy.' });
    });
    return () => controller.abort();
  }, [value, hasSelection, page, selectedResolved]);
  function more() {
    if (disabled || request.current || !hasMore) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setError(''); void readPage(page + 1, controller);
  }
  const selectionError = selectedError?.id === value ? selectedError.message : '';
  return <div className="tw:space-y-2 tw:text-xs">
    <label className="tw:block tw:font-semibold tw:text-slate-700">Related policy (optional)
      <select aria-label="Related policy" value={value} disabled={disabled || loading} onChange={event => onChange(event.target.value)}
        className="tw:mt-1 tw:w-full tw:rounded-xl tw:border tw:border-slate-300 tw:bg-white tw:p-2 tw:text-sm tw:disabled:opacity-60">
        <option value="">No related policy</option>
        {value && !hasSelection && <option value={value}>{selected?.id === value ? selected.policyNumber : selectionError ? 'Selected policy unavailable' : 'Loading selected policy...'}</option>}
        {options.map(policy => <option key={policy.id} value={policy.id}>{policy.policyNumber}</option>)}
      </select>
    </label>
    {loading && <p role="status">Loading policies...</p>}
    {(error || selectionError) && <p role="alert" className="tw:text-red-700">{error || selectionError}</p>}
    {hasMore && <button type="button" disabled={disabled || loading} onClick={more}
      className="tw:rounded tw:px-2 tw:py-1 tw:text-blue-700 tw:underline tw:disabled:opacity-60">{error ? 'Retry policies' : 'Load more policies'}</button>}
  </div>;
}
