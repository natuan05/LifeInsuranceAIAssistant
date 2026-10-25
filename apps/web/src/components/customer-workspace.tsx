'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, type Actor } from '@/lib/auth-api';
import { assignedCustomer, assignedCustomers, ownProfile, type Customer, type CustomerList, type OwnProfile } from '@/lib/customer-api';

function ProfileDetails({ customer }: { customer: Customer }) {
  return <dl className="auth-details">
    <div><dt>Họ và tên</dt><dd>{customer.fullName}</dd></div>
    <div><dt>Mã khách hàng</dt><dd>{customer.accountCode}</dd></div>
    <div><dt>Email</dt><dd>{customer.email}</dd></div>
    <div><dt>Điện thoại</dt><dd>{customer.phone || 'Chưa có thông tin'}</dd></div>
    <div><dt>Ngày sinh</dt><dd>{customer.birth || 'Chưa có thông tin'}</dd></div>
    <div><dt>Địa chỉ</dt><dd>{customer.address || 'Chưa có thông tin'}</dd></div>
    <div><dt>Trạng thái tài khoản</dt><dd>{customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}</dd></div>
  </dl>;
}

export function CustomerWorkspace({ actor }: { actor: Actor }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState<OwnProfile | null>(null);
  const [list, setList] = useState<CustomerList | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setOwn(null); setList(null); setDetail(null);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      try {
        if (actor.role === 'CUSTOMER') {
          const result = await ownProfile(signal);
          if (active) setOwn(result);
        } else {
          const [customers, profile] = await Promise.all([assignedCustomers(page, signal), selected
            ? assignedCustomer(selected, signal).catch(failure => {
              if (failure instanceof AuthError && failure.status === 404) return null;
              throw failure;
            }) : null]);
          if (active) {
            setList(customers); setDetail(profile?.customer ?? null);
            if (selected && !profile) setError('Khách hàng không tồn tại hoặc không còn được phân công cho bạn.');
          }
        }
      } catch (failure) {
        if (!active) return;
        if (failure instanceof AuthError && failure.status === 401) router.replace(actor.role === 'STAFF' ? '/staff/login' : '/login');
        else setError(failure instanceof AuthError && failure.status === 403 ? 'Bạn không có quyền xem nội dung này.' : 'Chưa tải được dữ liệu. Vui lòng thử lại.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [actor.id, actor.role, page, selected, revision, router]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return <section className="auth-card customer-workspace" aria-labelledby="workspace-title">
    <div className="workspace-heading"><h2 id="workspace-title">{actor.role === 'STAFF' ? 'Khách hàng được phân công' : 'Hồ sơ của bạn'}</h2>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>Tải lại</button></div>
    {loading && <p role="status">Đang tải dữ liệu…</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!loading && own && <><ProfileDetails customer={own.customer} /><section className="staff-contact" aria-labelledby="staff-title">
      <h3 id="staff-title">Nhân viên phụ trách</h3>
      {own.staff ? <dl className="auth-details"><div><dt>Họ và tên</dt><dd>{own.staff.fullName}</dd></div><div><dt>Email liên hệ</dt><dd>{own.staff.email}</dd></div>
        <div><dt>Điện thoại liên hệ</dt><dd>{own.staff.phone || 'Chưa có thông tin'}</dd></div><div><dt>Phòng ban</dt><dd>{own.staff.department || 'Chưa có thông tin'}</dd></div></dl>
        : <p>{own.assignmentStatus === 'UNASSIGNED' ? 'Chưa có nhân viên phụ trách.' : 'Nhân viên phụ trách hiện không khả dụng. Vui lòng liên hệ người quản trị để được hỗ trợ.'}</p>}
    </section></>}
    {!loading && list && <>
      <p>{list.total} khách hàng · Trang {list.page}</p>
      {!list.items.length ? <p>Không có khách hàng trong trang này.</p> : <ul className="customer-list">{list.items.map(customer => <li key={customer.id}>
        <div><strong>{customer.fullName}</strong><span>{customer.accountCode} · {customer.email}</span><span>{customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}</span></div>
        <button type="button" onClick={() => setSelected(customer.id)} aria-label={`Xem hồ sơ ${customer.fullName}`}>Xem hồ sơ</button>
      </li>)}</ul>}
      <nav className="customer-pagination" aria-label="Phân trang khách hàng">
        <button type="button" disabled={page <= 1} onClick={() => { setSelected(null); setPage(value => value - 1); }}>Trang trước</button>
        <button type="button" disabled={page * list.pageSize >= list.total} onClick={() => { setSelected(null); setPage(value => value + 1); }}>Trang sau</button>
      </nav>
      {selected && <section className="customer-detail" aria-labelledby="detail-title"><div className="workspace-heading"><h3 id="detail-title">Hồ sơ khách hàng</h3><button type="button" onClick={() => setSelected(null)}>Đóng hồ sơ</button></div>
        {detail && <ProfileDetails customer={detail} />}</section>}
    </>}
  </section>;
}
