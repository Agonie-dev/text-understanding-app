'use client';

import { useState } from 'react';

export default function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<'pdf' | 'docx'>('pdf');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ filename: string; base64: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') setTargetFormat('docx');
    if (ext === 'docx' || ext === 'doc') setTargetFormat('pdf');
    setFile(f);
    setError('');
    setResult(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setConverting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('targetFormat', targetFormat);

      const res = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '转换失败');
      setResult({ filename: data.filename, base64: data.base64 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConverting(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const byteString = atob(result.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const mime = targetFormat === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {file && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">转换为：</span>
          <select
            value={targetFormat}
            onChange={(e) => setTargetFormat(e.target.value as 'pdf' | 'docx')}
            className="text-sm border rounded-lg px-3 py-2"
          >
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
          </select>
          <button
            onClick={handleConvert}
            disabled={converting}
            className="ml-auto py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {converting ? '转换中...' : '开始转换'}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-green-700">{result.filename}</span>
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
  );
}
