import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PolicyStorageService } from './policy-storage.service';
import type { IncomingMessage } from 'node:http';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import type { PolicyListQuery } from '../dto/policy-query.dto';
import type { DocumentKind, PolicyDocumentDto, PolicyDocumentIssueDto, PolicyDocumentsResponseDto } from '../dto/policy-response.dto';
import { benefitsSnapshot, currency, object } from './policy-snapshot';

const policySelect = {
  id: true, policyNumber: true, customerId: true, productId: true, status: true, premiumAmount: true, paymentFrequency: true,
  nextDueDate: true, effectiveDate: true, expiryDate: true, sumAssured: true, benefitsSnapshot: true,
  product: { select: { id: true, productCode: true, name: true, isActive: true } },
} satisfies Prisma.InsurancePolicySelect;
type Policy = Prisma.InsurancePolicyGetPayload<{ select: typeof policySelect }>;
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
function policyView(row: Policy) {
  return { id: row.id, policyNumber: row.policyNumber, customerId: row.customerId, product: row.product, status: row.status,
    premiumAmount: row.premiumAmount?.toFixed(2) ?? null, paymentFrequency: row.paymentFrequency,
    nextDueDate: day(row.nextDueDate), effectiveDate: day(row.effectiveDate), expiryDate: day(row.expiryDate),
    sumAssured: row.sumAssured?.toFixed(2) ?? null, currency: currency(row.benefitsSnapshot) };
}
type Binding = { documentId: string; version: string; kind: DocumentKind };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PolicyService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService, private readonly storage: PolicyStorageService) {}

  private read<T>(request: IncomingMessage, work: (tx: Prisma.TransactionClient, actorId: string) => Promise<T>) {
    return this.database.prisma.$transaction(async tx => {
      const { actor } = await this.auth.me(request, tx);
      if (actor.role !== 'STAFF') throw new ForbiddenException();
      return work(tx, actor.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
  private assigned(staffId: string): Prisma.CustomerProfileWhereInput {
    return { assignments: { some: { staffId, isActive: true } } };
  }
  list(request: IncomingMessage, customerId: string, query: PolicyListQuery) {
    return this.read(request, async (tx, actorId) => {
      const customer = await tx.customerProfile.findFirst({ where: { userId: customerId, ...this.assigned(actorId) }, select: { userId: true } });
      if (!customer) throw new NotFoundException();
      const where: Prisma.InsurancePolicyWhereInput = { customerId, customer: this.assigned(actorId) };
      const total = await tx.insurancePolicy.count({ where });
      const rows = await tx.insurancePolicy.findMany({ where, select: policySelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: rows.map(policyView), total, page: query.page, pageSize: query.pageSize };
    });
  }
  detail(request: IncomingMessage, policyId: string) {
    return this.read(request, async (tx, actorId) => {
      const row = await tx.insurancePolicy.findFirst({ where: { id: policyId, customer: this.assigned(actorId) }, select: {
        ...policySelect, product: { select: { id: true, productCode: true, name: true, isActive: true, summary: true } },
        customer: { select: { userId: true, fullName: true, user: { select: { accountCode: true } } } },
      } });
      if (!row) throw new NotFoundException();
      return { policy: { ...policyView(row), customer: { id: row.customer.userId, fullName: row.customer.fullName, accountCode: row.customer.user.accountCode },
        ...benefitsSnapshot(row.benefitsSnapshot) } };
    });
  }
  documents(request: IncomingMessage, policyId: string): Promise<PolicyDocumentsResponseDto> {
    return this.read(request, (tx, actorId) => this.catalog(tx, actorId, policyId));
  }
  private async catalog(tx: Prisma.TransactionClient, actorId: string, policyId: string): Promise<PolicyDocumentsResponseDto> {
      const policy = await tx.insurancePolicy.findFirst({ where: { id: policyId, customer: this.assigned(actorId) },
        select: { id: true, customerId: true, productId: true, benefitsSnapshot: true } });
      if (!policy) throw new NotFoundException();
      const source = object(object(policy.benefitsSnapshot)?.documents);
      const issues: PolicyDocumentIssueDto[] = [];
      const bindings: Binding[] = [];
      const seen = new Set<string>();
      let main: PolicyDocumentsResponseDto['mainDocumentStatus'] = 'NOT_PROVIDED';
      function bind(value: unknown, kinds: DocumentKind[], primary = false) {
        if (value === undefined || value === null) return;
        if (primary) main = 'UNAVAILABLE';
        const row = object(value);
        if (!row || typeof row.documentId !== 'string' || !uuid.test(row.documentId) || typeof row.version !== 'string'
          || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(row.version) || !kinds.includes(row.kind as DocumentKind)) {
          issues.push({ kind: kinds[0], reason: 'INVALID_BINDING' }); return;
        }
        const key = `${row.documentId.toLowerCase()}:${row.version}`;
        if (seen.has(key)) { issues.push({ kind: row.kind as DocumentKind, reason: 'DUPLICATE_BINDING' }); return; }
        seen.add(key); bindings.push({ documentId: row.documentId.toLowerCase(), version: row.version, kind: row.kind as DocumentKind });
      }
      if (!source) issues.push({ kind: null, reason: 'BINDINGS_NOT_PROVIDED' });
      else {
        bind(source.main, ['POLICY', 'POLICY_DRAFT'], true); bind(source.terms, ['TERMS']); bind(source.guide, ['PRODUCT_GUIDE']);
        if (source.endorsements !== undefined && source.endorsements !== null) {
          if (!Array.isArray(source.endorsements) || source.endorsements.length > 50) issues.push({ kind: 'ENDORSEMENT', reason: 'INVALID_BINDING' });
          else for (const item of source.endorsements) bind(item, ['ENDORSEMENT']);
        }
      }
      // Both exact version and document scope are part of the query. A valid UUID
      // inside trusted DB JSON is still not sufficient authority to expose a file.
      const versions = bindings.length ? await tx.documentVersion.findMany({ where: { isActive: true, OR: bindings.map(binding => ({
        documentId: binding.documentId, versionNumber: binding.version,
        document: ['POLICY', 'POLICY_DRAFT', 'ENDORSEMENT'].includes(binding.kind)
          ? { accessScope: 'PRIVATE_POLICY', policyId: policy.id, ownerCustomerId: policy.customerId, OR: [{ productId: policy.productId }, { productId: null }] }
          : { accessScope: 'PUBLIC', productId: policy.productId, policyId: null, ownerCustomerId: null },
      })) }, select: { id: true, documentId: true, versionNumber: true, createdAt: true,
        document: { select: { title: true, accessScope: true } } } }) : [];
      const found = new Map(versions.map(version => [`${version.documentId}:${version.versionNumber}`, version]));
      const items: PolicyDocumentDto[] = [];
      for (const binding of bindings) {
        const version = found.get(`${binding.documentId}:${binding.version}`);
        if (!version) { issues.push({ kind: binding.kind, reason: 'DOCUMENT_UNAVAILABLE' }); continue; }
        items.push({ documentId: binding.documentId, title: version.document.title, kind: binding.kind, accessScope: version.document.accessScope,
          versionId: version.id, versionNumber: version.versionNumber, versionCreatedAt: version.createdAt.toISOString() });
        if (binding.kind === 'POLICY' || binding.kind === 'POLICY_DRAFT') main = 'AVAILABLE';
      }
      return { policyId: policy.id, items, total: items.length, issues, mainDocumentStatus: main,
        availability: issues.length ? items.length ? 'PARTIAL' : 'UNAVAILABLE' : items.length ? 'AVAILABLE' : 'EMPTY' };
  }
  access(request: IncomingMessage & { requestId?: string }, policyId: string, documentId: string, versionId: string, intent: 'view' | 'download') {
    return this.read(request, async (tx, actorId) => {
      await this.auth.authorizeWrite(request, tx);
      const catalog = await this.catalog(tx, actorId, policyId);
      const binding = catalog.items.find(item => item.documentId === documentId && item.versionId === versionId);
      if (!binding) throw new NotFoundException();
      const version = await tx.documentVersion.findFirst({ where: { id: versionId, documentId, isActive: true },
        select: { storageBucket: true, storageObjectKey: true } });
      if (!version) throw new NotFoundException();
      const result = await this.storage.access(version, `policy-${documentId}-v${binding.versionNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`, intent);
      await tx.auditLog.create({ data: { actorType: 'USER', actorId, actorRole: 'STAFF', action: intent === 'view' ? 'POLICY_PDF_VIEW_ISSUED' : 'POLICY_PDF_DOWNLOAD_ISSUED',
        targetType: 'DocumentVersion', targetId: versionId, outcome: 'SUCCESS', requestId: request.requestId ?? randomUUID(),
        metadata: { policyId, documentId, versionId, intent } } });
      return result;
    });
  }

}
