-- 文档问答所需的表（RAG 功能）

-- 存储上传的文档内容
CREATE TABLE IF NOT EXISTS chat_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filename TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  extracted_text TEXT NOT NULL,
  is_truncated BOOLEAN DEFAULT false,
  original_length INTEGER DEFAULT 0,
  kimi_file_id TEXT
);

-- 存储问答会话
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  document_id UUID NOT NULL REFERENCES chat_documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新会话'
);

-- 存储对话消息
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL
);

-- RLS 策略（公开访问，无需登录）
ALTER TABLE chat_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON chat_documents
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all" ON chat_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all" ON chat_messages
  FOR ALL USING (true) WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_chat_sessions_document ON chat_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_documents_created ON chat_documents(created_at);
