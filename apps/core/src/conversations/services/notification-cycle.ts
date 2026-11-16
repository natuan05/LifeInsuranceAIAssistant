import { Prisma } from '../../generated/prisma/client';

// Legacy events have no message ID. Fold the unprocessed span into its first
// unread message (cycle identity) and final sequence (retry watermark).
// Callers hold the same routing/conversation locks as notifyMessage.
export async function reconcileMessages(tx: Prisma.TransactionClient, conversationId: string, recipientUserId: string,
  role: 'CUSTOMER' | 'STAFF') {
  const kind = role === 'CUSTOMER' ? 'STAFF_MESSAGE_UNREAD' : 'CUSTOMER_MESSAGE_UNREAD';
  const where = { recipientUserId_conversationId_kind: { recipientUserId, conversationId, kind } };
  const state = await tx.conversationNotificationState.findUnique({ where });
  const through = state ? (state.readThroughSequence > state.lastProcessedSequence ? state.readThroughSequence : state.lastProcessedSequence) : 0n;
  const messages = { conversationId, audience: 'CUSTOMER_VISIBLE' as const,
    senderType: role === 'CUSTOMER' ? 'STAFF' as const : 'CUSTOMER' as const, sequence: { gt: through } };
  const firstUnread = await tx.message.findFirst({ where: { ...messages, readAt: null }, orderBy: { sequence: 'asc' },
    select: { sequence: true, readAt: true } });
  const latest = await tx.message.findFirst({ where: messages, orderBy: { sequence: 'desc' }, select: { sequence: true } });
  const notification = firstUnread ? await notifyMessage(tx, conversationId, recipientUserId, role, firstUnread) : false;
  if (latest && (!firstUnread || latest.sequence > firstUnread.sequence)) {
    await tx.conversationNotificationState.upsert({ where,
      create: { recipientUserId, conversationId, kind, lastProcessedSequence: latest.sequence },
      update: { lastProcessedSequence: latest.sequence } });
  }
  return notification;
}

// Callers hold routing/conversation locks and have checked the current grant.
export async function notifyMessage(tx: Prisma.TransactionClient, conversationId: string, recipientUserId: string,
  role: 'CUSTOMER' | 'STAFF', message: { sequence: bigint; readAt: Date | null }) {
  const kind = role === 'CUSTOMER' ? 'STAFF_MESSAGE_UNREAD' : 'CUSTOMER_MESSAGE_UNREAD';
  const where = { recipientUserId_conversationId_kind: { recipientUserId, conversationId, kind } };
  const state = await tx.conversationNotificationState.upsert({ where, create: { recipientUserId, conversationId, kind }, update: {} });
  if (message.sequence <= state.readThroughSequence || message.sequence <= state.lastProcessedSequence) return false;
  if (message.readAt) {
    await tx.conversationNotificationState.update({ where, data: { lastProcessedSequence: message.sequence } });
    return false;
  }
  const existing = state.activeNotificationId ? await tx.notification.findUnique({ where: { id: state.activeNotificationId } }) : null;
  const notification = existing ? await tx.notification.update({ where: { id: existing.id }, data: { isRead: false } })
    : await tx.notification.create({ data: { conversationId, kind,
      ...(role === 'CUSTOMER' ? { recipientCustomerId: recipientUserId } : { recipientStaffId: recipientUserId }),
      title: role === 'CUSTOMER' ? 'Bạn có tin nhắn mới từ nhân viên hỗ trợ' : 'Bạn có tin nhắn mới từ khách hàng',
      dedupKey: `cycle:${recipientUserId}:${conversationId}:${kind}:${message.sequence}` } });
  await tx.conversationNotificationState.update({ where, data: { activeNotificationId: notification.id,
    cycleStartSequence: state.cycleStartSequence ?? message.sequence, lastProcessedSequence: message.sequence } });
  return true;
}

export async function readCycle(tx: Prisma.TransactionClient, conversationId: string, recipientUserId: string,
  role: 'CUSTOMER' | 'STAFF', through: bigint) {
  const kind = role === 'CUSTOMER' ? 'STAFF_MESSAGE_UNREAD' : 'CUSTOMER_MESSAGE_UNREAD';
  const where = { recipientUserId_conversationId_kind: { recipientUserId, conversationId, kind } };
  const state = await tx.conversationNotificationState.upsert({ where,
    create: { recipientUserId, conversationId, kind, readThroughSequence: through }, update: {} });
  await tx.conversationNotificationState.update({ where, data: { readThroughSequence: through > state.readThroughSequence ? through : state.readThroughSequence,
    activeNotificationId: null, cycleStartSequence: null } });
}
