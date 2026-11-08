import PDFDocument from 'pdfkit';
import { join } from 'node:path';

export type FixturePdf = { title: string; reference: string; version: string; sourceKind?: 'public-markdown'; sections: Array<{ title: string; paragraphs: string[] }> };

// Fixed dates and ordered content make retries produce exactly the same bytes.
// Fonts are copied into the seed image only; no generated PDFs are committed.
export async function renderFixturePdf(input: FixturePdf): Promise<Buffer> {
  const fonts = process.env.DEV_PDF_FONT_DIR ?? join(__dirname, 'assets');
  const pdf = new PDFDocument({ size: 'A4', margins: { top: 130, bottom: 70, left: 48, right: 48 }, autoFirstPage: false, compress: true, bufferPages: true,
    info: { Title: input.title, Author: 'AegisLife - Synthetic local fixture',
      Subject: input.sourceKind ? 'PUBLIC MARKDOWN DERIVATIVE - NOT ORIGINAL PDF - NEEDS HUMAN REVIEW' : 'HO SO MO PHONG - KHONG CO GIA TRI PHAP LY', CreationDate: new Date('2026-10-31T00:00:00Z'), ModDate: new Date('2026-10-31T00:00:00Z') } });
  pdf.registerFont('Body', join(fonts, 'lexend-400.ttf'));
  pdf.registerFont('Heading', join(fonts, 'lexend-700.ttf'));
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(Buffer.from(chunk)));
    pdf.on('error', reject); pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const section of input.sections) {
    pdf.addPage();
    pdf.font('Heading').fontSize(16).fillColor('#132d40').text(section.title, { width: 499, lineGap: 3 });
    pdf.moveDown(0.7);
    pdf.font('Body').fontSize(10).fillColor('#253c4d');
    for (const paragraph of section.paragraphs) {
      // PDFKit flows long paragraphs across pages; never truncate the Public terms.
      pdf.text(paragraph, { width: 499, lineGap: 3, paragraphGap: 10 });
    }
  }
  const pages = pdf.bufferedPageRange();
  for (let page = pages.start; page < pages.start + pages.count; page++) {
    pdf.switchToPage(page);
    pdf.save();
    pdf.rect(0, 0, pdf.page.width, 105).fill('#153448');
    pdf.font('Heading').fontSize(19).fillColor('#ffffff').text('AegisLife', 48, 24, { lineBreak: false });
    pdf.font('Body').fontSize(8).text(input.sourceKind ? 'ĐIỀU KHOẢN PUBLIC - BẢN DỰNG TỪ MARKDOWN' : 'HỒ SƠ BẢO HIỂM HOÀN TOÀN GIẢ LẬP', 48, 57, { lineBreak: false });
    pdf.text(`${input.reference} | ${input.version}`, 48, 77, { lineBreak: false });
    pdf.rect(48, 779, 499, 1).fill('#d8e2e8');
    pdf.font('Body').fontSize(7).fillColor('#526575').text(input.sourceKind
      ? 'BẢN DỰNG TỪ NGUỒN PUBLIC - KHÔNG PHẢI PDF GỐC - CHƯA DUYỆT NGHIỆP VỤ'
      : 'DỮ LIỆU HOÀN TOÀN GIẢ LẬP - KHÔNG CÓ GIÁ TRỊ PHÁP LÝ', 48, 790, { lineBreak: false });
    pdf.text(`Trang ${page + 1}/${pages.count}`, 48, 806, { lineBreak: false });
    pdf.restore();
  }
  pdf.end();
  return output;
}
