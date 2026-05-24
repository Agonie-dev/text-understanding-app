'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type SummaryStyle = 'default' | 'academic' | 'meeting' | 'news' | 'minimal';

const STYLE_OPTIONS: { value: SummaryStyle; label: string; icon: string }[] = [
  { value: 'default', label: '标准', icon: '📝' },
  { value: 'academic', label: '学术', icon: '🎓' },
  { value: 'meeting', label: '会议纪要', icon: '📊' },
  { value: 'news', label: '新闻摘要', icon: '📰' },
  { value: 'minimal', label: '极简', icon: '⚡' },
];

interface SummaryPanelProps {
  text: string;
  filename: string;
  meta?: {
    isScanned: boolean;
    isTruncated: boolean;
    originalLength: number;
    cacheHit: boolean;
  };
}

interface StreamEvent {
  type: 'progress' | 'token' | 'error' | 'done';
  stage?: string;
  current?: number;
  total?: number;
  text?: string;
  message?: string;
  recordId?: string;
}

export default function SummaryPanel({ text, filename, meta }: SummaryPanelProps) {
  const [displaySummary, setDisplaySummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>('default');

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef('');
  const rafRef = useRef<number | null>(null);

  // Clear old summary when text or style changes
  useEffect(() => {
    setDisplaySummary('');
    setError('');
    setCharCount(0);
    setProgressStage('');
    pendingRef.current = '';
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [text, selectedStyle]);

  const flushDisplay = useCallback(() => {
    if (pendingRef.current) {
      const added = pendingRef.current;
      pendingRef.current = '';
      setDisplaySummary((prev) => prev + added);
      setCharCount((prev) => prev + added.length);
    }
    rafRef.current = null;
  }, []);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setProgressStage('');
  }, []);

  const handleSummarize = async () => {
    if (!text || text.length < 10) {
      setError('文本内容太短');
      return;
    }
    setLoading(true);
    setError('');
    setDisplaySummary('');
    setCharCount(0);
    setProgressStage('');

    // 强制清空残留
    pendingRef.current = '';
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename, stream: true, style: selectedStyle }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '请求失败');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;

          try {
            const event: StreamEvent = JSON.parse(dataStr);

            if (event.type === 'token' && event.text) {
              fullText += event.text;
              pendingRef.current += event.text;
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(flushDisplay);
              }
            } else if (event.type === 'progress') {
              setProgressStage(
                event.stage === 'chunk'
                  ? `正在处理第 ${event.current}/${event.total} 段...`
                  : '正在合并总结...'
              );
            } else if (event.type === 'error') {
              throw new Error(event.message || '生成出错');
            } else if (event.type === 'done') {
              setProgressStage('生成完成');
            }
          } catch (parseErr: any) {
            if (parseErr.message === '生成出错' || parseErr.message === '请求失败') {
              throw parseErr;
            }
            // ignore malformed SSE lines
          }
        }
      }

      // Ensure all pending text is flushed
      if (pendingRef.current) {
        setDisplaySummary((prev) => prev + pendingRef.current);
        setCharCount((prev) => prev + pendingRef.current.length);
        pendingRef.current = '';
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('生成已中断');
      } else {
        setError(err.message || '总结失败');
      }
    } finally {
      setLoading(false);
      setProgressStage('');
      abortRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
  };

  const downloadDocx = () => {
    if (!displaySummary) return;
    const blob = new Blob([displaySummary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^.]+$/, '') + '_总结.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderSummary = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        return <h3 key={idx} className="text-lg font-bold text-gray-800 mt-4 mb-2">{trimmed.replace('## ', '')}</h3>;
      }
      if (trimmed.startsWith('# ')) {
        return <h2 key={idx} className="text-xl font-bold text-gray-900 mt-5 mb-3">{trimmed.replace('# ', '')}</h2>;
      }
      if (trimmed.startsWith('- ')) {
        return <li key={idx} className="ml-4 text-gray-700 mb-1">{trimmed.replace('- ', '')}</li>;
      }
      if (!trimmed) return <br key={idx} />;
      return <p key={idx} className="text-gray-700 mb-2">{trimmed}</p>;
    });
  };

  return (
    <div className="w-full">
      {/* Meta hints */}
      {meta?.cacheHit && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          ⚡ 该文件 24 小时内已处理过，使用缓存结果
        </div>
      )}
      {meta?.isTruncated && (
        <div className="mb-3 p-2 bg-yellow-50 border border-yellow-100 rounded-lg text-sm text-yellow-700">
          ⚠️ 文档较长（共 {meta.originalLength.toLocaleString()} 字），已提取前 {text.length.toLocaleString()} 字核心内容进行总结
        </div>
      )}

      {/* Style selector */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-2">选择总结风格</p>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => !loading && setSelectedStyle(opt.value)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                selectedStyle === opt.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
              } disabled:opacity-50`}
            >
              <span className="mr-1">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSummarize}
          disabled={loading}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading && (
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          {loading ? 'AI 正在生成...' : '生成 AI 智能总结'}
        </button>

        {loading && (
          <button
            onClick={handleStop}
            className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors border border-red-200 flex-shrink-0"
          >
            停止生成
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {progressStage || 'AI 正在生成...'}
          </span>
          <span className="text-xs text-blue-500 font-medium">已生成 {charCount.toLocaleString()} 字</span>
        </div>
      )}

      {!loading && charCount > 0 && (
        <div className="mt-2 text-xs text-gray-400 text-right">共 {charCount.toLocaleString()} 字</div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {displaySummary && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">总结结果</h3>
            <button
              onClick={downloadDocx}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              下载文档 ↓
            </button>
          </div>
          <div className="bg-gray-50 border rounded-lg p-4 overflow-y-auto">
            {renderSummary(displaySummary)}
          </div>
        </div>
      )}
    </div>
  );
}
