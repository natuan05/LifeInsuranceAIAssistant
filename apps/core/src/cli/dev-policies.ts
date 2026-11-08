import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { devAccounts, type DevAccountDefinition } from './dev-accounts';
import { renderFixturePdf, type FixturePdf } from './dev-policy-pdf';
import type { FixtureStorage } from './dev-policy-storage';
import { hash, loadPublicCorpus, policyFixture, publicPdfVersion, publicProducts, publicTermsPdf, syntheticDataset, type PolicyOwner } from './dev-policy-source';
import { contractVersion, loadPolicyPortfolio, policyParties, portfolioContractPdf, portfolioVersion } from './dev-policy-portfolio';

export const policySeedOperator = 'dev-bootstrap-synthetic-manulife-v1';
const fixedDate = new Date('2026-10-01T00:00:00Z');
export function fixtureId(value: string) {
  const hex = createHash('sha256').update(`${policyFixture}:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const fixtureObjectPrefix = `dev-fixtures/${policyFixture}/`;
type Plan = { id: string; title: string; productId: string; policyId: string | null; ownerCustomerId: string | null; version: string; pdf: FixturePdf };

// Bootstrap is additive and preserves all edited rows. Destructive replacement is
// a separate, explicitly invoked local-only operation in reset-dev-data.ts.
export async function seedPoliciesInTransaction(tx: Prisma.TransactionClient, storage: FixtureStorage,
  fixtures: readonly DevAccountDefinition[] = devAccounts, namespace = 'DEV') {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1101)`;
  const source = loadPolicyPortfolio(); const { portfolio } = source;
  const customers = fixtures.filter(row => row.role === 'CUSTOMER').slice(0, 2);
  if (customers.length !== 2) throw new Error('Two reserved synthetic customers are required.');
  const owners: PolicyOwner[] = [];
  for (const fixture of customers) {
    const user = await tx.user.findUnique({ where: { accountCode: fixture.accountCode } });
    if (!user || user.email !== fixture.email || user.role !== 'CUSTOMER' || !await tx.auditLog.findFirst({
      where: { targetId: user.id, operatorId: 'dev-bootstrap', action: 'ACCOUNT_CREATED', outcome: 'SUCCESS' }, select: { id: true },
    })) throw new Error('Reserved customer conflict.');
    owners.push({ id: user.id, accountCode: fixture.accountCode, fullName: fixture.fullName });
  }
  async function owned(id: string, action: string) {
    return Boolean(await tx.auditLog.findFirst({ where: { targetId: id, operatorId: policySeedOperator, action, outcome: 'SUCCESS' }, select: { id: true } }));
  }
  async function mark(id: string, targetType: string, action: string) {
    await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: policySeedOperator, action, targetType, targetId: id,
      outcome: 'SUCCESS', requestId: randomUUID(), metadata: { fixture: policyFixture, dataset: syntheticDataset, sourceChecksum: source.sourceChecksum } } });
  }
  const result = { productsCreated: 0, policiesCreated: 0, documentsCreated: 0, versionsCreated: 0, objectsCreated: 0, policiesPreserved: 0 };
  const corpus = loadPublicCorpus();
  const products = publicProducts.map(row => ({ id: fixtureId(`${namespace}:product:${row.code}`),
    productCode: namespace === 'DEV' ? row.code : `${namespace}-${row.code.slice(4)}`, name: row.name,
    summary: `${row.kind}. Thông tin và điều khoản từ nguồn Public; chưa duyệt nghiệp vụ. Hợp đồng, phí và quyền lợi DEMO-TITAN trong bộ dev là dữ liệu synthetic, không phải báo giá hoặc xác nhận ghép sản phẩm thương mại.` }));
  for (const item of products) {
    const matches = await tx.insuranceProduct.findMany({ where: { OR: [{ id: item.id }, { productCode: item.productCode }] } });
    if (matches.length) {
      if (matches.length !== 1 || matches[0].id !== item.id || !await owned(item.id, 'DEV_PRODUCT_CREATED')) throw new Error('Reserved product conflict.');
    } else {
      await tx.insuranceProduct.create({ data: { ...item, createdAt: fixedDate } });
      await mark(item.id, 'InsuranceProduct', 'DEV_PRODUCT_CREATED'); result.productsCreated++;
    }
  }
  const plans: Plan[] = corpus.map(item => {
    const suffix = item.product.folder === 'XanhUocMo' && item.document_kind === 'terms_and_conditions'
      ? item.output_markdown.includes('UL049') ? ' - STBH không tự động gia tăng (UL049)' : ' - STBH tự động gia tăng (ULP50)' : '';
    const title = `${item.document_kind === 'important_note' ? 'Thông tin cần lưu ý' : 'Quy tắc và điều khoản'} - ${item.product.name}${suffix}`;
    return { id: fixtureId(`${namespace}:public:${item.output_markdown}`), title,
      productId: fixtureId(`${namespace}:product:${item.product.code}`), policyId: null, ownerCustomerId: null,
      version: publicPdfVersion, pdf: publicTermsPdf(item.markdown, title, item.product.code) };
  });
  for (const scenario of portfolio.policies) {
    const owner = owners[scenario.ownerSlot];
    const product = products.find(item => item.id === fixtureId(`${namespace}:product:${scenario.productCode}`))!;
    const terms = corpus.find(item => item.output_markdown === scenario.termsPath)!;
    const termsId = fixtureId(`${namespace}:public:${scenario.termsPath}`);
    const number = namespace === 'DEV' ? scenario.number : scenario.number.replace(/^BH/, namespace);
    const id = fixtureId(`${namespace}:portfolio:${portfolioVersion}:${scenario.scenarioId}`);
    const mainId = fixtureId(`${namespace}:portfolio-main:${portfolioVersion}:${scenario.scenarioId}`);
    const existing = await tx.insurancePolicy.findMany({ where: { OR: [{ id }, { policyNumber: number }] } });
    if (existing.length && (existing.length !== 1 || existing[0].id !== id || !await owned(id, 'DEV_POLICY_CREATED'))) throw new Error('Reserved policy conflict. Use explicit policy-fixture replacement for the retired duplicate dataset.');
    const parties = policyParties(scenario, owner);
    if (!existing.length) {
      await tx.insurancePolicy.create({ data: { id, policyNumber: number, productId: product.id, customerId: owner.id,
        status: 'ACTIVE', premiumAmount: String(scenario.premiumAmount), paymentFrequency: scenario.paymentFrequency,
        sumAssured: String(scenario.sumAssured), effectiveDate: new Date(scenario.effectiveDate),
        expiryDate: new Date(scenario.expiryDate), nextDueDate: new Date(scenario.nextDueDate), createdAt: new Date(scenario.issueDate),
        benefitsSnapshot: { fixture: policyFixture, synthetic: true, dataset: syntheticDataset,
          datasetVersion: contractVersion, portfolioVersion, scenarioId: scenario.scenarioId, purpose: scenario.purpose,
          sourceChecksum: source.sourceChecksum, currency: 'VND', snapshotAsOf: portfolio.asOfDate,
          insuranceTermYears: Number(scenario.expiryDate.slice(0, 4)) - Number(scenario.effectiveDate.slice(0, 4)),
          premiumTermYears: scenario.premiumTermYears, annualPremium: `${scenario.annualPremium}.00`,
          schemaVersion: 1, riders: [], ridersComplete: true, parties, option: scenario.option,
          payments: scenario.paidDueDates.map((date, i) => ({ receiptId: `${number}-PT${i + 1}`, dueDate: date, paidDate: date, amount: `${scenario.premiumAmount}.00`, synthetic: true })),
          businessSnapshot: { accountValue: null, cashSurrenderValue: null, debt: null, claimPayable: null, claimStatus: 'NOT_ASSESSED' },
          sourceBinding: { publicDocumentRef: scenario.productCode, publicMarkdownSha256: terms.output_sha256,
            humanApproved: false, originalPdf: false, pricingValidated: false, commercialCompatibilityValidated: false },
          benefits: [{ code: 'MAIN', name: 'Main sum assured', amount: `${scenario.sumAssured}.00`, unit: 'VND' }],
          documents: { main: { documentId: mainId, version: contractVersion, kind: 'POLICY' },
            terms: { documentId: termsId, version: publicPdfVersion, kind: 'TERMS' }, endorsements: [] },
        } as Prisma.InputJsonObject } });
      await mark(id, 'InsurancePolicy', 'DEV_POLICY_CREATED'); result.policiesCreated++;
    } else result.policiesPreserved++;
    const pdf = portfolioContractPdf(portfolio, scenario, owner, number);
    plans.push({ id: mainId, title: pdf.title, productId: product.id, policyId: id,
      ownerCustomerId: owner.id, version: contractVersion, pdf });
  }
  for (const plan of plans) {
    const document = await tx.document.findUnique({ where: { id: plan.id } });
    if (document && !await owned(plan.id, 'DEV_DOCUMENT_CREATED')) throw new Error('Reserved document conflict.');
    if (!document) {
      if (plan.policyId) {
        const policy = await tx.insurancePolicy.findUniqueOrThrow({ where: { id: plan.policyId }, select: { customerId: true, productId: true, benefitsSnapshot: true } });
        if (policy.customerId !== plan.ownerCustomerId || policy.productId !== plan.productId || !JSON.stringify(policy.benefitsSnapshot).includes(plan.id)) continue;
      }
      await tx.document.create({ data: { id: plan.id, title: plan.title, productId: plan.productId,
        policyId: plan.policyId, ownerCustomerId: plan.ownerCustomerId, accessScope: plan.policyId ? 'PRIVATE_POLICY' : 'PUBLIC', createdAt: fixedDate } });
      await mark(plan.id, 'Document', 'DEV_DOCUMENT_CREATED'); result.documentsCreated++;
    }
    const versionId = fixtureId(`${namespace}:version:${plan.id}:${plan.version}`);
    const existing = await tx.documentVersion.findUnique({ where: { documentId_versionNumber: { documentId: plan.id, versionNumber: plan.version } } });
    const bytes = await renderFixturePdf(plan.pdf); const checksum = hash(bytes);
    const key = `${fixtureObjectPrefix}${namespace.toLowerCase()}/${plan.id}/${plan.version}.pdf`;
    if (existing && (existing.id !== versionId || existing.storageBucket !== storage.bucket || existing.storageObjectKey !== key || existing.checksumSha256 !== checksum)) throw new Error('Reserved version conflict.');
    if (await storage.ensure(key, bytes, checksum)) result.objectsCreated++;
    if (!existing) {
      await tx.documentVersion.create({ data: { id: versionId, documentId: plan.id, versionNumber: plan.version,
        storageBucket: storage.bucket, storageObjectKey: key, checksumSha256: checksum, createdAt: fixedDate } });
      result.versionsCreated++;
    }
    if (!document) await tx.document.update({ where: { id: plan.id }, data: { currentVersion: plan.version } });
  }
  return result;
}
