'use client';

import { useState, useCallback, Suspense, lazy, useEffect } from 'react';
import FileUploader from '@/components/FileUploader';
import HistoryTable from '@/components/HistoryTable';

// 懒加载大组件，减少首屏体积
const SummaryPanel = lazy(() => import('@/components/SummaryPanel'));
const QAPanel = lazy(() => import('@/components/QAPanel'));
const Converter = lazy(() => import('@/components/Converter'));
const Translator = lazy(() => import('@/components/Translator'));
const LoginForm = lazy(() => import('@/components/LoginForm'));
const AdminDrawer = lazy(() => import('@/components/AdminDrawer'));

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

interface QuotaInfo {
  summaryUsed: number;
  summaryLimit: number;
  summaryRemaining: number;
  qaUsed: number;
  qaLimit: number;
  qaRemaining: number;
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

  // 访客身份 & 配额
  const [visitorId, setVisitorId] = useState<string>('');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [role, setRole] = useState<'admin' | 'visitor' | null>(null);

  // 管理面板
  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // 初始化 visitorId
  useEffect(() => {
    let vid = localStorage.getItem('visitor_id');
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('visitor_id', vid);
    }
    setVisitorId(vid);
  }, []);

  // 检查身份和配额
  const fetchMe = useCallback(async () => {
    if (!visitorId) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 'x-visitor-id': visitorId },
      });
      if (res.ok) {
        const data = await res.json();
        setRole(data.role);
        if (data.role === 'visitor' && data.quota) {
          setQuota(data.quota);
        } else {
          setQuota(null);
        }
      }
    } catch (e) {
      console.error('fetchMe error:', e);
    }
  }, [visitorId]);

  useEffect(() => {
    if (visitorId) fetchMe();
  }, [visitorId, fetchMe]);

  const handleLoginSuccess = () => {
    setShowLogin(false);
    setRole('admin');
    setQuota(null);
    fetchMe();
  };

  const handleLogout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setRole('visitor');
    setShowAdmin(false);
    fetchMe();
  };

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

  // 配额提示文字
  const quotaText = quota
    ? `今日剩余：总结 ${quota.summaryRemaining}/${quota.summaryLimit} 次 · 问答 ${quota.qaRemaining}/${quota.qaLimit} 轮`
    : '';

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📄 文本理解</h1>
            <p className="text-sm text-gray-500 mt-1">上传文档，AI 自动总结与格式转换</p>
          </div>
          <div className="flex items-center gap-3">
            {role === 'visitor' && quotaText && (
              <span className="text-xs text-gray-400 hidden sm:inline">{quotaText}</span>
            )}
            {role === 'admin' && (
              <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                管理员
              </span>
            )}
            <button
              onClick={() => {
                if (role === 'admin') {
                  setShowAdmin(true);
                } else {
                  setShowLogin(true);
                }
              }}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={role === 'admin' ? '管理后台' : '管理员登录'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 移动端配额提示 */}
      {role === 'visitor' && quotaText && (
        <div className="bg-gray-50 border-b px-4 py-2 text-center text-xs text-gray-400 sm:hidden">
          {quotaText}
        </div>
      )}

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
                  <SummaryPanel text={uploadedText} filename={uploadedFilename} meta={uploadMeta} visitorId={visitorId} />
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
                    visitorId={visitorId}
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

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowLogin(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={<LoadingFallback />}>
              <LoginForm onSuccess={handleLoginSuccess} onCancel={() => setShowLogin(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {/* Admin Drawer */}
      <Suspense fallback={null}>
        <AdminDrawer
          isOpen={showAdmin}
          onClose={() => setShowAdmin(false)}
          onLogout={handleLogout}
        />
      </Suspense>
    </div>
  );
}
