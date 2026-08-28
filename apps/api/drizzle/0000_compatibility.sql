CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  first_name varchar(100),
  last_name varchar(100),
  avatar_url varchar(2048),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider varchar(50) NOT NULL,
  provider_subject varchar(255) NOT NULL,
  provider_email varchar(320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_oauth_identities_user_id_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_oauth_identities_provider_subject UNIQUE (provider, provider_subject)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  CONSTRAINT fk_sessions_user_id_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash)
);
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE oauth_identities ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
--> statement-breakpoint
DO $$
DECLARE old_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email' AND conrelid = 'users'::regclass) THEN
    SELECT c.conname INTO old_name FROM pg_constraint c
      WHERE c.conrelid = 'users'::regclass AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) = 'UNIQUE (email)';
    IF old_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE users RENAME CONSTRAINT %I TO uq_users_email', old_name);
    ELSE
      ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_email_lowercase' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email));
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE old_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_oauth_identities_provider_subject' AND conrelid = 'oauth_identities'::regclass) THEN
    SELECT c.conname INTO old_name FROM pg_constraint c
      WHERE c.conrelid = 'oauth_identities'::regclass AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) = 'UNIQUE (provider, provider_subject)';
    IF old_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE oauth_identities RENAME CONSTRAINT %I TO uq_oauth_identities_provider_subject', old_name);
    ELSE
      ALTER TABLE oauth_identities ADD CONSTRAINT uq_oauth_identities_provider_subject UNIQUE (provider, provider_subject);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_oauth_identities_user_id_users' AND conrelid = 'oauth_identities'::regclass) THEN
    ALTER TABLE oauth_identities ADD CONSTRAINT fk_oauth_identities_user_id_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE old_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sessions_token_hash' AND conrelid = 'sessions'::regclass) THEN
    SELECT c.conname INTO old_name FROM pg_constraint c
      WHERE c.conrelid = 'sessions'::regclass AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid) = 'UNIQUE (token_hash)';
    IF old_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE sessions RENAME CONSTRAINT %I TO uq_sessions_token_hash', old_name);
    ELSE
      ALTER TABLE sessions ADD CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_user_id_users' AND conrelid = 'sessions'::regclass) THEN
    ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user_id_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_oauth_identities_user_id ON oauth_identities(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires_at_revoked_at ON sessions(expires_at, revoked_at);
