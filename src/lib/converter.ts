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

interface ContentItem {
  type: 'text' | 'image';
  value: string;
  contentType?: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function parseHtmlToItems(html: string): ContentItem[] {
  const items: ContentItem[] = [];
  
  let content = html
    .replace(/<\/?(html|body)[^>]*>/gi, '')
    .trim();
  
  if (!content) return items;
  
  // 匹配所有内嵌 base64 图片（匹配完整标签到 >）
  const imgRegex = /<img\s+[^>]*src="data:([^;]+);base64,([^"]+)"[^>]*>/gi;
  let lastIndex = 0;
  let match;
  
  while ((match = imgRegex.exec(content)) !== null) {
    // 图片前的文本
    const textContent = content.substring(lastIndex, match.index);
    const text = decodeHtmlEntities(
      textContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
    );
    
    if (text.trim()) {
      items.push({ type: 'text', value: text.trim() });
    }
    
    // 图片
    items.push({
      type: 'image',
      value: match[2],
      contentType: match[1],
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // 最后一段剩余文本
  const remainingText = content.substring(lastIndex);
  const text = decodeHtmlEntities(
    remainingText
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s*\/>/g, '')
      .trim()
      .replace(/\s*\/>/g, '')
      .trim()
  );
  
  if (text.trim()) {
    items.push({ type: 'text', value: text.trim() });
  }
  
  return items;
}

export async function convertWordToPdf(buffer: Buffer): Promise<Buffer> {
  setupPdfkitEnv();
  
  // 用 convertToHtml 保留图片信息（extractRawText 会丢失图片）
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const imageBuffer = await image.read("base64");
        return {
          src: `data:${image.contentType};base64,${imageBuffer}`
        };
      })
    }
  );
  
  const items = parseHtmlToItems(result.value);
  
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ font: '' });
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // 注册中文字体
    doc.registerFont('unifont', getFontPath());
    doc.font('unifont').fontSize(12);
    
    const margin = 72;
    const maxWidth = 612 - margin * 2;
    const pageHeight = 792;
    
    for (const item of items) {
      if (item.type === 'text') {
        // 接近页底时先分页
        if (doc.y > pageHeight - margin - 20) {
          doc.addPage();
          doc.font('unifont').fontSize(12);
        }
        
        doc.text(item.value, margin, doc.y, {
          width: maxWidth,
          align: 'left',
          lineGap: 6,
        });
        doc.y += 6; // 段后间距
      } else if (item.type === 'image') {
        try {
          const imgBuffer = Buffer.from(item.value, 'base64');
          // @ts-ignore: pdfkit 类型定义不完整，运行时存在 openImage 方法
          const img = doc.openImage(imgBuffer);
          
          // 限制图片宽度，等比缩放
          const scale = Math.min(1, maxWidth / img.width);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          
          // 图片放不下的情况下先分页
          if (doc.y + scaledHeight > pageHeight - margin) {
            doc.addPage();
            doc.font('unifont').fontSize(12);
          }
          
          doc.image(imgBuffer, margin, doc.y, { width: scaledWidth });
          doc.y += scaledHeight + 12; // 图片后间距
        } catch (e) {
          console.error('Image render error:', e);
          // 图片渲染失败时跳过，不影响后续内容
        }
      }
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

export async function generateSummaryPdf(summaryText: string): Promise<Buffer> {
  setupPdfkitEnv();

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ font: '' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('unifont', getFontPath());

    const margin = 72;
    const maxWidth = 612 - margin * 2;
    const pageHeight = 792;

    const lines = summaryText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        doc.y += 8;
        continue;
      }

      // 自动分页
      if (doc.y > pageHeight - margin - 40) {
        doc.addPage();
      }

      if (trimmed.startsWith('## ')) {
        doc.font('unifont').fontSize(16);
        doc.text(trimmed.replace('## ', ''), margin, doc.y, {
          width: maxWidth,
          align: 'left',
        });
        doc.y += 10;
      } else if (trimmed.startsWith('# ')) {
        doc.font('unifont').fontSize(20);
        doc.text(trimmed.replace('# ', ''), margin, doc.y, {
          width: maxWidth,
          align: 'left',
        });
        doc.y += 14;
      } else if (trimmed.startsWith('- ')) {
        doc.font('unifont').fontSize(12);
        doc.text('• ' + trimmed.replace('- ', ''), margin + 12, doc.y, {
          width: maxWidth - 12,
          align: 'left',
          lineGap: 4,
        });
        doc.y += 4;
      } else {
        doc.font('unifont').fontSize(12);
        doc.text(trimmed, margin, doc.y, {
          width: maxWidth,
          align: 'left',
          lineGap: 4,
        });
        doc.y += 4;
      }
    }

    doc.end();
  });
}

export async function generateTextToDocx(text: string): Promise<Buffer> {
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

export async function generateTextToHtml(text: string, title?: string): Promise<Buffer> {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const body = escaped
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t.startsWith('## ')) return `<h2>${t.replace('## ', '')}</h2>`;
      if (t.startsWith('# ')) return `<h1>${t.replace('# ', '')}</h1>`;
      if (t.startsWith('- ')) return `<li>${t.replace('- ', '')}</li>`;
      if (!t) return '';
      return `<p>${t}</p>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title || '转换结果'}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#333}
h1{font-size:1.5rem;font-weight:700;margin:1.5rem 0 .5rem;color:#1a1a1a}
h2{font-size:1.25rem;font-weight:700;margin:1.25rem 0 .5rem;color:#2d2d2d}
ul{margin:.5rem 0;padding-left:1.5rem}
li{margin:.25rem 0}
p{margin:.5rem 0}
</style>
</head>
<body>
${body}
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

export function generateTextToMarkdown(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

export function generateTextToTxt(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}
