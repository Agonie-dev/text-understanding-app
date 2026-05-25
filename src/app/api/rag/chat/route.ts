import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { callKimiChatStream } from '@/lib/kimi';

const MAX_DOC_CHARS = 70000; // 预留空间给历史消息和 system prompt

export async function POST(req: NextRequest) {
  try {
    const { documentId, sessionId, message, stream = true } = await req.json();

    if (!documentId || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: '缺少 documentId 或 message' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. 获取文档
    const { data: doc, error: docErr } = await supabase
      .from('chat_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docErr || !doc) {
      return new Response(
        JSON.stringify({ error: '文档不存在' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. 确定会话
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      // 创建新会话
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert({ document_id: documentId, title: message.slice(0, 30) })
        .select()
        .single();
      activeSessionId = newSession?.id;
    }

    // 3. 获取历史消息（最近 10 条）
    const { data: historyMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', activeSessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    // 4. 保存用户消息
    await supabase.from('chat_messages').insert({
      session_id: activeSessionId,
      role: 'user',
      content: message.trim(),
    });

    // 5. 截断文档文本
    const docText = doc.extracted_text.slice(0, MAX_DOC_CHARS);

    // 6. 构建 messages
    const systemPrompt = `你是一个专业的文档问答助手。请严格基于以下文档内容回答用户的问题，不要编造文档中没有的信息。

如果用户的问题与文档内容无关，请礼貌地告知用户你无法回答。

文档内容：
---
${docText}
---`;

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 加入历史消息
    if (historyMessages && historyMessages.length > 0) {
      messages.push(...historyMessages.slice(-10));
    }

    messages.push({ role: 'user', content: message.trim() });

    // 7. 流式返回
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          let fullResponse = '';

          try {
            for await (const token of callKimiChatStream(messages)) {
              fullResponse += token;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`));
            }

            // 保存助手回复
            await supabase.from('chat_messages').insert({
              session_id: activeSessionId,
              role: 'assistant',
              content: fullResponse,
            });

            // 更新会话时间
            await supabase
              .from('chat_sessions')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', activeSessionId);

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          } catch (err: any) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // 非流式（fallback）
    return new Response(
      JSON.stringify({ error: '仅支持流式模式' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('RAG chat error:', err);
    return new Response(
      JSON.stringify({ error: err.message || '问答失败' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
