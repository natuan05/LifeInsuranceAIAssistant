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
      setError(cause instanceof Error ? cause.message : 'Không thể kết nối backend.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell">
      <header className="brand"><span className="brand-mark" aria-hidden="true">L</span> Life Insurance <span className="environment">LOCAL</span></header>
      <section className="panel" aria-labelledby="page-title">
        <p className="eyebrow">BƯỚC 01 · NỀN TẢNG ỨNG DỤNG</p>
        <h1 id="page-title">Kết nối đầu tiên.</h1>
        <p className="intro">Frontend đã sẵn sàng. Kiểm tra kết nối đến backend để bắt đầu xây dựng ứng dụng chăm sóc khách hàng bảo hiểm nhân thọ.</p>
        <p><a href={process.env.NEXT_PUBLIC_DATABASE_UI_URL ?? 'http://127.0.0.1:5050'} target="_blank" rel="noreferrer">Xem các bảng dữ liệu ↗</a></p>

        <div className="services">
          <div className="service"><span className="dot ready" /><div><strong>Frontend</strong><span>Next.js · cổng 3000</span></div><span className="badge">Đang chạy</span></div>
          <div className="service"><span className={`dot ${health ? 'ready' : ''}`} /><div><strong>Backend</strong><span>NestJS · cổng 4000</span></div><span className="badge">{health ? 'Đã kết nối' : 'Chờ kiểm tra'}</span></div>
        </div>

        <button onClick={checkConnection} disabled={pending}>{pending ? 'Đang kiểm tra…' : 'Kiểm tra kết nối backend'}<span aria-hidden="true">→</span></button>

        <div className="result" role="status" aria-live="polite">
          {health ? (
            <><p className="success">Kết nối thành công · {coreApiUrl.startsWith('/') ? 'qua gateway' : 'CORS hoạt động'}</p><p>Trình duyệt đã nhận phản hồi từ NestJS.</p><pre>{JSON.stringify(health, null, 2)}</pre></>
          ) : error ? (
            <><p className="error">Chưa kết nối được backend</p><p>{error}</p><p>Kiểm tra Core đang chạy, URL API và CORS_ORIGINS trong cấu hình backend, rồi thử lại.</p></>
          ) : (
            <p>Nhấn nút để gửi request trực tiếp từ trình duyệt đến backend.</p>
          )}
        </div>
        <p className="endpoint">API <code>{coreApiUrl}/health/live</code></p>
      </section>
      <footer>Khởi tạo local · Next.js + NestJS</footer>
    </main>
  );
}
