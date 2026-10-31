import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { devAccounts, type DevAccountDefinition } from './dev-accounts';
import { renderFixturePdf, type FixturePdf } from './dev-policy-pdf';
import type { FixtureStorage } from './dev-policy-storage';

const operator = 'dev-bootstrap-policies-v1';
const fixedDate = new Date('2026-10-31T00:00:00Z');
export function fixtureId(value: string) {
  const hex = createHash('sha256').update(`synthetic-policies-v1:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
type Binding = { documentId: string; version: string; kind: string };
type DocumentPlan = { id: string; title: string; productId: string; policyId: string | null; ownerCustomerId: string | null;
  currentVersion: string; versions: Array<{ version: string; pdf: FixturePdf }> };
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + ' VND';

export async function seedPoliciesInTransaction(tx: Prisma.TransactionClient, storage: FixtureStorage,
  fixtures: readonly DevAccountDefinition[] = devAccounts, namespace = 'DEV') {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(6213, 1101)`;
  const customers = fixtures.filter(row => row.role === 'CUSTOMER').slice(0, 2);
  if (customers.length !== 2) throw new Error('Two reserved synthetic customers are required.');
  const owners: string[] = [];
  for (const fixture of customers) {
    const user = await tx.user.findUnique({ where: { accountCode: fixture.accountCode } });
    if (!user || user.email !== fixture.email || user.role !== 'CUSTOMER' || !await tx.auditLog.findFirst({
      where: { targetId: user.id, operatorId: 'dev-bootstrap', action: 'ACCOUNT_CREATED', outcome: 'SUCCESS' }, select: { id: true },
    })) throw new Error('Reserved customer conflict.');
    owners.push(user.id);
  }
  async function owned(id: string, action: string) {
    return Boolean(await tx.auditLog.findFirst({ where: { targetId: id, operatorId: operator, action, outcome: 'SUCCESS' }, select: { id: true } }));
  }
  async function mark(id: string, targetType: string, action: string) {
    await tx.auditLog.create({ data: { actorType: 'OPERATOR', operatorId: operator, action, targetType, targetId: id,
      outcome: 'SUCCESS', requestId: randomUUID(), metadata: { fixture: 'policies-v1' } } });
  }
  const result = { productsCreated: 0, policiesCreated: 0, documentsCreated: 0, versionsCreated: 0, objectsCreated: 0, policiesPreserved: 0 };
  const products = [
    { id: fixtureId(`${namespace}:product:life`), productCode: `${namespace}-LIFE-01`, name: 'An Tâm Trọn Đời - Mô phỏng', summary: 'Bảo vệ sinh mạng và thương tật mô phỏng. Chỉ dùng thử ứng dụng local.' },
    { id: fixtureId(`${namespace}:product:care`), productCode: `${namespace}-CARE-01`, name: 'Chăm Sóc Chủ Động - Mô phỏng', summary: 'Quyền lợi sức khỏe và trợ cấp nằm viện mô phỏng. Không phải sản phẩm được chào bán.' },
  ];
  const documents: DocumentPlan[] = [];
  for (const product of products) {
    const matches = await tx.insuranceProduct.findMany({ where: { OR: [{ id: product.id }, { productCode: product.productCode }] } });
    if (matches.length) {
      if (matches.length !== 1 || matches[0].id !== product.id || !await owned(product.id, 'DEV_PRODUCT_CREATED')) throw new Error('Reserved product conflict.');
    } else {
      await tx.insuranceProduct.create({ data: { ...product, createdAt: fixedDate } });
      await mark(product.id, 'InsuranceProduct', 'DEV_PRODUCT_CREATED'); result.productsCreated++;
    }
    const id = fixtureId(`${namespace}:terms:${product.id}`);
    documents.push({ id, title: `Quy tắc và điều khoản | ${product.name}`, productId: product.id, policyId: null, ownerCustomerId: null,
      currentVersion: '2.0', versions: ['1.0', '2.0'].map(version => ({ version, pdf: { title: 'Quy tắc và điều khoản mô phỏng', reference: product.productCode, version, sections: [
        { title: 'Quy tắc và điều khoản', paragraphs: [product.name, `Phiên bản áp dụng: ${version}. Tài liệu này được sinh hoàn toàn để thử hệ thống local.`, 'Không phải điều khoản của doanh nghiệp bảo hiểm thực; không dùng tư vấn, giao kết hoặc giải quyết quyền lợi thực tế.'] },
        { title: 'Phạm vi và giới hạn mô phỏng', paragraphs: ['Phạm vi quyền lợi, số tiền và thời hạn của từng khách được ghi trong hợp đồng mô phỏng tương ứng.', 'Các tình huống minh họa bao gồm bảo vệ sinh mạng, thương tật và trợ cấp nằm viện. Không suy ra cam kết chi trả từ tài liệu này.', 'Hệ thống giữ đúng phiên bản điều khoản được hợp đồng tham chiếu; phiên bản mới không tự sửa nội dung hợp đồng trước đó.'] },
        { title: 'Quy trình và lưu ý', paragraphs: ['Thông tin khách, hợp đồng, phụ lục và chữ ký trong bộ hồ sơ này đều là dữ liệu giả lập.', 'Thao tác xem và tải phục vụ kiểm thử quyền truy cập. Tài liệu không chứa tài khoản ngân hàng, thông tin liên hệ thật hoặc chữ ký thật.', 'Kết thúc quy tắc mô phỏng. Không có giá trị pháp lý.'] },
      ] } })) });
  }
  for (let index = 0; index < 14; index++) {
    const ownerIndex = index < 12 ? 0 : 1;
    const customer = customers[ownerIndex]; const customerId = owners[ownerIndex];
    const product = products[index % 2]; const term = documents.find(doc => !doc.policyId && doc.productId === product.id)!;
    const number = `${namespace}-POL-${ownerIndex === 0 ? 'A' : 'B'}-${String(ownerIndex === 0 ? index + 1 : index - 11).padStart(3, '0')}`;
    const id = fixtureId(`${namespace}:policy:${number}`);
    const matches = await tx.insurancePolicy.findMany({ where: { OR: [{ id }, { policyNumber: number }] } });
    if (matches.length && (matches.length !== 1 || matches[0].id !== id || !await owned(id, 'DEV_POLICY_CREATED'))) throw new Error('Reserved policy conflict.');
    const status = index === 11 ? 'PENDING' : index === 6 ? 'LAPSED' : index === 7 ? 'MATURED' : 'ACTIVE';
    const premium = product === products[0] ? 1000000 : 750000;
    const sum = product === products[0] ? 1000000000 : 500000000;
    const mainId = fixtureId(`${namespace}:main:${number}`); const mainVersion = index === 0 ? '1.1' : '1.0';
    const termsVersion = index % 3 === 0 ? '1.0' : '2.0';
    const effective = status === 'PENDING' ? null : status === 'MATURED' ? '2006-01-15' : '2025-01-15';
    const expiry = status === 'PENDING' ? null : status === 'MATURED' ? '2026-01-15' : '2045-01-15';
    const nextDue = status === 'ACTIVE' ? '2026-11-15' : null;
    const endorsements: Binding[] = [];
    // Never manufacture updated fixture documents from user-edited profile or policy data.
    // Existing fixture versions remain based on this immutable synthetic definition.
    if (status !== 'PENDING') {
      documents.push({ id: mainId, title: `Hợp đồng bảo hiểm | ${number} | ${customer.fullName}`, productId: product.id,
        policyId: id, ownerCustomerId: customerId, currentVersion: mainVersion,
        versions: (index === 0 ? ['1.0', '1.1'] : ['1.0']).map(version => ({ version, pdf: { title: `Hợp đồng mô phỏng ${number}`, reference: number, version, sections: [
          { title: 'Hợp đồng bảo hiểm nhân thọ', paragraphs: [product.name, `Số hợp đồng: ${number}. Phiên bản: ${version}.`, `Bên mua bảo hiểm và người được bảo hiểm mô phỏng: ${customer.fullName}. Mã khách: ${customer.accountCode}.`, 'Hồ sơ hoàn toàn giả lập, chỉ dùng kiểm thử local; không có giá trị pháp lý và không xác nhận giao dịch bảo hiểm thực.'] },
          { title: 'Thông tin và thời hạn', paragraphs: [`Sản phẩm: ${product.productCode} - ${product.name}.`, `Ngày hiệu lực: ${effective}. Ngày hết hạn: ${expiry}. Thời hạn bảo hiểm: 20 năm.`, 'Thời hạn đóng phí mô phỏng: 15 năm. Dữ liệu thể hiện trạng thái của fixture tại ngày 31/10/2026.', `Trạng thái mẫu: ${status}. Khách hàng và quan hệ bảo hiểm trong hồ sơ này đều không có thật.`] },
          { title: 'Phí bảo hiểm và quyền lợi', paragraphs: [`Phí định kỳ hàng tháng: ${money(premium)}. Phí năm: ${money(premium * 12)}.`, `Số tiền bảo hiểm chính: ${money(sum)}. Quyền lợi tai nạn mô phỏng: ${money(sum / 2)}.`, 'Trợ cấp nằm viện mô phỏng: 500.000 VND/ngày, tối đa 30 ngày. Các con số chỉ là ví dụ kỹ thuật.', 'Không có yêu cầu thanh toán thật, số tài khoản ngân hàng hoặc cam kết bồi thường trong tài liệu này.'] },
          { title: 'Tài liệu áp dụng và phụ lục', paragraphs: [`Điều khoản tham chiếu: ${product.productCode}, phiên bản ${termsVersion}. Không tự sử dụng phiên bản hiện hành nếu khác phiên bản này.`, index < 2 ? 'Hợp đồng mẫu này có một phụ lục riêng để kiểm thử danh mục tài liệu.' : 'Hợp đồng mẫu này không có phụ lục bổ sung.', 'Quyền lợi đầy đủ được mô phỏng trong bộ tài liệu gắn đúng hợp đồng. Đây không phải xác nhận điều khoản hoặc quy tắc pháp lý thực tế.'] },
          { title: 'Xác nhận mô phỏng', paragraphs: ['Vị trí chữ ký bên mua bảo hiểm: KHÔNG KÝ - DỮ LIỆU MÔ PHỎNG.', 'Vị trí xác nhận doanh nghiệp: KHÔNG CÓ GIÁ TRỊ PHÁP LÝ.', 'Hồ sơ được tạo tự động bởi bootstrap local. Không chứa chữ ký số, chữ ký viết tay hoặc danh tính người thật.', 'Kết thúc hợp đồng mẫu. Sử dụng trang thông tin để thử các trạng thái và PDF gốc để thử xem/tải.'] },
        ] } })) });
      if (index < 2) {
        const endorsementId = fixtureId(`${namespace}:endorsement:${number}`);
        endorsements.push({ documentId: endorsementId, version: '1.0', kind: 'ENDORSEMENT' });
        documents.push({ id: endorsementId, title: `Phụ lục mô phỏng | ${number}`, productId: product.id, policyId: id,
          ownerCustomerId: customerId, currentVersion: '1.0', versions: [{ version: '1.0', pdf: { title: `Phụ lục ${number}`, reference: number, version: '1.0', sections: [
            { title: 'Phụ lục hợp đồng mô phỏng', paragraphs: [`Hợp đồng gốc: ${number}. Khách hàng mô phỏng: ${customer.fullName}.`, 'Phụ lục minh họa thông báo bổ sung quyền lợi và cách liên kết tài liệu riêng của hợp đồng.', 'Số tiền minh họa đã nằm trong thông tin quyền lợi của hợp đồng. Phụ lục này không tự thay đổi số liệu nghiệp vụ trong ứng dụng.'] },
            { title: 'Phạm vi áp dụng', paragraphs: ['Chỉ gắn với hợp đồng và khách hàng đã nêu, không dùng cho khách khác.', 'Giữ nguyên các nội dung mô phỏng khác của hợp đồng gốc. Không dùng làm chứng từ, hợp đồng hoặc căn cứ chi trả thực tế.', 'KHÔNG CÓ GIÁ TRỊ PHÁP LÝ - KHÔNG KÝ.'] },
          ] } }] });
      }
    }
    if (matches.length) { result.policiesPreserved++; continue; }
    await tx.insurancePolicy.create({ data: { id, policyNumber: number, productId: product.id, customerId, status,
      premiumAmount: status === 'PENDING' ? null : String(premium), paymentFrequency: status === 'PENDING' ? null : 'MONTHLY',
      sumAssured: status === 'PENDING' ? null : String(sum), effectiveDate: effective ? new Date(effective) : null,
      expiryDate: expiry ? new Date(expiry) : null, nextDueDate: nextDue ? new Date(nextDue) : null,
      createdAt: new Date(fixedDate.getTime() - index * 86400000), benefitsSnapshot: {
        fixture: 'policies-v1', currency: 'VND', snapshotAsOf: '2026-10-31', insuranceTermYears: 20, premiumTermYears: 15,
        annualPremium: `${premium * 12}.00`, benefits: [
          { code: 'LIFE', name: 'Quyền lợi bảo vệ chính mô phỏng', amount: `${sum}.00`, unit: 'VND' },
          { code: 'ACCIDENT', name: 'Quyền lợi tai nạn mô phỏng', amount: `${sum / 2}.00`, unit: 'VND' },
          { code: 'HOSPITAL', name: 'Trợ cấp nằm viện mô phỏng', amount: '500000.00', unit: 'VND/ngày', maxDays: 30 },
        ], documents: { main: status === 'PENDING' ? null : { documentId: mainId, version: mainVersion, kind: 'POLICY' },
          terms: { documentId: term.id, version: termsVersion, kind: 'TERMS' }, endorsements },
      } } });
    await mark(id, 'InsurancePolicy', 'DEV_POLICY_CREATED'); result.policiesCreated++;
  }
  for (const plan of documents) {
    const document = await tx.document.findUnique({ where: { id: plan.id } });
    if (document && !await owned(plan.id, 'DEV_DOCUMENT_CREATED')) throw new Error('Reserved document conflict.');
    if (!document) {
      // For already-edited policies, never recreate removed bindings or ownership.
      if (plan.policyId) {
        const policy = await tx.insurancePolicy.findUniqueOrThrow({ where: { id: plan.policyId }, select: { customerId: true, productId: true, benefitsSnapshot: true } });
        if (policy.customerId !== plan.ownerCustomerId || policy.productId !== plan.productId
          || !JSON.stringify(policy.benefitsSnapshot).includes(plan.id)) continue;
      }
      await tx.document.create({ data: { id: plan.id, title: plan.title, productId: plan.productId,
        policyId: plan.policyId, ownerCustomerId: plan.ownerCustomerId, accessScope: plan.policyId ? 'PRIVATE_POLICY' : 'PUBLIC', createdAt: fixedDate } });
      await mark(plan.id, 'Document', 'DEV_DOCUMENT_CREATED'); result.documentsCreated++;
    }
    for (const definition of plan.versions) {
      const versionId = fixtureId(`${namespace}:version:${plan.id}:${definition.version}`);
      const existing = await tx.documentVersion.findUnique({ where: { documentId_versionNumber: { documentId: plan.id, versionNumber: definition.version } } });
      const bytes = await renderFixturePdf(definition.pdf);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const key = `dev-fixtures/policies-v1/${namespace.toLowerCase()}/${plan.id}/v${definition.version}.pdf`;
      if (existing && (existing.id !== versionId || existing.storageBucket !== storage.bucket || existing.storageObjectKey !== key || existing.checksumSha256 !== checksum)) throw new Error('Reserved version conflict.');
      if (await storage.ensure(key, bytes, checksum)) result.objectsCreated++;
      if (!existing) {
        await tx.documentVersion.create({ data: { id: versionId, documentId: plan.id, versionNumber: definition.version,
          storageBucket: storage.bucket, storageObjectKey: key, checksumSha256: checksum, createdAt: fixedDate } });
        result.versionsCreated++;
      }
    }
    if (!document) await tx.document.update({ where: { id: plan.id }, data: { currentVersion: plan.currentVersion } });
  }
  return result;
}
