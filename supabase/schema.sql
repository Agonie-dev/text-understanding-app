-- Supabase SQL: 创建 history 表

CREATE TABLE IF NOT EXISTS history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filename TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  file_type TEXT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('upload', 'summarize', 'convert')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_url TEXT,
  summary_text TEXT,
  error_message TEXT
);

-- 文件缓存表（24小时有效）
CREATE TABLE IF NOT EXISTS file_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  md5 TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  text TEXT NOT NULL,
  is_scanned BOOLEAN DEFAULT false,
  is_truncated BOOLEAN DEFAULT false,
  original_length INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自动清理 1 天前的记录
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM history WHERE created_at < NOW() - INTERVAL '1 days';
$$;

-- 自动清理 1 天前的文件缓存
CREATE OR REPLACE FUNCTION cleanup_old_file_cache()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM file_cache WHERE created_at < NOW() - INTERVAL '1 days';
$$;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_operation ON history(operation_type);
CREATE INDEX IF NOT EXISTS idx_file_cache_md5 ON file_cache(md5);
CREATE INDEX IF NOT EXISTS idx_file_cache_created_at ON file_cache(created_at);

-- 设置 RLS（如果不需要登录，可以公开访问）
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON history
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all" ON file_cache
  FOR ALL USING (true) WITH CHECK (true);
