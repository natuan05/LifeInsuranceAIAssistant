'use client';

import { useEffect, useState } from 'react';
import {
  customerGetDraft,
  customerUpdateDraft,
  customerConfirmTicket,
  type TicketDraft,
} from '@/lib/ticket-api';

interface CustomerTicketConfirmationProps {
  conversationId: string;
  draftId: string;
  csrfToken: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (ticket: { id: string; ticketCode: string; status: string }) => void;
}

export function CustomerTicketConfirmation({
  conversationId,
  draftId,
  csrfToken,
  isOpen,
  onClose,
  onSuccess,
}: CustomerTicketConfirmationProps) {
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Submitting confirm
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen || !draftId || !conversationId) return;

    let active = true;
    const controller = new AbortController();

    async function fetchDraft() {
      setLoading(true);
      setError(null);
      try {
        const res = await customerGetDraft(conversationId, draftId, controller.signal);
        if (!active) return;
        setDraft(res.draft);
        setEditTitle(res.draft.title);
        setEditDesc(res.draft.description);
        setConfirmationText(res.confirmation.text);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải bản nháp yêu cầu hỗ trợ.');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDraft();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, conversationId, draftId]);

  if (!isOpen) return null;

  const handleSaveEdit = async () => {
    if (!draft) return;
    if (!editTitle.trim()) {
      setError('Tiêu đề không được để trống.');
      return;
    }
    if (!editDesc.trim()) {
      setError('Nội dung mô tả không được để trống.');
      return;
    }

    setSavingEdit(true);
    setError(null);
    try {
      const controller = new AbortController();
      const res = await customerUpdateDraft(
        conversationId,
        draftId,
        {
          expectedVersion: draft.version,
          title: editTitle.trim(),
          description: editDesc.trim(),
          policyId: draft.policyId || undefined,
        },
        csrfToken,
        controller.signal,
      );
      setDraft(res.draft);
      setIsEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi cập nhật bản thảo.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft) return;
    setConfirming(true);
    setError(null);
    try {
      const controller = new AbortController();
      const res = await customerConfirmTicket(
        draft.id,
        draft.version,
        'ticket-v1',
        csrfToken,
        controller.signal,
      );
      onSuccess(res.ticket);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tạo yêu cầu hỗ trợ. Vui lòng thử lại.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:items-center tw:justify-center tw:bg-slate-900/50 tw:p-4 tw:backdrop-blur-xs"
    >
      <div className="tw:w-full tw:max-w-lg tw:rounded-2xl tw:bg-white tw:p-6 tw:shadow-xl tw:border tw:border-slate-100 tw:space-y-4 tw:animate-in tw:fade-in-50">
        
        {/* Header */}
        <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-100 tw:pb-3">
          <div className="tw:flex tw:items-center tw:gap-2">
            <span className="tw:h-2 tw:w-2 tw:rounded-full tw:bg-emerald-500" />
            <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">
              {isEditing ? 'Chỉnh sửa Yêu cầu Hỗ trợ (Draft)' : 'Xác nhận Yêu cầu Hỗ trợ do AI đề xuất'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tw:text-slate-400 tw:hover:text-slate-600 tw:p-1 tw:rounded-lg tw:cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="tw:py-8 tw:text-center tw:text-xs tw:text-slate-500">
            <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
            <p>Đang tải bản nháp yêu cầu...</p>
          </div>
        ) : error ? (
          <div className="tw:p-3 tw:rounded-xl tw:bg-red-50 tw:border tw:border-red-200 tw:text-xs tw:text-red-700">
            {error}
          </div>
        ) : draft ? (
          <div className="tw:space-y-3 tw:text-xs">
            {isEditing ? (
              <div className="tw:space-y-3">
                <div>
                  <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                    Tiêu đề yêu cầu
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={255}
                    className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:focus:outline-hidden tw:focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                    Nội dung chi tiết
                  </label>
                  <textarea
                    rows={4}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    maxLength={4000}
                    className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:focus:outline-hidden tw:focus:border-emerald-500"
                  />
                </div>
              </div>
            ) : (
              <div className="tw:space-y-2.5">
                <div className="tw:bg-slate-50 tw:p-3.5 tw:rounded-xl tw:border tw:border-slate-200/70 tw:space-y-2">
                  <div>
                    <span className="tw:text-slate-400 tw:font-medium tw:block">Tiêu đề:</span>
                    <span className="tw:font-bold tw:text-slate-900 tw:text-sm">{draft.title}</span>
                  </div>
                  <div>
                    <span className="tw:text-slate-400 tw:font-medium tw:block">Nội dung tóm tắt:</span>
                    <p className="tw:text-slate-700 tw:whitespace-pre-line tw:mt-0.5">{draft.description}</p>
                  </div>
                  {draft.policyNumber && (
                    <div>
                      <span className="tw:text-slate-400 tw:font-medium tw:block">Hợp đồng liên quan:</span>
                      <span className="tw:font-mono tw:font-semibold tw:text-emerald-700">{draft.policyNumber}</span>
                    </div>
                  )}
                </div>

                <div className="tw:bg-emerald-50/60 tw:border tw:border-emerald-200/60 tw:p-3 tw:rounded-xl tw:flex tw:items-start tw:gap-2">
                  <span className="tw:text-emerald-600 tw:mt-0.5">ℹ️</span>
                  <p className="tw:text-[11px] tw:text-emerald-800">
                    {confirmationText || 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-slate-100">
          {!isEditing && draft && (
            <button
              type="button"
              disabled={confirming}
              onClick={() => setIsEditing(true)}
              className="tw:text-xs tw:font-semibold tw:text-slate-600 tw:hover:text-slate-900 tw:cursor-pointer tw:underline"
            >
              Chỉnh sửa nội dung
            </button>
          )}

          <div className="tw:flex tw:items-center tw:gap-2 tw:ml-auto">
            {isEditing ? (
              <>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() => {
                    setIsEditing(false);
                    if (draft) {
                      setEditTitle(draft.title);
                      setEditDesc(draft.description);
                    }
                  }}
                  className="tw:px-3 tw:py-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:text-slate-600 tw:text-xs tw:font-semibold tw:hover:bg-slate-50 tw:cursor-pointer"
                >
                  Hủy sửa
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveEdit}
                  className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:hover:bg-emerald-700 tw:cursor-pointer tw:shadow-xs"
                >
                  {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={confirming}
                  onClick={onClose}
                  className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:text-slate-600 tw:text-xs tw:font-semibold tw:hover:bg-slate-50 tw:cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={confirming || loading || !draft}
                  onClick={handleConfirm}
                  className="tw:px-4 tw:py-1.5 tw:rounded-xl tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:hover:bg-emerald-700 tw:cursor-pointer tw:shadow-xs tw:flex tw:items-center tw:gap-1.5"
                >
                  {confirming ? 'Đang gửi...' : 'Xác nhận tạo yêu cầu'}
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
