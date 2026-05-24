'use client';

import { useState, useEffect } from 'react';

interface HistoryRecord {
  id: string;
  created_at: string;
  filename: string;
  file_size: number;
  file_type: string;
  operation_type: string;
  status: string;
  summary_text?: string;
}

export default function HistoryTable() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success) setRecords(data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('zh-CN');
  };

  const opLabel = (op: string) => {
    if (op === 'upload') return '上传';
    if (op === 'summarize') return '总结';
    if (op === 'convert') return '转换';
    return op;
  };

  const statusBadge = (s: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      processing: 'bg-blue-100 text-blue-700',
      failed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] || 'bg-gray-100 text-gray-600'}`}>
        {s === 'completed' ? '完成' : s === 'pending' ? '等待中' : s === 'processing' ? '处理中' : s === 'failed' ? '失败' : s}
      </span>
    );
  };

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">历史记录</h3>
        <span className="text-xs text-gray-400">共 {records.length} 条 · 1天后自动清理</span>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">暂无记录</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">时间</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">文件名</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium hidden sm:table-cell">操作</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium hidden sm:table-cell">大小</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-[150px] truncate" title={r.filename}>{r.filename}</td>
                  <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{opLabel(r.operation_type)}</td>
                  <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{formatSize(r.file_size)}</td>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
