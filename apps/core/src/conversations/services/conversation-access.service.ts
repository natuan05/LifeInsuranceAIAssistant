import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

export type InboxFilter = 'all' | 'requests' | 'active';
export type ConversationGrant = {
  conversationId: string;
  customerId: string;
  status: 'AI_ACTIVE' | 'PENDING_HANDOFF' | 'STAFF_ACTIVE';
  controlVersion: number;
  capability: 'REQUEST_METADATA' | 'TRANSCRIPT';
  canView: boolean;
  canAccept: boolean;
  canTakeover: boolean;
  canSend: boolean;
};
const gateSelect = { id: true, customerId: true, status: true, supportOrigin: true, controlVersion: true, assignedStaffId: true } satisfies Prisma.ConversationSelect;
const availableUser = (now: Date): Prisma.UserWhereInput => ({ status: 'ACTIVE', OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] });

// Trusted Core services pass the session actor. These predicates must be applied
// before grouping, pagination, projection and event recipient selection.
@Injectable()
export class ConversationAccessService {
  // SQL representation of staffScope for permission-first grouping/keysets.
  // Keep both representations in this policy service; parity is integration-tested.
  // Rule (FR-006): Unassigned customers are visible to any active Staff;
  // assigned customers are visible ONLY to their assigned active Staff.
  staffSqlEntries(actorId: string, filter: InboxFilter, now: Date): Prisma.Sql {
    const aiActive = Prisma.sql`(c.status='AI_ACTIVE' AND c.support_origin='AI'
      AND NOT EXISTS (SELECT 1 FROM business.conversation_handoffs hr WHERE hr.conversation_id=c.id AND hr.state='REVOKED'))`;
    const pending = Prisma.sql`(c.status='PENDING_HANDOFF' AND h.state='PENDING')`;
    const activeOwn = Prisma.sql`(c.status='STAFF_ACTIVE' AND c.assigned_staff_id=${actorId}::uuid AND (
      (h.state='ACCEPTED' AND h.accepted_by_staff_id=${actorId}::uuid)
      OR (c.support_origin='DIRECT' AND (a.id IS NULL OR c.direct_assignment_id=a.id))
      OR c.support_origin='AI'))`;
    const activeUnassignedOther = Prisma.sql`(c.status='STAFF_ACTIVE' AND a.id IS NULL
      AND c.assigned_staff_id IS NOT NULL AND c.assigned_staff_id<>${actorId}::uuid
      AND (c.support_origin='AI' OR c.support_origin='DIRECT' OR h.state='ACCEPTED'))`;
    const state = filter === 'requests' ? pending
      : filter === 'active' ? activeOwn
      : Prisma.sql`(${aiActive} OR ${pending} OR ${activeOwn} OR ${activeUnassignedOther})`;
    return Prisma.sql`
      SELECT c.id,c.customer_id,cp.full_name,cu.account_code,c.status,c.control_version,
        CASE
          WHEN c.status='AI_ACTIVE' THEN 'AI'
          WHEN c.status='PENDING_HANDOFF' THEN 'REQUEST'
          WHEN h.state='ACCEPTED' THEN 'TRANSFERRED'
          WHEN c.support_origin='DIRECT' THEN 'DIRECT'
          ELSE 'TRANSFERRED'
        END AS entry_type,
        CASE WHEN c.status='PENDING_HANDOFF' THEN COALESCE(h.shared_subject,'Yêu cầu Staff hỗ trợ')
          ELSE COALESCE(NULLIF(btrim(c.subject),''),h.shared_subject,'Cuộc trò chuyện') END AS subject,
        CASE
          WHEN c.status='PENDING_HANDOFF' THEN h.confirmed_at
          WHEN c.status='AI_ACTIVE' THEN COALESCE(c.last_customer_facing_activity_at,c.created_at)
          ELSE GREATEST(c.last_customer_facing_activity_at,h.accepted_at,c.created_at)
        END AS activity_at,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.id ELSE NULL END AS request_id,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.shared_reason ELSE NULL END AS shared_reason,
        CASE WHEN c.status='PENDING_HANDOFF' THEN h.confirmed_at ELSE NULL END AS requested_at,
        TRUE AS can_view,
        COALESCE(c.status='PENDING_HANDOFF' AND h.state='PENDING',FALSE) AS can_accept,
        COALESCE(c.status='AI_ACTIVE' AND c.support_origin='AI',FALSE) AS can_takeover,
        COALESCE(c.status='STAFF_ACTIVE' AND c.assigned_staff_id=${actorId}::uuid,FALSE) AS can_send
      FROM business.conversations c
      JOIN business.customer_profiles cp ON cp.user_id=c.customer_id
      JOIN business.users cu ON cu.id=cp.user_id
      JOIN business.users su ON su.id=${actorId}::uuid
      LEFT JOIN business.staff_assignments a ON a.customer_id=c.customer_id AND a.is_active
      LEFT JOIN business.conversation_handoffs h ON h.conversation_id=c.id AND h.customer_id=c.customer_id
        AND h.revoked_at IS NULL AND h.state IN ('PENDING','ACCEPTED')
        AND h.consent_scope='ENTIRE_CUSTOMER_VISIBLE_CONVERSATION'
        AND h.consent_text_version='handoff-v1'
        AND (a.id IS NULL OR (h.assignment_id=a.id AND h.recipient_staff_id=a.staff_id))
      WHERE c.channel_type='CUSTOMER_SUPPORT' AND c.support_origin IN ('AI','DIRECT')
        AND cu.status='ACTIVE' AND (cu.locked_until IS NULL OR cu.locked_until<=${now})
        AND su.role='STAFF' AND su.status='ACTIVE' AND (su.locked_until IS NULL OR su.locked_until<=${now})
        AND (a.id IS NULL OR a.staff_id=${actorId}::uuid) AND ${state}`;
  }

  staffScope(actorId: string, filter: InboxFilter = 'all', now = new Date()): Prisma.ConversationWhereInput {
    const assignedToActor: Prisma.StaffAssignmentWhereInput = {
      staffId: actorId, isActive: true, staff: { user: availableUser(now) },
    };
    const unassignedCustomer: Prisma.CustomerProfileWhereInput = {
      assignments: { none: { isActive: true } },
    };
    const baseEvidence = {
      revokedAt: null,
      consentScope: 'ENTIRE_CUSTOMER_VISIBLE_CONVERSATION',
      consentTextVersion: 'handoff-v1',
    };
    const assignedEvidence = { ...baseEvidence, recipientStaffId: actorId, assignment: assignedToActor };
    const aiActive: Prisma.ConversationWhereInput = {
      status: 'AI_ACTIVE',
      supportOrigin: 'AI',
      handoffs: { none: { state: 'REVOKED' } },
    };
    const pending: Prisma.ConversationWhereInput = {
      status: 'PENDING_HANDOFF',
      OR: [
        { handoffs: { some: { ...assignedEvidence, state: 'PENDING' } } },
        { customer: unassignedCustomer, handoffs: { some: { ...baseEvidence, state: 'PENDING' } } },
      ],
    };
    const activeOwn: Prisma.ConversationWhereInput = {
      status: 'STAFF_ACTIVE',
      assignedStaffId: actorId,
      OR: [
        { handoffs: { some: { ...assignedEvidence, state: 'ACCEPTED', acceptedByStaffId: actorId } } },
        { customer: unassignedCustomer, handoffs: { some: { ...baseEvidence, state: 'ACCEPTED', acceptedByStaffId: actorId } } },
        { supportOrigin: 'DIRECT', directAssignment: assignedToActor },
        { supportOrigin: 'DIRECT', customer: unassignedCustomer },
        { supportOrigin: 'AI' },
      ],
    };
    const activeUnassignedOther: Prisma.ConversationWhereInput = {
      status: 'STAFF_ACTIVE',
      assignedStaffId: { not: null, notIn: [actorId] },
      customer: unassignedCustomer,
      OR: [
        { supportOrigin: 'AI' },
        { supportOrigin: 'DIRECT' },
        { handoffs: { some: { ...baseEvidence, state: 'ACCEPTED' } } },
      ],
    };
    return {
      channelType: 'CUSTOMER_SUPPORT',
      supportOrigin: { in: ['AI', 'DIRECT'] },
      customer: {
        user: availableUser(now),
        OR: [
          { assignments: { some: assignedToActor } },
          unassignedCustomer,
        ],
      },
      AND: [
        filter === 'requests' ? pending
          : filter === 'active' ? activeOwn
          : { OR: [aiActive, pending, activeOwn, activeUnassignedOther] },
      ],
    };
  }

  customerScope(actorId: string, now = new Date()): Prisma.ConversationWhereInput {
    return { customerId: actorId, channelType: 'CUSTOMER_SUPPORT', supportOrigin: { in: ['AI', 'DIRECT'] },
      customer: { user: availableUser(now) } };
  }

  async requireMetadata(tx: Prisma.TransactionClient, actorId: string, id: string): Promise<ConversationGrant> {
    const now = new Date();
    const staff = await tx.user.findFirst({ where: { id: actorId, role: 'STAFF', ...availableUser(now) }, select: { id: true } });
    if (!staff) throw new NotFoundException();
    const row = await tx.conversation.findFirst({ where: { id, AND: [this.staffScope(actorId, 'all', now)] }, select: gateSelect });
    if (!row) throw new NotFoundException();
    const canAccept = row.status === 'PENDING_HANDOFF';
    const canTakeover = row.status === 'AI_ACTIVE' && row.supportOrigin === 'AI';
    const canSend = row.status === 'STAFF_ACTIVE' && row.assignedStaffId === actorId;
    return {
      conversationId: id,
      customerId: row.customerId,
      status: row.status,
      controlVersion: row.controlVersion,
      capability: 'TRANSCRIPT',
      canView: true,
      canAccept,
      canTakeover,
      canSend,
    };
  }

  async requireTranscript(tx: Prisma.TransactionClient, actorId: string, id: string): Promise<ConversationGrant> {
    const grant = await this.requireMetadata(tx, actorId, id);
    if (!grant.canView) throw new NotFoundException();
    return grant;
  }

  async requireCustomer(tx: Prisma.TransactionClient, actorId: string, id: string) {
    const now = new Date();
    const conversation = await tx.conversation.findFirst({ where: { id, AND: [this.customerScope(actorId, now)] },
      select: { ...gateSelect, handoffs: { select: { id: true } } } });
    if (!conversation) throw new NotFoundException();
    // A revoked Direct/transfer is not silently resumed as AI after reassignment.
    const privateAI = conversation.supportOrigin === 'AI' && conversation.status === 'AI_ACTIVE' && !conversation.handoffs.length;
    const currentStaff = await tx.staffAssignment.findFirst({ where: { customerId: actorId, isActive: true,
      staff: { user: availableUser(now) } }, select: { staffId: true } });
    let routed = false;
    if (conversation.status !== 'AI_ACTIVE') {
      const targetStaffId = currentStaff?.staffId ?? conversation.assignedStaffId;
      if (targetStaffId) {
        const staffAvailable = await tx.user.findFirst({ where: { id: targetStaffId, role: 'STAFF', ...availableUser(now) }, select: { id: true } });
        if (staffAvailable) {
          routed = !!await tx.conversation.findFirst({ where: { id, AND: [this.staffScope(targetStaffId, 'all', now)] }, select: { id: true } });
        }
      }
    }
    return { ...conversation, canSend: privateAI || routed };
  }
}
