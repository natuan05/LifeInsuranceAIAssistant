import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FixturePdf } from './dev-policy-pdf';
import { hash, loadPublicCorpus, money, publicProducts, syntheticDataset, type PolicyOwner } from './dev-policy-source';

export const portfolioVersion = 2;
export const contractVersion = 'portfolio-v2.1';
const periods = { ANNUAL: 1, SEMI_ANNUAL: 2, QUARTERLY: 4, MONTHLY: 12 } as const;
export type PortfolioPolicy = {
  scenarioId: string; number: string; ownerSlot: number; productCode: string; termsPath: string; option: string; purpose: string;
  insured: { name: string; birth: string; relationToPolicyholder: 'SELF' | 'CHILD' };
  beneficiaries: Array<{ person: 'POLICYHOLDER' | 'OTHER'; name: string; relationshipToInsured: string; sharePercent: number }>;
  signedDate: string; issueDate: string; effectiveDate: string; deliveryDate: string; expiryDate: string; maturityAge: number;
  premiumTermYears: number; sumAssured: number; paymentFrequency: keyof typeof periods; premiumAmount: number;
  annualPremium: number; nextDueDate: string; paidDueDates: string[]; riders: string[];
};
export type PolicyPortfolio = { version: number; synthetic: boolean; asOfDate: string; pricingValidated: boolean;
  commercialCompatibilityValidated: boolean; policies: PortfolioPolicy[] };

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validatePortfolio(portfolio: PolicyPortfolio, corpus = loadPublicCorpus()) {
  if (portfolio.version !== portfolioVersion || portfolio.synthetic !== true || !validDate(portfolio.asOfDate)
    || portfolio.pricingValidated !== false || portfolio.commercialCompatibilityValidated !== false || !portfolio.policies.length) throw new Error('Invalid synthetic portfolio metadata.');
  const numbers = new Set<string>(), scenarios = new Set<string>(), exposures = new Set<string>();
  for (const p of portfolio.policies) {
    const source = corpus.find(item => item.output_markdown === p.termsPath);
    const product = publicProducts.find(item => item.code === p.productCode);
    const dateFields = [p.insured.birth, p.signedDate, p.issueDate, p.effectiveDate, p.deliveryDate, p.expiryDate, p.nextDueDate, ...p.paidDueDates];
    const exposure = `${p.ownerSlot}:${p.productCode}:${p.insured.name}:${p.insured.birth}`;
    const anniversary = `${Number(p.insured.birth.slice(0, 4)) + p.maturityAge}${p.insured.birth.slice(4)}`;
    const months = 12 / periods[p.paymentFrequency];
    const dueIndex = (date: string) => (Number(date.slice(0, 4)) - Number(p.effectiveDate.slice(0, 4))) * 12
      + Number(date.slice(5, 7)) - Number(p.effectiveDate.slice(5, 7));
    if (!source || !product || product.kind !== 'Sản phẩm chính' || source.product.code !== p.productCode
      || source.document_kind !== 'terms_and_conditions' || ![0, 1].includes(p.ownerSlot)
      || !/^BH-\d{4}-\d{5}$/.test(p.number) || numbers.has(p.number) || scenarios.has(p.scenarioId) || exposures.has(exposure)
      || !p.scenarioId || !p.purpose || !p.insured.name || !['SELF', 'CHILD'].includes(p.insured.relationToPolicyholder)
      || dateFields.some(date => !validDate(date)) || p.insured.birth >= p.effectiveDate
      || p.signedDate > p.issueDate || p.issueDate > p.deliveryDate || p.issueDate !== p.effectiveDate
      || p.effectiveDate > portfolio.asOfDate || p.expiryDate !== anniversary || p.nextDueDate <= portfolio.asOfDate
      || p.expiryDate <= p.nextDueDate || p.maturityAge !== (p.productCode === 'PUB-HTHP-GTBV-V2' ? 100 : 99)
      || !Number.isInteger(p.premiumTermYears) || p.premiumTermYears <= 0
      || p.premiumTermYears > Number(p.expiryDate.slice(0, 4)) - Number(p.effectiveDate.slice(0, 4))
      || !Object.hasOwn(periods, p.paymentFrequency) || !Number.isSafeInteger(p.sumAssured) || p.sumAssured <= 0
      || !Number.isSafeInteger(p.premiumAmount) || p.premiumAmount <= 0 || p.annualPremium !== p.premiumAmount * periods[p.paymentFrequency]
      || p.riders.length !== 0 || !p.beneficiaries.length || p.beneficiaries.some(b => !b.name || b.sharePercent <= 0
        || !['POLICYHOLDER', 'OTHER'].includes(b.person)) || p.beneficiaries.reduce((total, row) => total + row.sharePercent, 0) !== 100
      || new Set(p.paidDueDates).size !== p.paidDueDates.length || p.paidDueDates.some((date, i) => date < p.effectiveDate
        || date > portfolio.asOfDate || dueIndex(date) % months !== 0 || date.slice(8) !== p.effectiveDate.slice(8)
        || (i > 0 && date <= p.paidDueDates[i - 1])) || dueIndex(p.nextDueDate) % months !== 0
      || p.nextDueDate.slice(8) !== p.effectiveDate.slice(8)) throw new Error(`Invalid policy scenario: ${p.scenarioId}.`);
    if (p.productCode === 'PUB-XANH-UOC-MO' && (!p.termsPath.endsWith('/Full-TnC-UL049.md') || !p.option.includes('UL049'))) throw new Error('Xanh Uoc Mo must bind its explicit UL049 option.');
    numbers.add(p.number); scenarios.add(p.scenarioId); exposures.add(exposure);
  }
}

export function loadPolicyPortfolio() {
  const root = process.env.DEV_POLICY_DATA_DIR ?? resolve(__dirname, '../../../../data');
  const directory = resolve(root, 'synthetic', syntheticDataset);
  const raw = readFileSync(resolve(directory, 'policies.json'));
  const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8')) as { files: Array<{ path: string; sha256: string }> };
  if (hash(raw) !== manifest.files.find(file => file.path === 'policies.json')?.sha256) throw new Error('Portfolio checksum mismatch.');
  const portfolio = JSON.parse(raw.toString('utf8')) as PolicyPortfolio;
  validatePortfolio(portfolio);
  return { portfolio, sourceChecksum: hash(raw) };
}

export function policyParties(p: PortfolioPolicy, owner: PolicyOwner) {
  return {
    policyholder: { name: owner.fullName, accountCode: owner.accountCode },
    insured: { ...p.insured, name: p.insured.relationToPolicyholder === 'SELF' ? owner.fullName : p.insured.name },
    beneficiaries: p.beneficiaries.map(row => ({ ...row, name: row.person === 'POLICYHOLDER' ? owner.fullName : row.name })),
  };
}

export function portfolioContractPdf(portfolio: PolicyPortfolio, p: PortfolioPolicy, owner: PolicyOwner, number: string): FixturePdf {
  const product = publicProducts.find(row => row.code === p.productCode)!;
  const parties = policyParties(p, owner);
  const terms = loadPublicCorpus().find(row => row.output_markdown === p.termsPath)!;
  const total = p.paidDueDates.length * p.premiumAmount;
  const frequency = { ANNUAL: 'Hàng năm', SEMI_ANNUAL: 'Nửa năm', QUARTERLY: 'Hàng quý', MONTHLY: 'Hàng tháng' }[p.paymentFrequency];
  return { title: `Hợp đồng bảo hiểm - ${owner.fullName} - ${product.name} - ${number}`, reference: number, version: contractVersion, sections: [
    { title: 'Giấy chứng nhận và thông tin hợp đồng', paragraphs: [
      `Số hợp đồng: ${number}. Sản phẩm chính: ${product.name} (${p.productCode}). Lựa chọn: ${p.option}.`,
      `Bên mua bảo hiểm: ${owner.fullName}. Mã khách hàng: ${owner.accountCode}. Người được bảo hiểm: ${parties.insured.name}, sinh ngày ${p.insured.birth}.`,
      `Mục đích tham gia trong kịch bản: ${p.purpose}`,
      `Trạng thái hồ sơ giả lập tại ${portfolio.asOfDate}: Có hiệu lực.`,
      'Hồ sơ và toàn bộ dữ liệu cá nhân, số tiền, lịch thu được viết mới để phát triển ứng dụng; không phải hợp đồng do Manulife phát hành, báo giá, xác nhận thẩm định hoặc giao dịch thật. Không có hiệu lực pháp lý.',
    ] },
    { title: 'Các bên tham gia và người thụ hưởng', paragraphs: [
      `Bên mua: ${parties.policyholder.name}. Mã tài khoản chủ sở hữu: ${parties.policyholder.accountCode}.`,
      `Người được bảo hiểm chính: ${parties.insured.name}. Ngày sinh: ${parties.insured.birth}. Quan hệ với bên mua: ${p.insured.relationToPolicyholder === 'SELF' ? 'Bản thân' : 'Con'}.`,
      ...parties.beneficiaries.map(row => `Người thụ hưởng theo chỉ định giả lập: ${row.name}; quan hệ với người được bảo hiểm: ${row.relationshipToInsured}; tỷ lệ ${row.sharePercent}%.`),
      'Bên mua, người được bảo hiểm và người thụ hưởng là các vai trò riêng. Quyền sở hữu hợp đồng không tự chuyển cho người có cùng tên hoặc quan hệ gia đình.',
      'Không có hồ sơ sức khỏe, giấy tờ định danh thật hoặc bằng chứng thẩm định trong bộ dữ liệu này.',
    ] },
    { title: 'Thời hạn và kế hoạch đóng phí', paragraphs: [
      `Ngày ký theo kịch bản: ${p.signedDate}. Ngày cấp và hiệu lực: ${p.effectiveDate}. Ngày bàn giao: ${p.deliveryDate}.`,
      `Ngày đáo hạn của kịch bản: ${p.expiryDate}. Thời hạn từ ngày hiệu lực: ${Number(p.expiryDate.slice(0, 4)) - Number(p.effectiveDate.slice(0, 4))} năm. Thời hạn đóng phí dự kiến: ${p.premiumTermYears} năm.`,
      `Định kỳ đóng phí: ${frequency}. Phí mỗi kỳ: ${money(p.premiumAmount)}. Phí quy năm: ${money(p.annualPremium)}.`,
      `Kỳ phí tiếp theo tại mốc dữ liệu: ${p.nextDueDate}, số tiền kế hoạch ${money(p.premiumAmount)}. Không tự suy từ kỳ phí rằng có giao dịch đã thanh toán thật.`,
      'Phí và số tiền bảo hiểm là giá trị giả lập, không được tính từ biểu phí thương mại. Thời hạn đóng phí dự kiến không phải thời hạn bảo hiểm và không chứng minh điều kiện duy trì hiệu lực đã được đáp ứng.',
    ] },
    { title: 'Quyền lợi và phạm vi áp dụng', paragraphs: [
      `Số tiền bảo hiểm chính được chọn trong hồ sơ giả lập: ${money(p.sumAssured)}. Người được bảo hiểm: ${parties.insured.name}.`,
      'Không có sản phẩm bổ trợ trong hồ sơ này. Danh sách bổ trợ của kịch bản đã được khai báo đầy đủ; việc có sản phẩm bổ trợ trong catalog không có nghĩa khách đã tham gia.',
      'Các quyền lợi, điều kiện, loại trừ, phí khấu trừ và cơ chế tài khoản phải đọc theo đúng bộ quy tắc gắn kèm. Không dùng số tiền bảo hiểm như khoản chi trả đã được phê duyệt; không ghép điều khoản của sản phẩm hay lựa chọn khác.',
      `Bản quy tắc áp dụng: ${terms.document_title}. Tài liệu thuộc đúng ${product.name}; checksum nguồn ${terms.output_sha256}.`,
    ] },
    { title: 'Lịch thu giả lập và dữ liệu chưa xác định', paragraphs: [
      ...p.paidDueDates.map((date, i) => `Biên nhận giả lập ${number}-PT${String(i + 1).padStart(2, '0')}: kỳ đến hạn ${date}, ngày ghi nhận ${date}, số tiền ${money(p.premiumAmount)}.`),
      `Tổng tiền theo ${p.paidDueDates.length} biên nhận giả lập: ${money(total)}. Không có biên nhận ngân hàng hoặc giao dịch tài chính thật.`,
      'Giá trị tài khoản, giá trị hoàn lại, nợ và số tiền giải quyết quyền lợi: chưa xác định. Tổng phí đã ghi nhận không phải giá trị tài khoản hoặc giá trị hoàn lại của hợp đồng.',
      `Các thông tin trên là snapshot tại ${portfolio.asOfDate}; không phải xác nhận số dư hoặc hiệu lực tại thời điểm đọc sau này.`,
    ] },
    { title: 'Bộ tài liệu áp dụng và xác nhận', paragraphs: [
      `1. Giấy chứng nhận và hồ sơ hợp đồng ${number}, phiên bản ${contractVersion}, thuộc riêng ${owner.fullName}.`,
      `2. Quy tắc và điều khoản: ${terms.document_title}. Tài liệu nguồn được chọn tường minh, không tự thay bằng bản hiện hành của sản phẩm khác.`,
      'PDF quy tắc được dựng lại từ Markdown Public, không phải PDF gốc của doanh nghiệp bảo hiểm; bản trích chưa được người duyệt nghiệp vụ xác nhận. Các mốc trang nguồn được giữ để đối chiếu.',
      'Không có phụ lục thay đổi, sản phẩm bổ trợ hoặc chữ ký được giả tạo. Khi vận hành thực tế, hồ sơ phát hành, biểu phí, điều kiện tham gia và chứng cứ ký phải đến từ quy trình được doanh nghiệp duyệt; seed không thay quy trình đó.',
      'KHÔNG KÝ - DỮ LIỆU GIẢ LẬP - KHÔNG CÓ GIÁ TRỊ PHÁP LÝ.',
    ] },
  ] };
}
