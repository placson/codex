import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../db/schema.sql");

const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "postgres",
      database: process.env.PGDATABASE ?? "finance_planner",
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    };

export const pool = new Pool(connectionConfig);

async function seedDefaults() {
  await pool.query(
    `
      INSERT INTO retirement_profiles (
        id,
        full_name,
        email,
        birth_date,
        current_age,
        current_salary,
        retirement_age,
        life_expectancy_age,
        retirement_year,
        retirement_end_year
      )
      VALUES (
        1,
        '',
        '',
        (CURRENT_DATE - INTERVAL '35 years')::DATE,
        35,
        0,
        65,
        90,
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 30,
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 60
      )
      ON CONFLICT (id) DO NOTHING
    `,
  );

  await pool.query(
    `
      INSERT INTO retirement_assets (
        id,
        savings_amount,
        savings_apr,
        stock_portfolio_amount,
        stock_portfolio_annual_fees,
        account_401k_amount,
        account_401k_annual_fees,
        ira_amount,
        ira_annual_fees,
        account_403b_amount,
        account_403b_annual_fees
      )
      VALUES (1, 0, 2.5, 0, 0.25, 0, 0.45, 0, 0.35, 0, 0.55)
      ON CONFLICT (id) DO NOTHING
    `,
  );

  await pool.query(
    `
      INSERT INTO retirement_targets (
        id,
        target_city,
        target_annual_spend,
        inflation_rate
      )
      VALUES (1, '', 0, 3)
      ON CONFLICT (id) DO NOTHING
    `,
  );
}

async function ensureCompatibilityMigrations() {
  await pool.query(
    `
      ALTER TABLE retirement_profiles
      ADD COLUMN IF NOT EXISTS current_salary NUMERIC(14, 2) NOT NULL DEFAULT 0
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_profiles
      ADD COLUMN IF NOT EXISTS birth_date DATE
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_profiles
      ADD COLUMN IF NOT EXISTS life_expectancy_age INTEGER NOT NULL DEFAULT 90
    `,
  );

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS retirement_targets (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        target_city TEXT NOT NULL DEFAULT '',
        target_annual_spend NUMERIC(14, 2) NOT NULL DEFAULT 0,
        inflation_rate NUMERIC(6, 3) NOT NULL DEFAULT 3,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_targets
      ADD COLUMN IF NOT EXISTS inflation_rate NUMERIC(6, 3) NOT NULL DEFAULT 3
    `,
  );

  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS retirement_asset_items (
        id BIGSERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL DEFAULT 1 CHECK (owner_id = 1),
        asset_type TEXT NOT NULL,
        amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );

  await pool.query(
    `
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
      )
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_income_streams
      ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_income_streams
      ADD COLUMN IF NOT EXISTS annual_growth_rate NUMERIC(6, 3) NOT NULL DEFAULT 0
    `,
  );

  await pool.query(
    `
      ALTER TABLE retirement_income_streams
      ADD COLUMN IF NOT EXISTS start_age NUMERIC(5, 2)
    `,
  );

  await pool.query(
    `
      ALTER TABLE user_retirement_income_streams
      ADD COLUMN IF NOT EXISTS annual_growth_rate NUMERIC(6, 3) NOT NULL DEFAULT 0
    `,
  );

  await pool.query(
    `
      ALTER TABLE user_retirement_income_streams
      ADD COLUMN IF NOT EXISTS start_age NUMERIC(5, 2)
    `,
  );

  const { rows: itemCountRows } = await pool.query(
    "SELECT COUNT(*)::INTEGER AS count FROM retirement_asset_items WHERE owner_id = 1",
  );

  if (itemCountRows[0]?.count > 0) {
    return;
  }

  const { rows: legacyRows } = await pool.query(
    `
      SELECT
        savings_amount,
        savings_apr,
        stock_portfolio_amount,
        stock_portfolio_annual_fees,
        account_401k_amount,
        account_401k_annual_fees,
        ira_amount,
        ira_annual_fees,
        account_403b_amount,
        account_403b_annual_fees
      FROM retirement_assets
      WHERE id = 1
    `,
  );

  const legacy = legacyRows[0];

  if (!legacy) {
    return;
  }

  const legacyAssets = [
    {
      assetType: "savings",
      amount: Number(legacy.savings_amount),
      rate: Number(legacy.savings_apr),
    },
    {
      assetType: "stock_portfolio",
      amount: Number(legacy.stock_portfolio_amount),
      rate: Number(legacy.stock_portfolio_annual_fees),
    },
    {
      assetType: "401k",
      amount: Number(legacy.account_401k_amount),
      rate: Number(legacy.account_401k_annual_fees),
    },
    {
      assetType: "traditional_ira",
      amount: Number(legacy.ira_amount),
      rate: Number(legacy.ira_annual_fees),
    },
    {
      assetType: "403b",
      amount: Number(legacy.account_403b_amount),
      rate: Number(legacy.account_403b_annual_fees),
    },
  ].filter((asset) => asset.amount > 0);

  for (const asset of legacyAssets) {
    await pool.query(
      `
        INSERT INTO retirement_asset_items (owner_id, asset_type, amount, rate)
        VALUES (1, $1, $2, $3)
      `,
      [asset.assetType, asset.amount, asset.rate],
    );
  }
}

export async function initializeDatabase() {
  const schemaSql = await fs.readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  await ensureCompatibilityMigrations();
  await seedDefaults();
}
