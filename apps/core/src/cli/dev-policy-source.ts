import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { FixturePdf } from './dev-policy-pdf';

export const syntheticDataset = 'manulife-demo-v1';
export const policyFixture = 'synthetic-manulife-v1';
export const syntheticProductCode = 'PUB-HTHP-GTBV-V2';
export const publicPdfVersion = 'public-text-v2';
export const publicProducts = [
  { folder: 'XanhPhuQuy', code: 'PUB-XANH-PHU-QUY', name: 'Xanh Phú Quý', kind: 'Sản phẩm chính' },
  { folder: 'XanhTuongLai', code: 'PUB-XANH-TUONG-LAI', name: 'Xanh Tương Lai', kind: 'Sản phẩm chính' },
  { folder: 'XanhUocMo', code: 'PUB-XANH-UOC-MO', name: 'Xanh Ước Mơ', kind: 'Sản phẩm chính' },
  { folder: 'HanhTrinhHanhPhuc_GiaTangBaoVe', code: syntheticProductCode, name: 'Hành Trình Hạnh Phúc – Gia Tăng Bảo Vệ', kind: 'Sản phẩm chính' },
  { folder: 'DuPhongXanh', code: 'PUB-DU-PHONG-XANH', name: 'Dự Phòng Xanh', kind: 'Sản phẩm bổ trợ' },
  { folder: 'HoVeXanh', code: 'PUB-HO-VE-XANH', name: 'Hộ Vệ Xanh', kind: 'Sản phẩm bổ trợ' },
  { folder: 'LaChanXanh', code: 'PUB-LA-CHAN-XANH', name: 'Lá Chắn Xanh', kind: 'Sản phẩm bổ trợ' },
] as const;
export const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} VND`;

export function loadPublicCorpus() {
  const root = process.env.DEV_POLICY_DATA_DIR ?? resolve(__dirname, '../../../../data');
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest-manulife-text.json'), 'utf8')) as {
    sources: Array<{ output_markdown: string; output_sha256: string; document_title: string; document_kind: string }> };
  if (manifest.sources.length !== 13) throw new Error('Expected the reviewed 13-document Public corpus.');
  return manifest.sources.map(source => {
    const path = resolve(root, '..', source.output_markdown);
    if (relative(resolve(root, 'public/manulife/text'), path).startsWith('..') || !path.endsWith('.md')) throw new Error('Invalid Public source path.');
    const markdown = readFileSync(path, 'utf8');
    const product = publicProducts.find(row => source.output_markdown.includes(`/text/${row.folder}/`));
    if (!product || hash(markdown) !== source.output_sha256) throw new Error('Public source checksum/product mismatch.');
    return { ...source, markdown, product };
  });
}

export type PolicyOwner = { id: string; accountCode: string; fullName: string };

// Preserve merged HTML table cells as explicitly labelled column/value records.
// Do not print raw HTML or guess a new association between numeric cells.
function htmlTables(markdown: string) {
  const plain = (value: string) => value.replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
  return markdown.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, html: string) => {
    const grid: string[][] = []; const headerRows: number[] = [];
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] ??= []; let column = 0;
      const cells = [...row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
      if (cells.some(cell => cell[1].toLowerCase() === 'th')) headerRows.push(rowIndex);
      for (const cell of cells) {
        while (grid[rowIndex][column] !== undefined) column++;
        const rowspan = Number(cell[2].match(/rowspan=["']?(\d+)/i)?.[1] ?? 1);
        const colspan = Number(cell[2].match(/colspan=["']?(\d+)/i)?.[1] ?? 1);
        if (rowspan > 100 || colspan > 30) throw new Error('Unsupported Public table span.');
        for (let r = rowIndex; r < rowIndex + rowspan; r++) {
          grid[r] ??= [];
          for (let c = column; c < column + colspan; c++) grid[r][c] = plain(cell[3]);
        }
        column += colspan;
      }
    });
    return '\n\n' + grid.filter((_, i) => !headerRows.includes(i)).map(row => row.map((cell, column) => {
      const label = [...new Set(headerRows.map(i => grid[i][column]).filter(Boolean))].join(' / ') || `Cột ${column + 1}`;
      return `${label}: ${cell || '(trống)'}`;
    }).join(' | ')).join('\n\n') + '\n\n';
  });
}

export function publicTermsPdf(terms: string, title = 'Quy tắc và điều khoản - Hành Trình Hạnh Phúc - Gia Tăng Bảo Vệ', reference: string = syntheticProductCode): FixturePdf {
  const content = htmlTables(terms.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  const sections: FixturePdf['sections'] = [];
  let current = { title: 'Nguồn và giới hạn bản dựng', paragraphs: [
    'Bản dựng lại từ Markdown Public, không phải PDF gốc do doanh nghiệp phát hành. Mốc trang nguồn được giữ trong nội dung; trang PDF bản dựng có thể khác. Chưa được người duyệt nghiệp vụ xác nhận.',
  ] };
  let headers: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/<a\s+[^>]*><\/a>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim();
    if (!line) { headers = []; continue; }
    if (/^## Trang PDF \d+/.test(line)) {
      sections.push(current); current = { title: line.replace(/^## /, 'Mốc nguồn: '), paragraphs: [] }; headers = []; continue;
    }
    if (/^\|[\s:|-]+\|$/.test(line)) continue;
    if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      if (!headers.length) { headers = cells; continue; }
      current.paragraphs.push(cells.map((cell, i) => `${headers[i] || `Cột ${i + 1}`}: ${cell || '(trống)'}`).join(' | '));
    } else { headers = []; current.paragraphs.push(line.replace(/^#{1,6}\s*/, '')); }
  }
  sections.push(current);
  return { title, reference, version: publicPdfVersion, sourceKind: 'public-markdown', sections };
}
