CREATE TABLE IF NOT EXISTS retirement_profiles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  current_age INTEGER NOT NULL DEFAULT 35 CHECK (current_age BETWEEN 0 AND 120),
  current_salary NUMERIC(14, 2) NOT NULL DEFAULT 0,
  retirement_age INTEGER NOT NULL DEFAULT 65 CHECK (retirement_age BETWEEN 0 AND 120),
  life_expectancy_age INTEGER NOT NULL DEFAULT 90 CHECK (life_expectancy_age BETWEEN 0 AND 130),
  retirement_year INTEGER NOT NULL DEFAULT 2056 CHECK (retirement_year BETWEEN 1900 AND 2200),
  retirement_end_year INTEGER NOT NULL DEFAULT 2086 CHECK (retirement_end_year BETWEEN 1900 AND 2300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_assets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  savings_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  savings_apr NUMERIC(6, 3) NOT NULL DEFAULT 2.5,
  stock_portfolio_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stock_portfolio_annual_fees NUMERIC(6, 3) NOT NULL DEFAULT 0.25,
  account_401k_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  account_401k_annual_fees NUMERIC(6, 3) NOT NULL DEFAULT 0.45,
  ira_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ira_annual_fees NUMERIC(6, 3) NOT NULL DEFAULT 0.35,
  account_403b_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  account_403b_annual_fees NUMERIC(6, 3) NOT NULL DEFAULT 0.55,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_targets (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_city TEXT NOT NULL DEFAULT '',
  target_annual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inflation_rate NUMERIC(6, 3) NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_asset_items (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL DEFAULT 1 CHECK (owner_id = 1),
  asset_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retirement_income_streams (
  id BIGSERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL DEFAULT 1 CHECK (owner_id = 1),
  stream_type TEXT NOT NULL,
  annual_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  annual_growth_rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  start_age NUMERIC(5, 2),
  start_date DATE NOT NULL,
  end_date DATE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_verification_codes_user_id_idx
  ON auth_verification_codes (user_id);

CREATE INDEX IF NOT EXISTS auth_verification_codes_email_idx
  ON auth_verification_codes (email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
  ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS user_retirement_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  current_age INTEGER NOT NULL DEFAULT 35 CHECK (current_age BETWEEN 0 AND 120),
  current_salary NUMERIC(14, 2) NOT NULL DEFAULT 0,
  retirement_age INTEGER NOT NULL DEFAULT 65 CHECK (retirement_age BETWEEN 0 AND 120),
  life_expectancy_age INTEGER NOT NULL DEFAULT 90 CHECK (life_expectancy_age BETWEEN 0 AND 130),
  retirement_year INTEGER NOT NULL DEFAULT 2056 CHECK (retirement_year BETWEEN 1900 AND 2200),
  retirement_end_year INTEGER NOT NULL DEFAULT 2086 CHECK (retirement_end_year BETWEEN 1900 AND 2300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_retirement_targets (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_city TEXT NOT NULL DEFAULT '',
  target_annual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inflation_rate NUMERIC(6, 3) NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_retirement_asset_items (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_retirement_asset_items_user_id_idx
  ON user_retirement_asset_items (user_id);

CREATE TABLE IF NOT EXISTS user_retirement_income_streams (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_type TEXT NOT NULL,
  annual_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  annual_growth_rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  start_age NUMERIC(5, 2),
  start_date DATE NOT NULL,
  end_date DATE,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_retirement_income_streams_user_id_idx
  ON user_retirement_income_streams (user_id);
