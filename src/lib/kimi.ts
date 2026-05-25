const KIMI_API_KEY = process.env.KIMI_API_KEY!;
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';

export type SummaryStyle = 'default' | 'academic' | 'meeting' | 'news' | 'minimal';

const STYLE_PROMPTS: Record<SummaryStyle, { system: string; mergeHint: string }> = {
  default: {
    system: `你是一位专业的文档分析助手。请严格基于原文内容进行总结，不编造、不扩展任何信息。

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

要求：简洁、客观、清晰。`,
    mergeHint: '合并为一个完整、连贯的结构化总结',
  },
  academic: {
    system: `你是一位学术文献分析专家。请严格基于原文内容进行分析，不编造、不扩展任何信息。

输出格式要求（必须使用中文，保持学术严谨性）：
## 研究背景
（简述研究背景与动机）

## 研究方法
- 方法1
- 方法2
...

## 核心发现/结果
- 发现1
- 发现2
...

## 结论与意义
（总结核心结论及学术/实践意义）

## 局限与展望（如有）
- 局限1
- 未来方向1
...

要求：术语准确、逻辑严密、数据完整引用。`,
    mergeHint: '合并为一个完整、连贯的学术文献综述',
  },
  meeting: {
    system: `你是一位专业的会议纪要整理专家。请严格基于原文内容提炼，不编造、不扩展任何信息。

输出格式要求（必须使用中文，保持会议纪要的正式性）：
## 会议核心议题
（一句话概括本次会议核心内容）

## 关键讨论要点
- 要点1
- 要点2
...

## 决议/共识
- 决议1
- 决议2
...

## 行动项
| 事项 | 负责人 | 截止时间 |
|------|--------|----------|
| 行动项1 | （如有提及） | （如有提及） |
| 行动项2 | （如有提及） | （如有提及） |

## 待跟进问题（如有）
- 问题1
- 问题2
...

要求：条理清晰、责任明确、时间具体。`,
    mergeHint: '合并为一个完整、连贯的会议纪要',
  },
  news: {
    system: `你是一位资深新闻编辑。请严格基于原文内容进行摘要，不编造、不扩展任何信息。

输出格式要求（必须使用中文，采用新闻摘要风格）：
## 新闻标题式概括
（用一句话概括核心事件，像新闻标题一样有力）

## 5W1H 关键信息
- **Who（谁）**：涉及的主要人物/机构
- **When（何时）**：关键时间节点
- **Where（何地）**：关键地点
- **What（何事）**：核心事件
- **Why（为何）**：原因/动机
- **How（如何）**：方式/过程

## 关键引述/数据
- 引述或数据1
- 引述或数据2
...

## 影响与后续
（事件的影响及可能的后续发展）

要求：客观中立、信息密度高、时效感强。`,
    mergeHint: '合并为一个完整、连贯的新闻报道摘要',
  },
  minimal: {
    system: `你是一位极简主义信息提炼专家。请严格基于原文内容，用最少文字传递最大信息量。

输出格式要求（必须使用中文，极度精简）：
## 一句话核心
（用不超过 50 字概括全文核心）

## 3 个关键要点
1. 要点1（一句话）
2. 要点2（一句话）
3. 要点3（一句话）

## 关键数据（如有）
- 数据1
- 数据2
...

要求：每个要点不超过 30 字、零废话、直击要害。`,
    mergeHint: '合并为一个极度精简的核心信息摘要',
  },
};

function buildPrompts(text: string, style: SummaryStyle = 'default', isPartial = false, isMerge = false) {
  const { system, mergeHint } = STYLE_PROMPTS[style];

  const userPrompt = isPartial
    ? `以下是文档的一部分内容，请对其进行结构化总结：\n\n${text}`
    : isMerge
    ? `以下是文档各部分的分段总结，请${mergeHint}：\n\n${text}`
    : `请对以下文档内容进行结构化总结：\n\n${text}`;

  return { systemPrompt: system, userPrompt };
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
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function summarizeText(text: string, style: SummaryStyle = 'default'): Promise<string> {
  const MAX_CHUNK = 80000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }

  if (chunks.length === 1) {
    const { systemPrompt, userPrompt } = buildPrompts(chunks[0], style);
    return callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }

  const partialSummaries: string[] = [];
  for (const chunk of chunks) {
    const { systemPrompt, userPrompt } = buildPrompts(chunk, style, true);
    partialSummaries.push(await callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]));
  }

  const combined = partialSummaries.join('\n\n---\n\n');
  const { systemPrompt, userPrompt } = buildPrompts(combined, style, false, true);
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
      temperature: 0.1,
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

export async function* summarizeTextStream(text: string, style: SummaryStyle = 'default'): AsyncGenerator<SummarizeStreamEvent> {
  const MAX_CHUNK = 80000;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }

  if (chunks.length === 1) {
    const { systemPrompt, userPrompt } = buildPrompts(chunks[0], style);
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
    const { systemPrompt, userPrompt } = buildPrompts(chunks[i], style, true);
    partialSummaries.push(await callKimiChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]));
  }

  yield { type: 'progress', stage: 'merge', current: 1, total: 1 };

  const combined = partialSummaries.join('\n\n---\n\n');
  const { systemPrompt, userPrompt } = buildPrompts(combined, style, false, true);
  for await (const token of callKimiChatStream([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])) {
    yield { type: 'token', text: token };
  }
}

// ===== File Upload & OCR =====

export async function uploadFileToKimi(buffer: Buffer, filename: string): Promise<string> {
  const blob = new Blob([new Uint8Array(buffer)]);
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('purpose', 'file-extract');

  const res = await fetch(`${KIMI_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi file upload error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.id;
}

export async function extractTextWithKimiOCR(fileId: string): Promise<string> {
  const res = await callKimiChat([
    {
      role: 'system',
      content: '你是一个专业的 OCR 文本提取助手。请提取这份文档中的全部文本内容，保留段落结构。如果是扫描件，请尽可能识别图片中的文字。直接输出原文，不要添加额外说明。',
    },
    {
      role: 'user',
      content: `请提取文件 ${fileId} 中的全部文本内容。`,
    },
  ]);
  return res;
}
