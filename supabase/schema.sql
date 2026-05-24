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

-- 自动清理 7 天前的记录
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS void AS $$
BEGIN
  DELETE FROM history WHERE created_at < NOW() - INTERVAL '1 days';
END;
$$ LANGUAGE plpgsql;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_operation ON history(operation_type);

-- 设置 RLS（如果不需要登录，可以公开访问）
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON history
  FOR ALL USING (true) WITH CHECK (true);
