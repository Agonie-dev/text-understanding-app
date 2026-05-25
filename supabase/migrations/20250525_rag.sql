-- RAG (文档问答) 表结构
-- 在 Supabase Dashboard -> SQL Editor 中执行

-- 1. 问答文档表（存储提取的文本）
CREATE TABLE IF NOT EXISTS chat_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    filename TEXT NOT NULL,
    file_size INT,
    extracted_text TEXT NOT NULL,
    is_truncated BOOLEAN DEFAULT false,
    original_length INT,
    metadata JSONB DEFAULT '{}'
);

-- 2. 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    document_id UUID REFERENCES chat_documents(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL
);

-- 索引加速查询
CREATE INDEX IF NOT EXISTS idx_chat_sessions_document_id ON chat_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);

-- 允许匿名插入（根据你的 RLS 策略调整）
ALTER TABLE chat_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON chat_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON chat_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
