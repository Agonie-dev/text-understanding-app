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
  
  // 匹配所有内嵌 base64 图片
  const imgRegex = /<img\s+[^>]*src="data:([^;]+);base64,([^"]+)"/gi;
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
