import PDFDocument from 'pdfkit';
import { join } from 'node:path';

export type FixturePdf = { title: string; reference: string; version: string; sections: Array<{ title: string; paragraphs: string[] }> };

// Fixed dates and ordered content make retries produce exactly the same bytes.
// Fonts are copied into the seed image only; no generated PDFs are committed.
export async function renderFixturePdf(input: FixturePdf): Promise<Buffer> {
  const fonts = process.env.DEV_PDF_FONT_DIR ?? join(__dirname, 'assets');
  const pdf = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: false, compress: true,
    info: { Title: input.title, Author: 'AegisLife - Synthetic local fixture',
      Subject: 'HO SO MO PHONG - KHONG CO GIA TRI PHAP LY', CreationDate: new Date('2026-10-31T00:00:00Z'), ModDate: new Date('2026-10-31T00:00:00Z') } });
  pdf.registerFont('Body', join(fonts, 'lexend-400.ttf'));
  pdf.registerFont('Heading', join(fonts, 'lexend-700.ttf'));
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', chunk => chunks.push(Buffer.from(chunk)));
    pdf.on('error', reject); pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  input.sections.forEach((section, index) => {
    pdf.addPage();
    pdf.rect(0, 0, pdf.page.width, 116).fill('#153448');
    pdf.font('Heading').fontSize(21).fillColor('#ffffff').text('AegisLife', 48, 30);
    pdf.font('Body').fontSize(9).text('HỒ SƠ BẢO HIỂM MÔ PHỎNG', 48, 66);
    pdf.text(`${input.reference}  |  v${input.version}`, 48, 86, { width: 499 });
    pdf.font('Heading').fontSize(17).fillColor('#132d40').text(section.title, 48, 146, { width: 499 });
    pdf.moveDown(0.9);
    pdf.font('Body').fontSize(11).fillColor('#253c4d');
    for (const paragraph of section.paragraphs) {
      pdf.text(paragraph, { width: 499, lineGap: 5, paragraphGap: 12 });
      if (pdf.y > 730) throw new Error('Synthetic PDF layout exceeds its page.');
    }
    pdf.rect(48, 752, 499, 1).fill('#d8e2e8');
    pdf.font('Body').fontSize(8).fillColor('#526575').text('DỮ LIỆU HOÀN TOÀN GIẢ LẬP - KHÔNG CÓ GIÁ TRỊ PHÁP LÝ', 48, 768, { width: 499 });
    pdf.text(`Bootstrap local  |  Trang ${index + 1}/${input.sections.length}`, 48, 780, { width: 499 });
  });
  pdf.end();
  return output;
}
