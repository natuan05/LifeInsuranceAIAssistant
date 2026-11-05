import { HttpException } from '@nestjs/common';

const errors = {
  STALE_TICKET: { status: 409, message: 'The ticket has changed. Check its current state.' },
  INVALID_CURSOR: { status: 400, message: 'Invalid pagination cursor.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests.' },
  STALE_CONVERSATION: { status: 409, message: 'The conversation has changed. Check its current state.' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'The request key was already used for different input.' },
  STAFF_UNAVAILABLE: { status: 409, message: 'No Staff member is currently available for this request.' },
  ROUTING_CHANGED: { status: 409, message: 'The Staff assignment has changed. Confirm the new recipient.' },
  HANDOFF_ALREADY_PENDING: { status: 409, message: 'A Staff support request is already pending.' },
  ALREADY_ACCEPTED: { status: 409, message: 'This request has already been accepted.' },
} as const;

// Only explicit, server-controlled errors may add a public business code.
// Arbitrary HttpException bodies/ORM errors remain redacted by the filter.
export class SafeApiException extends HttpException {
  readonly retryAfter?: number;
  constructor(readonly publicCode: keyof typeof errors, retryAfter?: number) {
    super(errors[publicCode].message, errors[publicCode].status);
    if (publicCode === 'RATE_LIMITED' && Number.isInteger(retryAfter)) this.retryAfter = Math.max(1, Math.min(60, retryAfter!));
  }
}
