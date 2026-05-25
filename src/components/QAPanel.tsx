'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface QAPanelProps {
  documentId: string;
  filename: string;
  meta?: {
    isTruncated: boolean;
    originalLength: number;
    extractedLength: number;
  };
  onDocumentDeleted?: () => void;
}

export default function QAPanel({ documentId, filename, meta, onDocumentDeleted }: QAPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/rag/sessions?document_id=${documentId}`);
      const data = await res.json();
      if (res.ok && data.sessions) {
        setSessions(data.sessions);
        if (data.sessions.length > 0 && !activeSessionId) {
          setActiveSessionId(data.sessions[0].id);
        }
      }
    } catch (e) {
      console.error('Load sessions error:', e);
    }
  }, [documentId, activeSessionId]);

  // 加载消息
  const loadMessages = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/rag/messages?session_id=${sessionId}`);
      const data = await res.json();
      if (res.ok && data.messages) {
        setMessages(data.messages);
      }
    } catch (e) {
      console.error('Load messages error:', e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    }
  }, [activeSessionId, loadMessages]);

  const prevMsgCountRef = useRef(0);

  // 自动滚动：只在消息数量增加时滚动消息容器内部，不滚动整个页面
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      prevMsgCountRef.current = messages.length;
    }
  }, [messages.length]);

  const handleNewSession = async () => {
    try {
      const res = await fetch('/api/rag/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, title: '新会话' }),
      });
      const data = await res.json();
      if (res.ok && data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        setMessages([]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/rag/sessions?id=${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId);
          setActiveSessionId(remaining[0]?.id || '');
          setMessages([]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeleteDocument = async () => {
    if (!window.confirm('确定删除该文档及所有对话记录？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/rag/documents?id=${documentId}`, { method: 'DELETE' });
      if (res.ok) {
        onDocumentDeleted?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '删除失败');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeSessionId || loading) return;

    setInput('');
    setLoading(true);
    setStreaming(true);
    setError('');

    // 先显示用户消息
    const userMsg: ChatMessage = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          sessionId: activeSessionId,
          message: text,
          stream: true,
        }),
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
            const event = JSON.parse(dataStr);
            if (event.type === 'token' && event.text) {
              fullText += event.text;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant' && last.id.startsWith('temp-')) {
                  return [...prev.slice(0, -1), { ...last, content: last.content + event.text }];
                }
                return [
                  ...prev,
                  {
                    id: 'temp-assistant-' + Date.now(),
                    role: 'assistant',
                    content: event.text,
                    created_at: new Date().toISOString(),
                  },
                ];
              });
            } else if (event.type === 'error') {
              throw new Error(event.message || '生成出错');
            }
          } catch (parseErr: any) {
            if (parseErr.message === '生成出错') throw parseErr;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || '问答失败');
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
      // 不刷新数据库，保留本地流式状态
      // 切换会话时会自动 loadMessages
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={idx} className="text-base font-bold text-gray-800 mt-3 mb-1">
            {trimmed.replace('## ', '')}
          </h3>
        );
      }
      if (trimmed.startsWith('# ')) {
        return (
          <h2 key={idx} className="text-lg font-bold text-gray-900 mt-4 mb-2">
            {trimmed.replace('# ', '')}
          </h2>
        );
      }
      if (trimmed.startsWith('- ')) {
        return (
          <li key={idx} className="ml-4 text-gray-700 mb-0.5 list-disc">
            {trimmed.replace('- ', '')}
          </li>
        );
      }
      if (!trimmed) return <br key={idx} />;
      return (
        <p key={idx} className="text-gray-700 mb-1 leading-relaxed">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="w-full flex flex-col h-[600px]">
      {/* 文档信息 */}
      <div className="mb-3 p-3 bg-gray-50 border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">{filename}</p>
            <p className="text-xs text-gray-500">
              {meta?.isTruncated
                ? `共 ${meta.originalLength.toLocaleString()} 字，已截断至 ${meta.extractedLength.toLocaleString()} 字`
                : `共 ${meta?.extractedLength?.toLocaleString() || '—'} 字`}
            </p>
          </div>
          <button
            onClick={handleNewSession}
            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 font-medium transition-colors"
          >
            + 新会话
          </button>
          <button
            onClick={handleDeleteDocument}
            className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 font-medium transition-colors"
          >
            🗑 删除文档
          </button>
        </div>
        {meta?.isTruncated && (
          <p className="text-xs text-yellow-600 mt-1">⚠️ 文档较长，已截断至前 8 万字用于问答</p>
        )}
      </div>

      {/* 会话标签 */}
      {sessions.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <span>{session.title || '会话'}</span>
              {sessions.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
                  className={`ml-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                    activeSessionId === session.id ? 'text-indigo-200' : 'text-gray-400'
                  }`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {error}
        </div>
      )}

      {/* 消息列表 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto space-y-3 mb-3 px-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center">
              <p className="mb-2">💬</p>
              <p>输入问题，开始与文档对话</p>
              <p className="text-xs mt-1 text-gray-300">例如：这篇文档的核心观点是什么？</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-800 border border-gray-200'
              }`}
            >
              {renderMessageContent(msg.content)}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              正在思考...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，按 Enter 发送..."
          rows={2}
          disabled={loading}
          className="flex-1 text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50"
        />
        <div className="flex flex-col gap-1">
          {loading ? (
            <button
              onClick={handleStop}
              className="h-full px-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-xs font-medium transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !activeSessionId}
              className="h-full px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 text-sm font-medium transition-colors"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
