import mammoth from 'mammoth';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Document, Paragraph, TextRun, Packer } from 'docx';
import * as fs from 'fs';
import * as path from 'path';

let cjkFontCache: Uint8Array | null = null;

function getCjkFontBytes(): Uint8Array {
  if (!cjkFontCache) {
    const fontPath = path.join(process.cwd(), 'public', 'NotoSansSC-Regular.otf');
    cjkFontCache = fs.readFileSync(fontPath);
  }
  return cjkFontCache;
}

export async function convertWordToPdf(buffer: Buffer): Promise<Buffer> {
  const { value: text } = await mammoth.extractRawText({ buffer });
  const pdfDoc = await PDFDocument.create();
  
  // 注册 fontkit 以支持自定义字体嵌入
  pdfDoc.registerFontkit(fontkit);
  
  // 嵌入中文字体，替代不支持中文的 Helvetica
  const fontBytes = getCjkFontBytes();
  const font = await pdfDoc.embedFont(fontBytes);
  
  const fontSize = 12;
  const lineHeight = fontSize * 1.5;
  const margin = 50;
  const pageWidth = 612;
  const pageHeight = 792;
  const maxWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      y -= lineHeight;
      continue;
    }

    const words = line.split('');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine + word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && currentLine) {
        page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }

    if (y < margin + lineHeight) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  return Buffer.from(await pdfDoc.save());
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
