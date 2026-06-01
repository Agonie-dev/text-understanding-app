import { NextRequest, NextResponse } from 'next/server';
import { summarizeText, summarizeTextStream, SummaryStyle } from '@/lib/kimi';
import { generateSummaryDocx } from '@/lib/docxGenerator';
import { supabase } from '@/lib/supabase';
import { checkAndConsumeQuota } from '@/lib/quota';
import { isAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { text, filename, stream, style, visitorId } = await req.json();

    if (!text || text.length < 10) {
      return NextResponse.json({ error: '文本内容太短，无法总结' }, { status: 400 });
    }

    // 游客配额检查（管理员跳过）
    const admin = await isAdmin(req);
    if (!admin) {
      const quota = await checkAndConsumeQuota(visitorId || 'unknown', 'summary');
      if (!quota.allowed) {
        return NextResponse.json({ error: quota.message, code: 'QUOTA_EXCEEDED' }, { status: 429 });
      }
    }

    const summaryStyle: SummaryStyle = style || 'default';

    // Non-streaming fallback
    if (!stream) {
      const recordRes = await supabase
        .from('history')
        .insert({
          filename: filename || '未命名文件',
          file_size: 0,
          file_type: 'text/summary',
          operation_type: 'summarize',
          status: 'processing',
        })
        .select()
        .single();

      const recordId = recordRes.data?.id;

      const summary = await summarizeText(text, summaryStyle);

      const docxBuffer = await generateSummaryDocx(summary);
      const docxBase64 = docxBuffer.toString('base64');

      await supabase
        .from('history')
        .update({
          status: 'completed',
          summary_text: summary,
          result_url: docxBase64,
        })
        .eq('id', recordId);

      return NextResponse.json({
        success: true,
        summary,
        docxBase64,
        recordId,
      });
    }

    // Streaming mode
    const encoder = new TextEncoder();
    let recordId: string | undefined;

    const readable = new ReadableStream({
      async start(controller) {
        let aborted = false;

        const send = (data: object) => {
          if (aborted) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            aborted = true;
            try { controller.close(); } catch {}
          }
        };

        req.signal.addEventListener('abort', () => {
          aborted = true;
          try { controller.close(); } catch {}
        });

        try {
          const recordRes = await supabase
            .from('history')
            .insert({
              filename: filename || '未命名文件',
              file_size: 0,
              file_type: 'text/summary',
              operation_type: 'summarize',
              status: 'processing',
            })
            .select()
            .single();

          recordId = recordRes.data?.id;

          let fullSummary = '';

          for await (const event of summarizeTextStream(text, summaryStyle)) {
            if (aborted) break;
            if (event.type === 'token') {
              fullSummary += event.text;
            }
            send(event);
          }

          if (!aborted) {
            const docxBuffer = await generateSummaryDocx(fullSummary);
            const docxBase64 = docxBuffer.toString('base64');

            await supabase
              .from('history')
              .update({
                status: 'completed',
                summary_text: fullSummary,
                result_url: docxBase64,
              })
              .eq('id', recordId);

            send({ type: 'done', recordId });
          }

          controller.close();
        } catch (err: any) {
          console.error('Stream error:', err);
          if (!aborted) {
            send({ type: 'error', message: err.message || '总结失败' });
            controller.close();
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Summarize error:', err);
    return NextResponse.json({ error: err.message || '总结失败' }, { status: 500 });
  }
}
