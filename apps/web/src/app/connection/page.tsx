'use client';

import { useState } from 'react';
import { checkCoreConnection, coreApiUrl, type CoreHealth } from '@/lib/core-api';

export default function Home() {
  const [pending, setPending] = useState(false);
  const [health, setHealth] = useState<CoreHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkConnection() {
    setPending(true);
    setHealth(null);
    setError(null);

    try {
      setHealth(await checkCoreConnection());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to the backend.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell">
      <header className="brand"><span className="brand-mark" aria-hidden="true">L</span> Life Insurance <span className="environment">LOCAL</span></header>
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">STEP 01 · APPLICATION FOUNDATION</p>
        <h1 id="page-title">Check your connection.</h1>
        <p className="intro">The frontend is ready. Check the backend connection to get started.</p>
        <p><a href={process.env.NEXT_PUBLIC_DATABASE_UI_URL ?? 'http://127.0.0.1:5050'} target="_blank" rel="noreferrer">View database tables ↗</a></p>

        <div className="services">
          <div className="service"><span className="dot ready" /><div><strong>Frontend</strong><span>Next.js · port 3000</span></div><span className="badge">Running</span></div>
          <div className="service"><span className={`dot ${health ? 'ready' : ''}`} /><div><strong>Backend</strong><span>NestJS · port 4000</span></div><span className="badge">{health ? 'Connected' : 'Not checked'}</span></div>
        </div>

        <button onClick={checkConnection} disabled={pending}>{pending ? 'Checking…' : 'Check backend connection'}<span aria-hidden="true">→</span></button>

        <div className="result" role="status" aria-live="polite">
          {health ? (
            <><p className="success">Connected successfully · {coreApiUrl.startsWith('/') ? 'via gateway' : 'CORS is working'}</p><p>The browser received a response from NestJS.</p><pre>{JSON.stringify(health, null, 2)}</pre></>
          ) : error ? (
            <><p className="error">Unable to connect to the backend</p><p>{error}</p><p>Check that Core is running, verify the API URL and CORS_ORIGINS, and try again.</p></>
          ) : (
            <p>Use the button to send a request from your browser to the backend.</p>
          )}
        </div>
        <p className="endpoint">API <code>{coreApiUrl}/health/live</code></p>
      </section>
      <footer>Local environment · Next.js + NestJS</footer>
    </main>
  );
}
