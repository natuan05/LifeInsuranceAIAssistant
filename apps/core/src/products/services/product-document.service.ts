import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../auth/services/auth.service';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '../../generated/prisma/client';
import { PolicyStorageService } from '../../policies/services/policy-storage.service';
import type { ProductDocumentsQuery, ProductDocumentsResponseDto } from '../dto/product-documents.dto';
import { ProductService, type ProductActor } from './product.service';
import { consumeProductQuota } from './product-quota';
import { decodeProductDocumentCursor, encodeProductDocumentCursor, productDocumentScope } from './product-document-cursor';

type Request = IncomingMessage & { requestId?: string };
const publication = (productId: string) => ({ productId, accessScope: 'PUBLIC' as const, policyId: null, ownerCustomerId: null, product: { isActive: true } });

@Injectable()
export class ProductDocumentService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService,
    private readonly products: ProductService, private readonly storage: PolicyStorageService) {}

  list(request: Request, productId: string, query: ProductDocumentsQuery): Promise<ProductDocumentsResponseDto> {
    return this.products.readCatalog(request, async (tx, actor) => {
      const scope = productDocumentScope(actor, productId, query.limit);
      const cursor = decodeProductDocumentCursor(query.cursor, scope);
      if (!await tx.insuranceProduct.findFirst({ where: { id: productId, isActive: true }, select: { id: true } })) throw new NotFoundException();
      const rows = await tx.document.findMany({ where: { ...publication(productId), current: { isActive: true },
        ...(cursor ? { OR: [{ title: { gt: cursor.title } }, { title: cursor.title, id: { gt: cursor.id } }] } : {}) },
        select: { id: true, title: true, current: { select: { id: true, versionNumber: true, createdAt: true } } },
        orderBy: [{ title: 'asc' }, { id: 'asc' }], take: query.limit + 1 });
      const page = rows.slice(0, query.limit), hasMore = rows.length > query.limit;
      const last = page.at(-1);
      return { items: page.map(row => ({ documentId: row.id, title: row.title, accessScope: 'PUBLIC',
        versionId: row.current!.id, versionNumber: row.current!.versionNumber, versionCreatedAt: row.current!.createdAt.toISOString() })),
        pageInfo: { hasMore, nextCursor: hasMore && last ? encodeProductDocumentCursor(scope, last.title, last.id) : null } };
    });
  }

  private async version(tx: Prisma.TransactionClient, productId: string, documentId: string, versionId: string) {
    const document = await tx.document.findFirst({ where: { id: documentId, ...publication(productId), current: { id: versionId, isActive: true } },
      select: { current: { select: { id: true, versionNumber: true, storageBucket: true, storageObjectKey: true, checksumSha256: true } } } });
    if (!document?.current) throw new NotFoundException();
    return document.current;
  }
  private async currentWriter(request: Request, tx: Prisma.TransactionClient, actor: ProductActor) {
    const current = await this.auth.authorizeWrite(request, tx);
    if (current.actor.id !== actor.id || current.actor.role !== actor.role) throw new UnauthorizedException();
  }

  async access(request: Request, productId: string, documentId: string, versionId: string, intent: 'view' | 'download') {
    const initial = await this.auth.authorizeWrite(request, this.database.prisma);
    if (initial.actor.role !== 'STAFF' && initial.actor.role !== 'CUSTOMER') throw new ForbiddenException();
    const actor: ProductActor = { id: initial.actor.id, role: initial.actor.role };
    await consumeProductQuota(this.database.prisma, actor.id, 'DOCUMENT_ACCESS');
    const metadata = { productId, documentId, versionId, intent };
    const requestId = request.requestId ?? randomUUID();
    try {
      const version = await this.database.prisma.$transaction(async tx => {
        await this.currentWriter(request, tx, actor);
        return this.version(tx, productId, documentId, versionId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      // Network/storage work deliberately runs outside a DB transaction.
      const result = await this.storage.access(version, `product-${documentId}-v${version.versionNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`, intent);
      await this.database.prisma.$transaction(async tx => {
        await this.currentWriter(request, tx, actor);
        const current = await this.version(tx, productId, documentId, versionId);
        if (current.storageBucket !== version.storageBucket || current.storageObjectKey !== version.storageObjectKey
          || current.checksumSha256 !== version.checksumSha256 || current.versionNumber !== version.versionNumber) throw new NotFoundException();
        await tx.auditLog.create({ data: { actorType: 'USER', actorId: actor.id, actorRole: actor.role,
          action: intent === 'view' ? 'PRODUCT_PDF_VIEW_ISSUED' : 'PRODUCT_PDF_DOWNLOAD_ISSUED',
          targetType: 'DocumentVersion', targetId: versionId, outcome: 'SUCCESS', requestId, metadata } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return result;
    } catch (error) {
      // Failure auditing must not replace the original safe HTTP error. Neither
      // audit path stores SDK errors, signed URLs, object keys or PDF contents.
      try {
        await this.database.prisma.auditLog.create({ data: { actorType: 'USER', actorId: actor.id, actorRole: actor.role,
          action: intent === 'view' ? 'PRODUCT_PDF_VIEW_FAILED' : 'PRODUCT_PDF_DOWNLOAD_FAILED',
          targetType: 'DocumentVersion', targetId: versionId, outcome: 'FAILURE', requestId, metadata } });
      } catch { /* Preserve the original error if the audit database is unavailable. */ }
      throw error;
    }
  }
}
