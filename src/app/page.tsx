'use client';

import { useState, useCallback, Suspense, lazy } from 'react';
import FileUploader from '@/components/FileUploader';
import HistoryTable from '@/components/HistoryTable';

// 懒加载大组件，减少首屏体积
const SummaryPanel = lazy(() => import('@/components/SummaryPanel'));
const QAPanel = lazy(() => import('@/components/QAPanel'));
const Converter = lazy(() => import('@/components/Converter'));
const Translator = lazy(() => import('@/components/Translator'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <svg className="animate-spin h-8 w-8 text-indigo-600" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

interface UploadMeta {
  isScanned: boolean;
  isTruncated: boolean;
  originalLength: number;
  cacheHit: boolean;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'summary' | 'convert' | 'qa' | 'translate'>('summary');
  const [uploadedText, setUploadedText] = useState('');
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [uploadMeta, setUploadMeta] = useState<UploadMeta>({
    isScanned: false,
    isTruncated: false,
    originalLength: 0,
    cacheHit: false,
  });
  const [showSummary, setShowSummary] = useState(false);

  // QA 状态
  const [qaDocumentId, setQaDocumentId] = useState<string>('');
  const [qaMeta, setQaMeta] = useState({
    isTruncated: false,
    originalLength: 0,
    extractedLength: 0,
  });
  const [showQA, setShowQA] = useState(false);

  const handleUpload = useCallback(
    async (file: File, text: string, meta: UploadMeta) => {
      setUploadedText(text);
      setUploadedFilename(file.name);
      setUploadMeta(meta);
      setShowSummary(true);

      // 同步上传到 QA 后端
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/rag/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (res.ok && data.documentId) {
          setQaDocumentId(data.documentId);
          setQaMeta({
            isTruncated: data.isTruncated || false,
            originalLength: data.originalLength || 0,
            extractedLength: data.extractedLength || 0,
          });
          setShowQA(true);

          // 上传成功后自动清理超过24小时的旧文档
          fetch('/api/rag/cleanup?hours=24').catch((e) => console.error('Cleanup error:', e));
        }
      } catch (e) {
        console.error('QA upload error:', e);
      }
    },
    []
  );

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
          <div className="flex gap-4 border-b mb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('summary')}
              className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'summary'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🤖 AI 智能总结
            </button>
            <button
              onClick={() => setActiveTab('qa')}
              className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'qa'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              💬 文档问答
            </button>
            <button
              onClick={() => setActiveTab('translate')}
              className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'translate'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🌐 全文翻译
            </button>
            <button
              onClick={() => setActiveTab('convert')}
              className={`pb-2 text-sm font-medium transition-colors whitespace-nowrap ${
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
                <Suspense fallback={<LoadingFallback />}>
                  <SummaryPanel text={uploadedText} filename={uploadedFilename} meta={uploadMeta} />
                </Suspense>
              )}
            </div>
          )}

          {activeTab === 'qa' && (
            <div>
              {!showQA ? (
                <div className="text-center py-8 text-gray-400 text-sm">请先上传文档</div>
              ) : (
                <Suspense fallback={<LoadingFallback />}>
                  <QAPanel
                    documentId={qaDocumentId}
                    filename={uploadedFilename}
                    meta={qaMeta}
                    onDocumentDeleted={() => {
                      setShowQA(false);
                      setQaDocumentId('');
                      setActiveTab('summary');
                    }}
                  />
                </Suspense>
              )}
            </div>
          )}

          {activeTab === 'translate' && (
            <Suspense fallback={<LoadingFallback />}>
              <Translator />
            </Suspense>
          )}

          {activeTab === 'convert' && (
            <Suspense fallback={<LoadingFallback />}>
              <Converter />
            </Suspense>
          )}
        </section>

        <section className="bg-white rounded-xl shadow-sm border p-6">
          <Suspense fallback={<LoadingFallback />}>
            <HistoryTable />
          </Suspense>
        </section>
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        text-understanding-app · 支持 Word / PDF / TXT / Markdown
      </footer>
    </div>
  );
}
