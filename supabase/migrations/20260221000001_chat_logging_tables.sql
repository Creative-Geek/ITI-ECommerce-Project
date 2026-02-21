-- Chat sessions and messages logging for byteStore chatbot
-- Enables audit trail, improvement analysis, and user history

-- ── Chat Sessions Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_helpful BOOLEAN,  -- User feedback: was this session helpful?
  notes TEXT  -- Admin/analyst notes
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- ── Chat Messages Table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tools_used JSONB,  -- ["search_products", "get_price_range"]
  products_recommended JSONB,  -- [{id, name, price, brand}]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (safe for re-runs)
DROP POLICY IF EXISTS "Users read own sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Edge function insert sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users read own messages" ON chat_messages;
DROP POLICY IF EXISTS "Edge function insert messages" ON chat_messages;

-- Sessions: authenticated users can read their own
CREATE POLICY "Users read own sessions" ON chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Sessions: service role (Edge Function) can insert
CREATE POLICY "Edge function insert sessions" ON chat_sessions
  FOR INSERT WITH CHECK (true);

-- Messages: authenticated users can read messages from their sessions
CREATE POLICY "Users read own messages" ON chat_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
  );

-- Messages: service role (Edge Function) can insert
CREATE POLICY "Edge function insert messages" ON chat_messages
  FOR INSERT WITH CHECK (true);
