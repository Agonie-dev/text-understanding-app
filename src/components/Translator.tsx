'use client';

import { useState } from 'react';

const SUPPORTED_INPUT_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.md', '.markdown'];
const FORMAT_OPTIONS = [
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'html', label: '网页 (.html)' },
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'txt', label: '纯文本 (.txt)' },
];

function getMimeType(format: string): string {
  switch (format) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'html': return 'text/html';
    case 'md': return 'text/markdown';
    case 'txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

export default function Translator() {
  const [file, setFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState<'zh' | 'en'>('zh');
  const [targetFormat, setTargetFormat] = useState<string>('pdf');
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ filename: string; translatedText: string; base64?: string; mimeType?: string } | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
    setShowPreview(false);
  };

  const handleTranslate = async () => {
    if (!file) return;
    setTranslating(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetLang', targetLang);

      const res = await fetch('/api/translate', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '翻译失败');

      setOriginalText(data.originalText || '');
      setResult({
        filename: data.filename,
        translatedText: data.translatedText,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const handleExport = async () => {
    if (!result?.translatedText) return;
    setTranslating(true);
    setError('');

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: result.translatedText,
          format: targetFormat,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '导出失败');
      }
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });

      setResult((prev) =>
        prev ? { ...prev, base64, mimeType: getMimeType(targetFormat) } : null
      );
    } catch (e: any) {
      setError(e.message || '导出失败');
    } finally {
      setTranslating(false);
    }
  };

  const downloadResult = () => {
    if (!result?.base64 || !result?.mimeType) return;
    const byteString = atob(result.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = targetFormat;
    a.download = (result.filename || 'translated').replace(/\.[^.]+$/, '') + '_翻译.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4">
      {/* 文件上传 */}
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.markdown"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">翻译为：</span>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as 'zh' | 'en')}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value="zh">中文 🇨🇳</option>
            <option value="en">English 🇺🇸</option>
          </select>
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="ml-auto py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {translating ? '翻译中...' : '🌐 开始翻译'}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          {/* 预览切换 */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setShowPreview(false)}
              className={`text-sm pb-1 ${!showPreview ? 'text-indigo-600 border-b-2 border-indigo-600 font-medium' : 'text-gray-500'}`}
            >
              原文
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={`text-sm pb-1 ${showPreview ? 'text-indigo-600 border-b-2 border-indigo-600 font-medium' : 'text-gray-500'}`}
            >
              译文
            </button>
          </div>

          {/* 文本预览 */}
          <div className="bg-gray-50 border rounded-lg p-4 max-h-[400px] overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {showPreview ? result.translatedText : originalText}
          </div>

          {/* 导出 */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">导出格式：</span>
            <select
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              disabled={translating}
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {translating ? '导出中...' : '📥 导出文档'}
            </button>
          </div>

          {result.base64 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-700">导出成功</span>
              </div>
              <button
                onClick={downloadResult}
                className="py-1.5 px-3 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
              >
                下载
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
