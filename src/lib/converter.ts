import mammoth from 'mammoth';
import PDFDocument from 'pdfkit';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import * as fs from 'fs';
import * as path from 'path';

// pdfkit 在 serverless 环境中找不到内置字体数据文件，需要手动指定路径
const PDFKIT_DATA_DIR = path.join(process.cwd(), 'public', 'pdfkit-data');

function getFontPath(): string {
  return path.join(process.cwd(), 'public', 'unifont.otf');
}

function setupPdfkitEnv() {
  // 优先使用项目内复制的字体数据文件（serverless 环境）
  if (fs.existsSync(PDFKIT_DATA_DIR)) {
    process.env.PDFKIT_DATA = PDFKIT_DATA_DIR;
  }
}

export async function convertWordToPdf(buffer: Buffer): Promise<Buffer> {
  setupPdfkitEnv();
  
  const { value: text } = await mammoth.extractRawText({ buffer });
  
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ font: '' });
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // 注册中文字体
    doc.registerFont('unifont', getFontPath());
    doc.font('unifont').fontSize(12);
    
    const lines = text.split('\n');
    let y = 72; // 1 inch margin
    const lineHeight = 18;
    const margin = 72;
    const pageHeight = 792;
    
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        y += lineHeight;
        continue;
      }
      
      // 自动分页
      if (y > pageHeight - margin) {
        doc.addPage();
        doc.font('unifont').fontSize(12); // 新页面重新设置字体
        y = margin;
      }
      
      doc.text(line, margin, y, {
        width: 612 - margin * 2,
        align: 'left',
      });
      y += lineHeight;
    }
    
    doc.end();
  });
}

export async function convertPdfToWord(buffer: Buffer): Promise<Buffer> {
  // @ts-ignore: bypass pdf-parse index.js debug code
  const pdfParseModule: any = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = pdfParseModule.default || pdfParseModule;
  const parsed = await pdfParse(buffer);
  const text = parsed.text || '';

  const lines = text.split('\n').filter((l: string) => l.trim());
  const children: Paragraph[] = lines.map(
    (line: string) =>
      new Paragraph({
        children: [new TextRun({ text: line.trim(), size: 22 })],
        spacing: { after: 100 },
      })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
