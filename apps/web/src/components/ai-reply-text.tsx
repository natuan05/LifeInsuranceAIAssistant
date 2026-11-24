export function AiReplyText({ text }: { text: string }) {
  return text.split(/\*\*([^*\r\n]+)\*\*/).map((part, index) =>
    index % 2 ? <strong key={index} className="tw:font-bold">{part}</strong> : part);
}
