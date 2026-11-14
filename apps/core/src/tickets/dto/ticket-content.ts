import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const ticketConfirmation = { textVersion: 'ticket-v1', text: 'Tôi xác nhận yêu cầu hỗ trợ với nội dung trên.' };
// PostgreSQL text/jsonb reject NUL and unpaired UTF-16 surrogates.
// The Unicode flag keeps valid supplementary characters (including emoji).
export const ticketUnicodePattern = /^[^\uD800-\uDFFF]*$/u;
export function ticketContent(input: { title: string; description: string; policyId?: string | null }) {
  if (typeof input.title !== 'string' || typeof input.description !== 'string') throw new BadRequestException();
  const title = input.title.trim(), description = input.description.trim();
  if (!title || !description || title.includes('\0') || description.includes('\0') || !ticketUnicodePattern.test(title) || !ticketUnicodePattern.test(description) || Array.from(title).length > 255 || Array.from(description).length > 4000) throw new BadRequestException();
  return { title, description, policyId: input.policyId?.trim().toLowerCase() || null };
}
export const ticketHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
