CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY, bitbucket_uuid TEXT NOT NULL UNIQUE, email TEXT NOT NULL, display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE,
  expiration_time TIMESTAMPTZ, p256dh TEXT NOT NULL, auth TEXT NOT NULL, device_label TEXT, platform TEXT, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ, last_error TEXT
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx ON push_subscriptions (user_id, revoked_at);
CREATE TABLE IF NOT EXISTS push_delivery_logs (
  id UUID PRIMARY KEY, subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL, user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
