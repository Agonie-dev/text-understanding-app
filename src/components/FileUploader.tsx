'use client';

import { useState, useCallback } from 'react';

interface FileUploaderProps {
  onUpload: (
    file: File,
    text: string,
    meta: {
      isScanned: boolean;
      isTruncated: boolean;
      originalLength: number;
      cacheHit: boolean;
    }
  ) => void;
}

export default function FileUploader({ onUpload }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [info, setInfo] = useState('');
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);

  const clearMessages = () => {
    setError('');
    setWarn('');
    setInfo('');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    const allowedExts = ['.pdf', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExts.includes(ext)) {
      setError('仅支持 Word (.docx) 和 PDF 文件');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('文件大小超过 20MB');
      return;
    }

    clearMessages();
    setUploading(true);
    setProgress(0);
    setFileInfo({ name: file.name, size: file.size, type: ext });

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 10, 90));
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setProgress(100);

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '上传失败');
        setUploading(false);
        return;
      }

      // 截断提示
      if (data.isTruncated) {
        setWarn(
          `文档较长（共 ${data.originalLength?.toLocaleString()} 字），已提取前 ${data.text?.length?.toLocaleString()} 字核心内容进行总结。`
        );
      }

      // 缓存命中提示
      if (data.cacheHit) {
        setInfo('该文件 24 小时内已处理过，直接返回缓存结果 ⚡');
      }

      onUpload(file, data.text || '', {
        isScanned: data.isScanned || false,
        isTruncated: data.isTruncated || false,
        originalLength: data.originalLength || 0,
        cacheHit: data.cacheHit || false,
      });
      setUploading(false);
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || '上传失败');
      setUploading(false);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full">
      <label
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">点击上传</span> 或拖拽文件到此处
          </p>
          <p className="text-xs text-gray-400">支持 Word / PDF，最大 20MB</p>
        </div>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.docx"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
      )}

      {warn && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">⚠️ {warn}</div>
      )}

      {info && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">{info}</div>
      )}

      {uploading && fileInfo && (
        <div className="mt-4 p-4 bg-white border rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{fileInfo.name}</span>
            <span className="text-xs text-gray-400">{formatSize(fileInfo.size)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progress < 100 ? '正在提取文本...' : '提取完成'}</p>
        </div>
      )}

      {!uploading && fileInfo && progress === 100 && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-green-700">{fileInfo.name} 上传成功</span>
          </div>
        </div>
      )}
    </div>
  );
}
