export function AiReplyIndicator({ label }: { label: string }) {
  return <div role="status" className="tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-3">
    <span className="tw:sr-only">{label}</span>
    <span aria-hidden="true" className="tw:flex tw:gap-1.5">
      <span className="tw:size-1.5 tw:rounded-full tw:bg-slate-500 tw:motion-safe:animate-bounce" />
      <span className="tw:size-1.5 tw:rounded-full tw:bg-slate-500 tw:motion-safe:animate-bounce tw:[animation-delay:120ms]" />
      <span className="tw:size-1.5 tw:rounded-full tw:bg-slate-500 tw:motion-safe:animate-bounce tw:[animation-delay:240ms]" />
    </span>
  </div>;
}
