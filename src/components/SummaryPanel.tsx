'use client';

import { useState } from 'react';

interface SummaryPanelProps {
  text: string;
  filename: string;
}

export default function SummaryPanel({ text, filename }: SummaryPanelProps) {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSummarize = async () => {
    if (!text || text.length < 10) {
      setError('文本内容太短');
      return;
    }
    setLoading(true);
    setError('');
    setSummary('');

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '总结失败');
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadDocx = () => {
    if (!summary) return;
    const blob = new Blob([summary], { type: 'text/plain' });
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
      <button
        onClick={handleSummarize}
        disabled={loading}
        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loading && (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        )}
        {loading ? 'AI 正在总结...' : '生成 AI 智能总结'}
      </button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {summary && (
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
          <div className="bg-gray-50 border rounded-lg p-4 max-h-96 overflow-y-auto">
            {renderSummary(summary)}
          </div>
        </div>
      )}
    </div>
  );
}
