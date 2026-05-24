const KIMI_API_KEY = process.env.KIMI_API_KEY!;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';

function buildPrompts(text: string, isPartial = false, isMerge = false) {
  const systemPrompt = `你是一位专业的文档分析助手。请严格基于原文内容进行总结，不编造、不扩展任何信息。

输出格式要求（必须使用中文）：
## 核心主题
（一句话概括文档核心主题）

## 主要观点
- 观点1
- 观点2
...

## 关键数据/结论
- 数据或结论1
- 数据或结论2
...

## 行动项（如有）
- 行动项1
- 行动项2
...

要求：简洁、客观、清晰。`;

  const userPrompt = isPartial
    ? `以下是文档的一部分内容，请对其进行结构化总结：\n\n${text}`
    : isMerge
    ? `以下是文档各部分的分段总结，请合并为一个完整、连贯的结构化总结：\n\n${text}`
    : `请对以下文档内容进行结构化总结：\n\n${text}`;

  return { systemPrompt, userPrompt };
}

export async function callKimiChat(messages: { role: string; content: string }[]) {
  const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'moonshot-v1-128k',
      messages,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function summarizeText(text: string): Promise<string> {
  const MAX_CHUNK = 80000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }

  if (chunks.length === 1) {
    const { systemPrompt, userPrompt } = buildPrompts(chunks[0]);
    return callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  const partialSummaries: string[] = [];
  for (const chunk of chunks) {
    const { systemPrompt, userPrompt } = buildPrompts(chunk, true);
    partialSummaries.push(await callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]));
  }

  const combined = partialSummaries.join('\n\n---\n\n');
  const { systemPrompt, userPrompt } = buildPrompts(combined, false, true);
  return callKimiChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}

// ===== Streaming Support =====

export async function* callKimiChatStream(messages: { role: string; content: string }[]) {
  const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'moonshot-v1-128k',
      messages,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error: ${res.status} ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) yield content;
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  // flush remaining buffer
  const trimmed = buffer.trim();
  if (trimmed.startsWith('data:')) {
    const data = trimmed.slice(5).trim();
    if (data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) yield content;
      } catch {}
    }
  }
}

export interface SummarizeStreamEvent {
  type: 'progress' | 'token' | 'error';
  stage?: string;
  current?: number;
  total?: number;
  text?: string;
  message?: string;
}

export async function* summarizeTextStream(text: string): AsyncGenerator<SummarizeStreamEvent> {
  const MAX_CHUNK = 80000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }

  if (chunks.length === 1) {
    const { systemPrompt, userPrompt } = buildPrompts(chunks[0]);
    for await (const token of callKimiChatStream([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])) {
      yield { type: 'token', text: token };
    }
    return;
  }

  const partialSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    yield { type: 'progress', stage: 'chunk', current: i + 1, total: chunks.length };
    const { systemPrompt, userPrompt } = buildPrompts(chunks[i], true);
    partialSummaries.push(await callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]));
  }

  yield { type: 'progress', stage: 'merge', current: 1, total: 1 };

  const combined = partialSummaries.join('\n\n---\n\n');
  const { systemPrompt, userPrompt } = buildPrompts(combined, false, true);
  for await (const token of callKimiChatStream([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])) {
    yield { type: 'token', text: token };
  }
}
