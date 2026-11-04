import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export type InboxFilter = 'all' | 'requests' | 'active';
export type ConversationGrant = {
  conversationId: string; customerId: string; controlVersion: number;
  capability: 'REQUEST_METADATA' | 'TRANSCRIPT'; canAccept: boolean; canSend: boolean;
};
const gateSelect = { id: true, customerId: true, controlVersion: true, assignedStaffId: true } satisfies Prisma.ConversationSelect;
const availableUser = (now: Date): Prisma.UserWhereInput => ({ status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });

// Trusted Core services pass the session actor. These predicates must be applied
// before grouping, pagination, projection and event recipient selection.
@Injectable()
export class ConversationAccessService {
  // SQL representation of staffScope for permission-first grouping/keysets.
  // Keep both representations in this policy service; parity is integration-tested.
  // CASE projections never return the private AI title/activity for pending rows.
  staffSqlEntries(actorId: string, filter: InboxFilter, now: Date): Prisma.Sql {
    const pending = Prisma.sql`(c.status='PENDING_HANDOFF' AND h.state='PENDING')`;
    const active = Prisma.sql`(c.status='STAFF_ACTIVE' AND (
      (h.state='ACCEPTED' AND h.accepted_by_staff_id=${actorId}::uuid)
      OR (c.support_origin='DIRECT' AND c.direct_assignment_id=a.id)))`;
    const state = filter === 'requests' ? pending : filter === 'active' ? active : Prisma.sql`(${pending} OR ${active})`;
    return Prisma.sql`
      SELECT c.id,c.customer_id,cp.full_name,cu.account_code,c.status,c.control_version,
        CASE WHEN c.status='PENDING_HANDOFF' THEN 'REQUEST'
          WHEN h.state='ACCEPTED' THEN 'TRANSFERRED' ELSE 'DIRECT' END AS entry_type,
        CASE WHEN c.status='PENDING_HANDOFF' THEN COALESCE(h.shared_subject,'Yêu cầu Staff hỗ trợ')
          ELSE COALESCE(NULLIF(btrim(c.subject),''),h.shared_subject,'Cuộc trò chuyện') END AS subject,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.confirmed_at
          ELSE GREATEST(c.last_customer_facing_activity_at,h.accepted_at,c.created_at) END AS activity_at,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.id ELSE NULL END AS request_id,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.shared_reason ELSE NULL END AS shared_reason,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.confirmed_at ELSE NULL END AS requested_at,
        COALESCE(c.status='STAFF_ACTIVE' AND c.assigned_staff_id=${actorId}::uuid,FALSE) AS can_send
      FROM business.conversations c
      JOIN business.customer_profiles cp ON cp.user_id=c.customer_id
      JOIN business.users cu ON cu.id=cp.user_id
      JOIN business.staff_assignments a ON a.customer_id=c.customer_id AND a.is_active AND a.staff_id=${actorId}::uuid
      JOIN business.users su ON su.id=a.staff_id
      LEFT JOIN business.conversation_handoffs h ON h.conversation_id=c.id AND h.customer_id=c.customer_id
        AND h.assignment_id=a.id AND h.recipient_staff_id=a.staff_id AND h.revoked_at IS NULL
        AND h.state IN ('PENDING','ACCEPTED') AND h.consent_scope='ENTIRE_CUSTOMER_VISIBLE_CONVERSATION'
        AND h.consent_text_version='handoff-v1'
      WHERE c.channel_type='CUSTOMER_SUPPORT' AND c.support_origin IN ('AI','DIRECT')
        AND cu.status='ACTIVE' AND (cu.locked_until IS NULL OR cu.locked_until<=${now})
        AND su.status='ACTIVE' AND (su.locked_until IS NULL OR su.locked_until<=${now}) AND ${state}`;
  }

  staffScope(actorId: string, filter: InboxFilter = 'all', now = new Date()): Prisma.ConversationWhereInput {
    const assignment: Prisma.StaffAssignmentWhereInput = {
      staffId: actorId, isActive: true, staff: { user: availableUser(now) },
    };
    const evidence = { recipientStaffId: actorId, revokedAt: null,
      consentScope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION', consentTextVersion: 'handoff-v1', assignment };
    const pending: Prisma.ConversationWhereInput = {
      status: 'PENDING_HANDOFF', handoffs: { some: { ...evidence, state: 'PENDING' } },
    };
    const active: Prisma.ConversationWhereInput = {
      status: 'STAFF_ACTIVE', OR: [
        { handoffs: { some: { ...evidence, state: 'ACCEPTED', acceptedByStaffId: actorId } } },
        { supportOrigin: 'DIRECT', directAssignment: assignment },
      ],
    };
    return { channelType: 'CUSTOMER_SUPPORT', supportOrigin: { in: ['AI', 'DIRECT'] },
      customer: { user: availableUser(now), assignments: { some: assignment } },
      AND: [filter === 'requests' ? pending : filter === 'active' ? active : { OR: [pending, active] }] };
  }

  customerScope(actorId: string, now = new Date()): Prisma.ConversationWhereInput {
    return { customerId: actorId, channelType: 'CUSTOMER_SUPPORT', supportOrigin: { in: ['AI', 'DIRECT'] },
      customer: { user: availableUser(now) } };
  }

  async requireMetadata(tx: Prisma.TransactionClient, actorId: string, id: string): Promise<ConversationGrant> {
    const active = await tx.conversation.findFirst({ where: { id, AND: [this.staffScope(actorId, 'active')] }, select: gateSelect });
    if (active) return { conversationId: id, customerId: active.customerId, controlVersion: active.controlVersion,
      capability: 'TRANSCRIPT', canAccept: false, canSend: active.assignedStaffId === actorId };
    const pending = await tx.conversation.findFirst({ where: { id, AND: [this.staffScope(actorId, 'requests')] }, select: gateSelect });
    if (!pending) throw new NotFoundException();
    return { conversationId: id, customerId: pending.customerId, controlVersion: pending.controlVersion,
      capability: 'REQUEST_METADATA', canAccept: true, canSend: false };
  }

  async requireTranscript(tx: Prisma.TransactionClient, actorId: string, id: string): Promise<ConversationGrant> {
    const grant = await this.requireMetadata(tx, actorId, id);
    if (grant.capability !== 'TRANSCRIPT') throw new NotFoundException();
    return grant;
  }

  async requireCustomer(tx: Prisma.TransactionClient, actorId: string, id: string) {
    const conversation = await tx.conversation.findFirst({ where: { id, AND: [this.customerScope(actorId)] },
      select: { ...gateSelect, status: true, supportOrigin: true, handoffs: { select: { id: true } } } });
    if (!conversation) throw new NotFoundException();
    // A revoked Direct/transfer is not silently resumed as AI after reassignment.
    const privateAI = conversation.supportOrigin === 'AI' && conversation.status === 'AI_ACTIVE' && !conversation.handoffs.length;
    const currentStaff = await tx.staffAssignment.findFirst({ where: { customerId: actorId, isActive: true,
      staff: { user: availableUser(new Date()) } }, select: { staffId: true } });
    let routed = false;
    if (currentStaff && conversation.status !== 'AI_ACTIVE') {
      routed = !!await tx.conversation.findFirst({ where: { id, AND: [this.staffScope(currentStaff.staffId)] }, select: { id: true } });
    }
    return { ...conversation, canSend: privateAI || routed };
  }
}
