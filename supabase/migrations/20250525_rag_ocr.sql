-- 为 chat_documents 添加 Kimi 文件 ID，用于扫描件 OCR
ALTER TABLE chat_documents ADD COLUMN IF NOT EXISTS kimi_file_id TEXT;
