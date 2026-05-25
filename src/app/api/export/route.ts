import { NextRequest, NextResponse } from 'next/server';
import { generateSummaryDocx } from '@/lib/docxGenerator';
import { generateSummaryPdf } from '@/lib/converter';

export async function POST(req: NextRequest) {
  try {
    const { summary, format = 'docx' } = await req.json();

    if (!summary) {
      return NextResponse.json({ error: '总结内容为空' }, { status: 400 });
    }

    if (format === 'pdf') {
      const buffer = await generateSummaryPdf(summary);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="summary.pdf"',
        },
      });
    }

    // default docx
    const buffer = await generateSummaryDocx(summary);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="summary.docx"',
      },
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: err.message || '导出失败' }, { status: 500 });
  }
}
