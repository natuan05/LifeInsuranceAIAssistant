'use client';

import { useEffect, useState } from 'react';
import {
  listProducts,
  readProductDocuments,
  productDocumentAccess,
  type Product,
  type ProductDocument,
} from '@/lib/product-api';
import { SignedPdfPreview } from './signed-pdf-preview';

export function CustomerProducts({
  csrfToken = '',
  blocked = false,
}: {
  csrfToken?: string;
  blocked?: boolean;
  onOpenChat?: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Detail view state for documents
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<ProductDocument | null>(null);

  function selectProduct(product: Product | null) {
    setDocuments([]);
    setSelectedDoc(null);
    setDocsError('');
    setDocsLoading(!!product);
    setSelectedProduct(product);
  }

  // Fetch product list
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function fetchProducts() {
      setLoading(true);
      setError('');
      try {
        const res = await listProducts(search, 1, controller.signal);
        if (active) {
          setProducts(res.items);
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setError('Unable to load insurance solutions. Please try again.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    const timer = setTimeout(fetchProducts, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // When a product is selected, fetch its documents
  useEffect(() => {
    if (!selectedProduct) return;

    const currentProductId = selectedProduct.id;
    let active = true;
    const controller = new AbortController();

    async function loadDocuments() {
      setDocsLoading(true);
      setDocsError('');
      try {
        const res = await readProductDocuments(currentProductId, null, controller.signal);
        if (active) {
          setDocuments(res.items);
          if (res.items.length > 0) {
            setSelectedDoc(res.items[0]);
          } else {
            setSelectedDoc(null);
          }
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setDocsError('Unable to load documents for this insurance solution.');
        }
      } finally {
        if (active) {
          setDocsLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedProduct]);

  // DETAIL VIEW: When a customer clicks into a specific product
  if (selectedProduct) {
    return (
      <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
        {/* Navigation Action */}
        <div className="tw:flex tw:items-center tw:justify-between">
          <button
            type="button"
            onClick={() => selectProduct(null)}
            className="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3.5 tw:py-2 tw:text-xs tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:transition-colors tw:cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Back to Solutions</span>
          </button>
        </div>

        {/* Product Hero Detail Card */}
        <div className="tw:rounded-3xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:sm:p-8 tw:shadow-2xs tw:space-y-4">
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2.5">
            <span className="tw:font-mono tw:text-xs tw:font-bold tw:text-emerald-800 tw:bg-emerald-50 tw:border tw:border-emerald-200/60 tw:px-3 tw:py-1 tw:rounded-lg">
              {selectedProduct.productCode}
            </span>
            <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-bold tw:text-emerald-700 tw:bg-emerald-50 tw:px-3 tw:py-1 tw:rounded-lg tw:border tw:border-emerald-200/60">
              <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-emerald-500" />
              Available Protection
            </span>
            <span className="tw:text-xs tw:font-semibold tw:text-slate-400">
              Certified AegisLife Product
            </span>
          </div>

          <h2 className="tw:text-2xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight tw:leading-snug">
            {selectedProduct.name}
          </h2>

          <p className="tw:text-sm tw:text-slate-600 tw:leading-relaxed tw:max-w-3xl">
            {selectedProduct.summary ||
              'Comprehensive life insurance and critical illness protection designed for family peace of mind and long-term financial security.'}
          </p>

          {/* Key Specifications Grid */}
          <div className="tw:grid tw:grid-cols-2 tw:sm:grid-cols-4 tw:gap-4 tw:pt-4 tw:border-t tw:border-slate-100">
            <div className="tw:rounded-xl tw:bg-slate-50/70 tw:p-3.5 tw:border tw:border-slate-100">
              <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                Plan Category
              </span>
              <span className="tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-1 tw:block">
                Life & Health Protection
              </span>
            </div>
            <div className="tw:rounded-xl tw:bg-slate-50/70 tw:p-3.5 tw:border tw:border-slate-100">
              <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                Product Code
              </span>
              <span className="tw:text-xs tw:font-mono tw:font-bold tw:text-slate-900 tw:mt-1 tw:block">
                {selectedProduct.productCode}
              </span>
            </div>
            <div className="tw:rounded-xl tw:bg-slate-50/70 tw:p-3.5 tw:border tw:border-slate-100">
              <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                Contract Format
              </span>
              <span className="tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-1 tw:block">
                Paperless Electronic Policy
              </span>
            </div>
            <div className="tw:rounded-xl tw:bg-slate-50/70 tw:p-3.5 tw:border tw:border-slate-100">
              <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                Currency
              </span>
              <span className="tw:text-xs tw:font-bold tw:text-slate-900 tw:mt-1 tw:block">
                VND (Vietnamese Dong)
              </span>
            </div>
          </div>
        </div>

        {/* Documentation / Certified Terms Section */}
        <div className="tw:rounded-3xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:sm:p-8 tw:shadow-2xs tw:space-y-4">
          <div>
            <h3 className="tw:text-base tw:font-extrabold tw:text-slate-900">
              Official Policy Guidelines & Terms
            </h3>
            <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
              Read certified product conditions, benefit rules, and sample policy schedules published by AegisLife.
            </p>
          </div>

          {docsLoading && (
            <div className="tw:py-10 tw:text-center tw:text-xs tw:text-slate-500">
              <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
              <p>Loading certified documents…</p>
            </div>
          )}

          {docsError && !docsLoading && (
            <div className="tw:rounded-2xl tw:border tw:border-red-200 tw:bg-red-50/80 tw:p-4 tw:text-xs tw:text-red-700">
              <p className="tw:font-medium">{docsError}</p>
            </div>
          )}

          {!docsLoading && !docsError && documents.length === 0 && (
            <div className="tw:rounded-2xl tw:bg-slate-50/60 tw:border tw:border-slate-100 tw:p-8 tw:text-center">
              <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-slate-100 tw:text-slate-400 tw:flex tw:items-center tw:justify-center tw:mx-auto tw:mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="tw:text-xs tw:font-bold tw:text-slate-800">
                Official documents will be issued with your active policy contract.
              </p>
              <p className="tw:text-[11px] tw:text-slate-500 tw:mt-1">
                You can inspect active policy contracts and endorsements anytime under My Policies.
              </p>
            </div>
          )}

          {!docsLoading && !docsError && documents.length > 0 && (
            <div className="tw:space-y-4">
              {documents.length > 1 && (
                <div className="tw:flex tw:items-center tw:gap-2">
                  <label htmlFor="product-doc-select" className="tw:text-xs tw:font-bold tw:text-slate-700 tw:shrink-0">
                    Select Document:
                  </label>
                  <select
                    id="product-doc-select"
                    value={selectedDoc?.documentId ?? ''}
                    onChange={e => {
                      const doc = documents.find(d => d.documentId === e.target.value);
                      if (doc) setSelectedDoc(doc);
                    }}
                    className="tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:shadow-2xs tw:focus:outline-hidden tw:focus:border-emerald-500"
                  >
                    {documents.map(d => (
                      <option key={d.documentId} value={d.documentId}>
                        {d.title} (v{d.versionNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedDoc && (
                <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:overflow-hidden tw:shadow-2xs">
                  <SignedPdfPreview
                    key={`${selectedProduct.id}:${selectedDoc.documentId}:${selectedDoc.versionId}`}
                    resourceKey={`${selectedProduct.id}:${selectedDoc.documentId}:${selectedDoc.versionId}`}
                    document={selectedDoc}
                    title={selectedDoc.title}
                    description="Official Product Document"
                    filename={`${selectedProduct.productCode}-${selectedDoc.documentId}-v${selectedDoc.versionNumber}.pdf`}
                    compact
                    manualReload={false}
                    blocked={blocked}
                    unavailable="This document is currently unavailable."
                    access={(intent, signal) =>
                      productDocumentAccess(selectedProduct.id, selectedDoc, intent, csrfToken, signal)
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // LIST VIEW: Display list of products
  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Header bar */}
      <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4">
        <div>
          <h2 className="tw:text-xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            Explore Insurance Solutions
          </h2>
          <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
            Discover life protection, critical illness coverage, and wealth accumulation plans from AegisLife.
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="tw:relative tw:max-w-md">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="tw:absolute tw:left-3.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search solutions by name or code…"
          className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:py-2.5 tw:pl-10 tw:pr-4 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:shadow-2xs tw:focus:outline-hidden tw:focus:border-emerald-500 tw:focus:ring-2 tw:focus:ring-emerald-100"
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4 tw:animate-pulse">
          <div className="tw:h-48 tw:rounded-2xl tw:bg-slate-100 tw:border tw:border-slate-200/80" />
          <div className="tw:h-48 tw:rounded-2xl tw:bg-slate-100 tw:border tw:border-slate-200/80" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="tw:rounded-2xl tw:border tw:border-red-200 tw:bg-red-50/60 tw:p-4 tw:text-xs tw:text-red-700">
          <p className="tw:font-medium">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && products.length === 0 && (
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-8 tw:text-center tw:shadow-2xs">
          <h3 className="tw:text-sm tw:font-bold tw:text-slate-800 tw:mb-1">
            No solutions matched your search
          </h3>
          <p className="tw:text-xs tw:text-slate-500">
            Please try another keyword or search by solution code.
          </p>
        </div>
      )}

      {/* Products Grid */}
      {!loading && !error && products.length > 0 && (
        <div className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-6">
          {products.map(product => (
            <div
              key={product.id}
              onClick={() => selectProduct(product)}
              className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs tw:flex tw:flex-col tw:justify-between tw:gap-4 tw:transition-all tw:hover:shadow-xs tw:hover:border-emerald-300 tw:cursor-pointer tw:group"
            >
              <div className="tw:space-y-3">
                <div className="tw:flex tw:items-center tw:justify-between">
                  <span className="tw:font-mono tw:text-xs tw:font-bold tw:text-emerald-800 tw:bg-emerald-50 tw:border tw:border-emerald-200/60 tw:px-2.5 tw:py-0.5 tw:rounded-lg">
                    {product.productCode}
                  </span>
                  <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[10px] tw:font-bold tw:text-emerald-700 tw:bg-emerald-50/60 tw:px-2 tw:py-0.5 tw:rounded-full">
                    <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-emerald-500" />
                    Available Protection
                  </span>
                </div>

                <h3 className="tw:text-base tw:font-extrabold tw:text-slate-900 tw:group-hover:text-emerald-700 tw:transition-colors">
                  {product.name}
                </h3>

                <p className="tw:text-xs tw:text-slate-600 tw:leading-relaxed tw:line-clamp-3">
                  {product.summary || 'Guaranteed life protection combined with comprehensive health support and stable financial growth for your loved ones.'}
                </p>
              </div>

              <div className="tw:pt-3 tw:border-t tw:border-slate-100 tw:flex tw:items-center tw:justify-between">
                <span className="tw:text-[11px] tw:text-slate-400">
                  Certified AegisLife Plan
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    selectProduct(product);
                  }}
                  className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-xl tw:bg-slate-900 tw:px-3.5 tw:py-2 tw:text-xs tw:font-bold tw:text-white tw:hover:bg-slate-800 tw:shadow-2xs tw:transition-all tw:cursor-pointer"
                >
                  <span>View Details</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
