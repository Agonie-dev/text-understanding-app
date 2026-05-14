'use client';

import { useState } from 'react';
import FileUploader from '@/components/FileUploader';
import SummaryPanel from '@/components/SummaryPanel';
import Converter from '@/components/Converter';
import HistoryTable from '@/components/HistoryTable';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'summary' | 'convert'>('summary');
  const [uploadedText, setUploadedText] = useState('');
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  const handleUpload = (file: File, text: string, isScanned: boolean) => {
    setUploadedText(text);
    setUploadedFilename(file.name);
    setShowSummary(true);
    if (isScanned) {
      console.log('扫描版 PDF，已尝试 OCR');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <h1 className="text-2xl font-bold text-gray-900">📄 文本理解</h1>
          <p className="text-sm text-gray-500 mt-1">上传文档，AI 自动总结与格式转换</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">1. 上传文档</h2>
          <FileUploader onUpload={handleUpload} />
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex gap-4 border-b mb-4">
            <button
              onClick={() => setActiveTab('summary')}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === 'summary'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🤖 AI 智能总结
            </button>
            <button
              onClick={() => setActiveTab('convert')}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === 'convert'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🔄 格式转换
            </button>
          </div>

          {activeTab === 'summary' && (
            <div>
              {!showSummary ? (
                <div className="text-center py-8 text-gray-400 text-sm">请先上传文档</div>
              ) : (
                <SummaryPanel text={uploadedText} filename={uploadedFilename} />
              )}
            </div>
          )}

          {activeTab === 'convert' && (
            <Converter />
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <HistoryTable />
        </section>
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        text-understanding-app · 支持 Word / PDF
      </footer>
    </div>
  );
}
