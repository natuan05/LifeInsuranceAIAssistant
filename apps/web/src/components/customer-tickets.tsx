'use client';

import { useEffect, useState } from 'react';
import {
  customerListTickets,
  customerReadTicket,
  customerCreateManualTicket,
  type CustomerTicketSummary,
  type CustomerTicketDetail,
  type TicketStatus,
} from '@/lib/ticket-api';
import { ticketEvent } from '@/lib/realtime';

export type TicketItem = {
  id: string;
  code: string;
  title: string;
  policyCode: string;
  status: TicketStatus;
  statusLabel: string;
  createdAt: string;
};

const statusStyles: Record<TicketStatus, { style: string; label: string }> = {
  OPEN: {
    style: 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200/60',
    label: 'Open',
  },
  ASSIGNED: {
    style: 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-200/60',
    label: 'Assigned',
  },
  IN_PROGRESS: {
    style: 'tw:bg-emerald-50 tw:text-emerald-700 tw:border-emerald-200/60',
    label: 'In Progress',
  },
  RESOLVED: {
    style: 'tw:bg-purple-50 tw:text-purple-700 tw:border-purple-200/60',
    label: 'Resolved',
  },
  CLOSED: {
    style: 'tw:bg-slate-100 tw:text-slate-600 tw:border-slate-200/60',
    label: 'Closed',
  },
};

export function CustomerTickets({
  onOpenChat,
  csrfToken = '',
  blocked = false,
  policies = [],
}: {
  onOpenChat: () => void;
  csrfToken?: string;
  blocked?: boolean;
  policies?: { id: string; policyNumber: string; productName?: string }[];
}) {
  const [tickets, setTickets] = useState<CustomerTicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [revision, setRevision] = useState(0);

  // Detail Modal
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<CustomerTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Realtime WebSocket listener
  useEffect(() => {
    function handleRealtime() {
      setRevision((r) => r + 1);
    }
    window.addEventListener(ticketEvent, handleRealtime);
    return () => window.removeEventListener(ticketEvent, handleRealtime);
  }, []);

  // Fetch ticket list
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function fetchTickets() {
      setLoading(true);
      setError(null);
      try {
        const res = await customerListTickets(
          {
            status: filter === 'ALL' ? undefined : filter,
            search: searchTerm.trim() || undefined,
            page,
            pageSize: 10,
          },
          controller.signal,
        );
        if (!active) return;
        setTickets(res.items);
        setTotal(res.total);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách yêu cầu hỗ trợ.');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchTickets();

    return () => {
      active = false;
      controller.abort();
    };
  }, [filter, searchTerm, page, revision]);

  // Fetch ticket detail
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketDetail(null);
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function fetchDetail() {
      setDetailLoading(true);
      try {
        const res = await customerReadTicket(selectedTicketId!, controller.signal);
        if (!active) return;
        setTicketDetail(res.ticket);
      } catch (err: unknown) {
        if (!active) return;
        setTicketDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    fetchDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedTicketId]);

  const handleCreateTicket = async () => {
    if (!newSubject.trim()) {
      setSubmitError('Vui lòng nhập tiêu đề yêu cầu.');
      return;
    }
    if (!newDesc.trim()) {
      setSubmitError('Vui lòng nhập nội dung chi tiết.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const controller = new AbortController();
      const res = await customerCreateManualTicket(
        {
          title: newSubject.trim(),
          description: newDesc.trim(),
          policyId: selectedPolicyId || undefined,
        },
        csrfToken,
        controller.signal,
      );

      setNewSubject('');
      setNewDesc('');
      setSelectedPolicyId('');
      setCreateModalOpen(false);
      setRevision((r) => r + 1);
      alert(`Đã tạo yêu cầu hỗ trợ #${res.ticket.ticketCode} thành công. Chuyên viên sẽ tiếp nhận và phản hồi sớm.`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Lỗi khi gửi yêu cầu hỗ trợ. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Top Header Card & Filter Bar */}
      <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4 tw:mb-4">
          <div>
            <h2 className="tw:text-lg tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
              Support Tickets &amp; Service Requests
            </h2>
            <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
              Theo dõi yêu cầu bồi thường (e-Claim), thủ tục bảo hiểm và dịch vụ hợp đồng
            </p>
          </div>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setSubmitError(null);
              setCreateModalOpen(true);
            }}
            className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-emerald-600 tw:hover:bg-emerald-700 tw:disabled:opacity-40 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:gap-1.5 tw:shadow-xs tw:cursor-pointer tw:self-start tw:sm:self-auto"
          >
            <span className="tw:text-sm">＋</span>
            Tạo yêu cầu mới
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:items-start tw:sm:items-center tw:justify-between tw:gap-3 tw:pt-3 tw:border-t tw:border-slate-100">
          <div className="tw:flex tw:gap-1.5 tw:overflow-x-auto tw:w-full tw:sm:w-auto tw:pb-1 tw:sm:pb-0">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'OPEN', label: 'Mới tạo (Open)' },
              { id: 'IN_PROGRESS', label: 'Đang xử lý' },
              { id: 'RESOLVED', label: 'Đã xử lý' },
              { id: 'CLOSED', label: 'Đã đóng' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setPage(1);
                }}
                className={`tw:px-3 tw:py-1.5 tw:rounded-xl tw:text-xs tw:font-semibold tw:cursor-pointer tw:transition-colors tw:whitespace-nowrap ${
                  filter === tab.id
                    ? 'tw:bg-slate-900 tw:text-white'
                    : 'tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tw:relative tw:w-full tw:sm:w-64">
            <input
              type="text"
              placeholder="Tìm theo mã vé hoặc tiêu đề..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:px-3 tw:py-1.5 tw:text-xs tw:text-slate-800 tw:focus:outline-hidden tw:focus:border-emerald-500 tw:focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="tw:absolute tw:right-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:hover:text-slate-600 tw:text-xs tw:cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ticket List View */}
      {loading ? (
        <div className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
          <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
          <p>Đang tải danh sách yêu cầu...</p>
        </div>
      ) : error ? (
        <div className="tw:p-4 tw:rounded-2xl tw:bg-red-50 tw:border tw:border-red-200 tw:text-xs tw:text-red-700">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-12 tw:text-center tw:space-y-3">
          <div className="tw:w-12 tw:h-12 tw:rounded-full tw:bg-slate-100 tw:text-slate-400 tw:flex tw:items-center tw:justify-center tw:mx-auto tw:text-xl">
            📋
          </div>
          <div className="tw:text-sm tw:font-bold tw:text-slate-700">Không có yêu cầu hỗ trợ nào</div>
          <p className="tw:text-xs tw:text-slate-400 tw:max-w-sm tw:mx-auto">
            {searchTerm || filter !== 'ALL'
              ? 'Không tìm thấy yêu cầu khớp với bộ lọc hiện tại.'
              : 'Bạn chưa tạo yêu cầu hỗ trợ nào. Bấm "Tạo yêu cầu mới" hoặc trao đổi với AI Agent trong hội thoại chat.'}
          </p>
        </div>
      ) : (
        <div className="tw:grid tw:grid-cols-1 tw:gap-3">
          {tickets.map((t) => {
            const statusInfo = statusStyles[t.status] || {
              style: 'tw:bg-slate-100 tw:text-slate-700 tw:border-slate-200',
              label: t.status,
            };
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-4 tw:shadow-xs tw:hover:border-slate-300 tw:hover:shadow-sm tw:transition-all tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-4"
              >
                <div className="tw:space-y-1 tw:min-w-0">
                  <div className="tw:flex tw:items-center tw:gap-2">
                    <span className="tw:font-mono tw:font-bold tw:text-xs tw:text-emerald-700">
                      {t.ticketCode}
                    </span>
                    <span
                      className={`tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[10px] tw:font-bold tw:border ${statusInfo.style}`}
                    >
                      {statusInfo.label}
                    </span>
                    {t.policyNumber && (
                      <span className="tw:text-[11px] tw:text-slate-400">
                        • Hợp đồng: <strong className="tw:text-slate-600">{t.policyNumber}</strong>
                      </span>
                    )}
                  </div>
                  <h4 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:truncate">
                    {t.title}
                  </h4>
                  <p className="tw:text-[11px] tw:text-slate-400">
                    Khởi tạo: {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>

                <div className="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                  <span className="tw:text-xs tw:font-semibold tw:text-emerald-600 tw:hidden tw:sm:inline">
                    Xem chi tiết →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedTicketId && (
        <div
          role="dialog"
          aria-modal="true"
          className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4"
        >
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-lg tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200 tw:space-y-4 tw:p-6 tw:animate-in tw:fade-in-50">
            <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-100 tw:pb-3">
              <div>
                <span className="tw:font-mono tw:font-bold tw:text-xs tw:text-emerald-700">
                  {ticketDetail?.ticketCode || 'Chi tiết yêu cầu'}
                </span>
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:mt-0.5">
                  {ticketDetail?.title || 'Đang tải...'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:p-1 tw:rounded-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="tw:py-8 tw:text-center tw:text-xs tw:text-slate-500">
                <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
                <p>Đang tải thông tin chi tiết...</p>
              </div>
            ) : ticketDetail ? (
              <div className="tw:space-y-3 tw:text-xs">
                <div className="tw:bg-slate-50 tw:p-3.5 tw:rounded-xl tw:border tw:border-slate-200/70 tw:space-y-2">
                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-400 tw:font-medium">Trạng thái:</span>
                    <span
                      className={`tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-bold tw:border ${
                        statusStyles[ticketDetail.status]?.style || ''
                      }`}
                    >
                      {statusStyles[ticketDetail.status]?.label || ticketDetail.status}
                    </span>
                  </div>

                  {ticketDetail.policyNumber && (
                    <div className="tw:flex tw:items-center tw:justify-between">
                      <span className="tw:text-slate-400 tw:font-medium">Hợp đồng liên quan:</span>
                      <span className="tw:font-mono tw:font-semibold tw:text-slate-800">
                        {ticketDetail.policyNumber}
                      </span>
                    </div>
                  )}

                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-400 tw:font-medium">Ngày tạo:</span>
                    <span className="tw:text-slate-700">
                      {new Date(ticketDetail.createdAt).toLocaleString('vi-VN')}
                    </span>
                  </div>

                  {ticketDetail.assignedStaff && (
                    <div className="tw:flex tw:items-center tw:justify-between">
                      <span className="tw:text-slate-400 tw:font-medium">Chuyên viên phụ trách:</span>
                      <span className="tw:font-semibold tw:text-slate-800">
                        {ticketDetail.assignedStaff.fullName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirmed / Manual Content */}
                {ticketDetail.confirmedContent && (
                  <div className="tw:bg-white tw:border tw:border-slate-200 tw:rounded-xl tw:p-3.5 tw:space-y-1.5">
                    <span className="tw:text-slate-400 tw:font-medium tw:block">Nội dung đã xác nhận:</span>
                    <p className="tw:text-slate-700 tw:whitespace-pre-line tw:leading-relaxed">
                      {(ticketDetail.confirmedContent.description as string) || (ticketDetail.confirmedContent.title as string) || 'Không có mô tả'}
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedTicketId(null);
                  onOpenChat();
                }}
                className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:bg-blue-50 tw:hover:bg-blue-100 tw:text-blue-700 tw:text-xs tw:font-semibold tw:cursor-pointer tw:flex tw:items-center tw:gap-1.5"
              >
                <span>💬 Nhắn tin với chuyên viên</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="tw:px-4 tw:py-1.5 tw:rounded-xl tw:bg-slate-200 tw:hover:bg-slate-300 tw:text-slate-700 tw:text-xs tw:font-semibold tw:cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4"
        >
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-md tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200 tw:space-y-4 tw:p-6 tw:animate-in tw:fade-in-50">
            <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-100 tw:pb-3">
              <div>
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">Tạo Yêu cầu Hỗ trợ Mới</h3>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">Yêu cầu sẽ khởi tạo ở trạng thái Open</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:p-1 tw:rounded-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div className="tw:p-3 tw:rounded-xl tw:bg-red-50 tw:border tw:border-red-200 tw:text-xs tw:text-red-700">
                {submitError}
              </div>
            )}

            <div className="tw:space-y-3 tw:text-xs">
              <div>
                <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Hợp đồng liên quan (tùy chọn)
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-800"
                >
                  <option value="">-- Không chọn hợp đồng cụ thể --</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.policyNumber} {p.productName ? `- ${p.productName}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Tiêu đề yêu cầu <span className="tw:text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Yêu cầu bồi thường viện phí, thay đổi thông tin..."
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  maxLength={255}
                  className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:outline-hidden tw:focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Mô tả chi tiết <span className="tw:text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Mô tả cụ thể thời gian, lý do, chi tiết yêu cầu để chuyên viên xử lý nhanh nhất..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  maxLength={4000}
                  className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:outline-hidden tw:focus:border-emerald-500 tw:resize-none"
                />
              </div>

              <div className="tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:p-3 tw:rounded-xl tw:text-[11px] tw:text-blue-800">
                ℹ️ Yêu cầu của bạn sẽ được chuyển đến chuyên viên phụ trách để xem xét và tiếp nhận.
              </div>
            </div>

            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCreateModalOpen(false)}
                className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:text-slate-600 tw:text-xs tw:font-semibold tw:hover:bg-slate-50 tw:cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreateTicket}
                className="tw:px-4 tw:py-1.5 tw:rounded-xl tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:hover:bg-emerald-700 tw:cursor-pointer tw:shadow-xs"
              >
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
