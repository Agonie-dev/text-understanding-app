import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Paragraph, TextRun, Packer } from 'docx';

export async function convertWordToPdf(buffer: Buffer): Promise<Buffer> {
  const { value: text } = await mammoth.extractRawText({ buffer });
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
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
  const pdfParseMod = await import('pdf-parse');
  const pdfParse = (pdfParseMod as any).default || pdfParseMod;
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
