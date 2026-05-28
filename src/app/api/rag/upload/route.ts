import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const text = buffer.toString('utf-8');

    return NextResponse.json({
      success: true,
      documentId: 'test-doc-id-123',
      filename: file.name,
      textPreview: text.slice(0, 100),
      isTruncated: false,
      originalLength: text.length,
      extractedLength: text.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, step: 'fatal' }, { status: 500 });
  }
}
