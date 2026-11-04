'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { listProducts, readProduct, readProductDocuments, productDocumentAccess, type ProductDocument, type ProductDocuments } from '@/lib/product-api';
import { realtimeEvent } from '@/lib/realtime';
import { SignedPdfPreview } from './signed-pdf-preview';
import { useAuthorizedRead } from './use-authorized-read';

const button = 'tw:inline-flex tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:text-xs tw:font-medium tw:text-slate-700 tw:hover:bg-slate-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600 tw:disabled:cursor-default tw:disabled:opacity-50';
const options = { unavailable: 'This product or document is unavailable or is no longer published.',
  failure: (status?: number, stale?: boolean) => status === 429 ? 'Too many product requests. Wait before trying again.'
    : stale ? 'Unable to refresh. Previously loaded information may be out of date.' : 'Unable to load this information. Please try again.' };
function PanelIcon({ expand = false }: { expand?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d={expand ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'} /></svg>;
}
function ReadNotice({ loading, refreshing, error, retry, retryDisabled, action = 'Try again' }: {
  loading: boolean; refreshing: boolean; error?: string; retry: () => void; retryDisabled: boolean; action?: string;
}) {
  if (loading) return <p role="status" className="tw:p-5 tw:text-sm tw:text-slate-600">Loading products…</p>;
  if (error) return <div role="alert" className="tw:p-5 tw:text-sm tw:leading-6 tw:text-red-700"><p>{error}</p><button type="button" className={`${button} tw:mt-3`} disabled={retryDisabled} onClick={retry}>{action}</button></div>;
  return refreshing ? <span role="status" className="tw:sr-only">Updating product information…</span> : null;
}

type LoadedDocuments = ProductDocuments & { pages: number };
function ProductDocuments({ productId, productCode, csrfToken, blocked }: { productId: string; productCode: string; csrfToken: string; blocked: boolean }) {
  const snapshot = useRef<LoadedDocuments | null>(null), operation = useRef<'refresh' | 'more'>('refresh');
  const [selected, setSelected] = useState<ProductDocument | null>(null);
  const initialized = useRef(false);
  const state = useAuthorizedRead(productId, async signal => {
    const previous = snapshot.current, more = operation.current === 'more'; operation.current = 'refresh';
    let value: LoadedDocuments;
    if (more && previous?.pageInfo.nextCursor) {
      const page = await readProductDocuments(productId, previous.pageInfo.nextCursor, signal); signal.throwIfAborted();
      const items = new Map(previous.items.map(doc => [doc.documentId, doc])); page.items.forEach(doc => items.set(doc.documentId, doc));
      value = { items: [...items.values()], pageInfo: page.pageInfo, pages: previous.pages + 1 };
    } else {
      const items = new Map<string, ProductDocument>(); let cursor: string | null = null, pages = 0;
      let pageInfo: ProductDocuments['pageInfo'] = { hasMore: false, nextCursor: null };
      do {
        const page = await readProductDocuments(productId, cursor, signal); signal.throwIfAborted();
        page.items.forEach(doc => items.set(doc.documentId, doc)); pageInfo = page.pageInfo; cursor = pageInfo.nextCursor; pages++;
      } while (cursor && pages < (previous?.pages ?? 1));
      value = { items: [...items.values()], pageInfo, pages };
    }
    snapshot.current = value; return value;
  }, false, options);
  const { retry } = state;
  const refresh = () => { operation.current = 'refresh'; state.retry(); };
  useEffect(() => {
    const revalidate = () => { operation.current = 'refresh'; retry(); };
    window.addEventListener(realtimeEvent, revalidate); return () => window.removeEventListener(realtimeEvent, revalidate);
  }, [retry]);
  useEffect(() => {
    if (initialized.current || !state.data?.items.length) return;
    let disposed = false;
    queueMicrotask(() => { if (!disposed && !initialized.current) { initialized.current = true; setSelected(state.data!.items[0]); } });
    return () => { disposed = true; };
  }, [state.data]);
  const published = selected && state.data?.items.find(doc => doc.documentId === selected.documentId);
  const current = published ? selected : null;
  const changed = published && selected && published.versionId !== selected.versionId;
  return <>
    <section aria-label="Product documents" className="tw:min-w-0">
      <div className="tw:mb-3"><h3 className="tw:text-sm tw:font-semibold">Product documents</h3><p className="tw:mt-1 tw:text-xs tw:leading-5 tw:text-slate-600">General product information. Check the customer&apos;s policy for the terms that apply.</p></div>
      <ReadNotice {...state} retry={refresh} action="Retry documents" />
      {state.data && <>
        {(state.data.items.length > 1 || state.data.pageInfo.hasMore) && <div className="tw:mb-3"><label htmlFor="product-document" className="tw:mb-2 tw:block tw:text-xs tw:font-medium">Document</label><select id="product-document" value={published?.documentId ?? ''} disabled={blocked} onChange={event => setSelected(state.data!.items.find(doc => doc.documentId === event.target.value) ?? null)} className="tw:w-full tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:text-sm tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600"><option value="" disabled>Select a document</option>{state.data.items.map(doc => <option key={doc.documentId} value={doc.documentId}>{doc.title} - Version {doc.versionNumber}</option>)}</select></div>}
        {!state.data.items.length && <p className="tw:py-5 tw:text-sm tw:leading-6 tw:text-slate-600">No product documents are currently available.</p>}
        {state.data.pageInfo.hasMore && <button type="button" className={`${button} tw:mt-4`} disabled={blocked || state.refreshing || state.retryDisabled} onClick={() => { operation.current = 'more'; state.retry(); }}>Load more documents</button>}
      </>}
      {selected && state.data && !current && <p role="status" className="tw:mt-4 tw:text-sm tw:leading-6 tw:text-amber-800">This document is no longer available.</p>}
      {changed && <div role="status" className="tw:mt-3 tw:text-sm tw:text-amber-800">A new document version is available. Your current PDF remains open.<button type="button" className={`${button} tw:ml-3`} disabled={blocked} onClick={() => setSelected(published)}>Open version {published.versionNumber}</button></div>}
    </section>
    {current && <section aria-label="Product PDF" className="tw:mt-6 tw:min-w-0 tw:overflow-hidden tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600">
      <SignedPdfPreview key={`${productId}:${current.documentId}:${current.versionId}`} resourceKey={`${productId}:${current.documentId}:${current.versionId}`} document={current} title={current.title} description="Product document" filename={`${productCode}-${current.documentId}-v${current.versionNumber}.pdf`} compact manualReload={false} blocked={blocked} unavailable="This document is unavailable or access has changed."
        access={(intent, signal) => productDocumentAccess(productId, current, intent, csrfToken, signal)} />
    </section>}
  </>;
}

function ProductDetail({ id, csrfToken, blocked }: { id: string; csrfToken: string; blocked: boolean }) {
  const state = useAuthorizedRead(id, async signal => (await readProduct(id, signal)).product, true, options);
  return <section aria-label="Product details" className="tw:min-h-0 tw:min-w-0 tw:flex-1 tw:overflow-y-auto tw:px-5 tw:py-4 tw:sm:px-6" aria-busy={state.loading || state.refreshing}>
    <ReadNotice {...state} />
    {state.data && <div className="tw:mx-auto tw:w-full tw:max-w-5xl"><header className="tw:mb-4"><h2 className="tw:wrap-anywhere tw:text-xl tw:font-semibold tw:leading-8">{state.data.name}</h2><p className="tw:mt-1 tw:wrap-anywhere tw:text-xs tw:font-medium tw:tracking-wide tw:text-slate-600">{state.data.productCode}</p><p className="tw:mt-2 tw:max-w-[70ch] tw:whitespace-pre-line tw:wrap-anywhere tw:text-sm tw:leading-6 tw:text-slate-600">{state.data.summary ?? 'No description provided.'}</p></header>
      <ProductDocuments key={id} productId={id} productCode={state.data.productCode} csrfToken={csrfToken} blocked={blocked} />
    </div>}
  </section>;
}

export function StaffProducts({ csrfToken, blocked = false }: { csrfToken: string; blocked?: boolean }) {
  const search = useSearchParams(), params = useParams<{ productId?: string }>();
  const selected = params.productId, term = (search.get('search') ?? '').trim(), rawPage = search.get('page') ?? '1';
  const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 && Number(rawPage) <= 100000 ? Number(rawPage) : 1;
  const [collapsed, setCollapsed] = useState(false); const input = useRef<HTMLInputElement>(null);
  const state = useAuthorizedRead(JSON.stringify([term, page]), signal => listProducts(term, page, signal), true, options);
  useEffect(() => { if (input.current) input.current.value = term; }, [term]);
  function url(id = selected, nextPage = page, nextTerm = term) {
    const query = new URLSearchParams(); if (nextTerm) query.set('search', nextTerm); if (nextPage > 1) query.set('page', String(nextPage));
    return `/staff/products${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query : ''}`;
  }
  const resultsUrl = url('');
  function filter(nextPage: number, nextTerm = term) {
    const target = url(selected, nextPage, nextTerm);
    if (target === window.location.pathname + window.location.search) state.retry(); else window.history.pushState(null, '', target);
  }
  useEffect(() => {
    if (state.data && page > 1 && !state.data.items.length) {
      const lastPage = Math.max(1, Math.ceil(state.data.total / state.data.pageSize));
      if (page > lastPage) window.history.replaceState(null, '', url(selected, lastPage));
    }
    // URL inputs and response determine one correction when the catalog shrinks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, page, selected, term]);
  return <section aria-label="Products" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-slate-50 tw:text-slate-900 tw:selection:bg-blue-100">
    <header className="tw:shrink-0 tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3 tw:sm:px-6"><h1 className="tw:text-xl tw:font-semibold">Products</h1><p className="tw:mt-1 tw:text-xs tw:leading-5 tw:text-slate-600">Browse product information and current product documents.</p></header>
    <div className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:max-[1000px]:flex-col">
      {collapsed && <div className="tw:flex tw:w-12 tw:shrink-0 tw:justify-center tw:border-0 tw:border-r tw:border-solid tw:border-slate-200 tw:bg-white tw:pt-4 tw:max-[1000px]:hidden"><button id="expand-products" type="button" aria-label="Expand product results" aria-controls="product-results" aria-expanded={false} className={`${button} tw:h-9 tw:w-9 tw:p-0!`} onClick={() => { setCollapsed(false); requestAnimationFrame(() => input.current?.focus()); }}><PanelIcon expand /></button></div>}
      <aside id="product-results" aria-label="Product search and results" className={`tw:flex tw:w-[340px] tw:shrink-0 tw:flex-col tw:overflow-y-auto tw:border-0 tw:border-r tw:border-solid tw:border-slate-200 tw:bg-white tw:max-[1000px]:w-full ${collapsed ? 'tw:min-[1001px]:hidden' : ''} ${selected ? 'tw:max-[1000px]:hidden' : ''}`}>
        <form role="search" aria-label="Search products" className="tw:shrink-0 tw:p-4" onSubmit={event => { event.preventDefault(); if (state.retryDisabled) return; filter(1, String(new FormData(event.currentTarget).get('search') ?? '').trim()); }}>
          <div className="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:gap-2"><label htmlFor="product-search" className="tw:text-xs tw:font-medium">Search products</label><button type="button" aria-label="Collapse product results" aria-controls="product-results" aria-expanded={!collapsed} className="tw:inline-flex tw:h-8 tw:w-8 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md tw:text-slate-600 tw:hover:bg-slate-100 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:hidden" onClick={() => { setCollapsed(true); requestAnimationFrame(() => document.getElementById('expand-products')?.focus()); }}><PanelIcon /></button></div>
          <input ref={input} id="product-search" name="search" type="search" defaultValue={term} maxLength={100} placeholder="Product name or code" className="tw:box-border tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2.5 tw:font-[inherit] tw:text-sm tw:caret-blue-600 tw:placeholder:text-slate-500 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600" />
        </form>
        <div aria-busy={state.loading || state.refreshing} className="tw:min-h-0 tw:flex-1 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200"><ReadNotice {...state} />
          {state.data && <><p aria-live="polite" className="tw:px-4 tw:py-3 tw:text-xs tw:tabular-nums tw:text-slate-600">{state.data.total} {state.data.total === 1 ? 'product' : 'products'}</p><ul className="tw:m-0 tw:list-none tw:p-0">{state.data.items.map(product => <li key={product.id}><Link href={url(product.id)} aria-current={selected === product.id ? 'page' : undefined} className={`tw:block tw:border-0 tw:border-b tw:border-solid tw:border-slate-100 tw:px-4 tw:py-4 tw:text-slate-900 tw:no-underline tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 ${selected === product.id ? 'tw:bg-blue-50' : ''}`}><p className="tw:wrap-anywhere tw:text-sm tw:font-semibold tw:leading-6">{product.name}</p><p className="tw:mt-1 tw:wrap-anywhere tw:text-xs tw:text-slate-600">{product.productCode}</p>{product.summary && <p className="tw:mt-2 tw:line-clamp-2 tw:wrap-anywhere tw:text-xs tw:leading-5 tw:text-slate-600">{product.summary}</p>}</Link></li>)}</ul>
            {!state.data.items.length && <p className="tw:px-4 tw:py-8 tw:text-sm tw:leading-6 tw:text-slate-600">{term ? 'No products match your search.' : 'No products are currently available.'}</p>}
            <nav aria-label="Product pagination" className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:p-4 tw:text-xs tw:tabular-nums tw:text-slate-600"><button type="button" className={button} disabled={page <= 1 || state.refreshing || state.retryDisabled} onClick={() => filter(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))}</span><button type="button" className={button} disabled={page * state.data.pageSize >= state.data.total || state.refreshing || state.retryDisabled} onClick={() => filter(page + 1)}>Next</button></nav>
          </>}
        </div>
      </aside>
      <div className={`tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col ${!selected ? 'tw:max-[1000px]:hidden' : ''}`}>
        {selected ? <><Link href={resultsUrl} className="tw:hidden tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3 tw:text-sm tw:text-blue-700 tw:no-underline tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:block">Back to results</Link><ProductDetail key={selected} id={selected} csrfToken={csrfToken} blocked={blocked} /></> : <div className="tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:text-center"><svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="tw:mb-4 tw:text-slate-400"><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" /></svg><h2 className="tw:text-base tw:font-semibold">Select a product</h2><p className="tw:mt-2 tw:max-w-sm tw:text-sm tw:leading-6 tw:text-slate-600">Choose a product to read its description and product documents.</p></div>}
      </div>
    </div>
  </section>;
}
