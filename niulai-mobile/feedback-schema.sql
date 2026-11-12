CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('problem','suggestion')),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 5 AND 3000),
  contact TEXT NOT NULL DEFAULT '' CHECK(length(contact) <= 160),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','planned','resolved')),
  version TEXT NOT NULL DEFAULT '1.4.0'
);
CREATE INDEX IF NOT EXISTS feedback_created_at ON feedback(created_at);
CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  email_to TEXT NOT NULL,
  email_status TEXT NOT NULL,
  gmail_message_id TEXT,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
