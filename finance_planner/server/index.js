import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeDatabase, pool } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");
const sessionCookieName = "retirement_session";
const authCodeLifetimeMinutes = 15;
const sessionLifetimeDays = 30;
const secureCookies = process.env.NODE_ENV === "production";
const exposeDebugCodes =
  process.env.AUTH_DEBUG_CODES === "true" || process.env.NODE_ENV !== "production";

const profileFields = [
  "full_name",
  "email",
  "birth_date",
  "current_age",
  "current_salary",
  "retirement_age",
  "life_expectancy_age",
  "retirement_year",
  "retirement_end_year",
];

const targetFields = ["target_city", "target_annual_spend", "inflation_rate"];
const allowedAssetTypes = new Set([
  "savings",
  "stock_portfolio",
  "401k",
  "traditional_ira",
  "roth_ira",
  "403b",
]);
const defaultAssetRates = {
  savings: 2.5,
  stock_portfolio: 0.25,
  "401k": 0.45,
  traditional_ira: 0.35,
  roth_ira: 0.35,
  "403b": 0.55,
};
const allowedIncomeStreamTypes = new Set([
  "work_in_retirement",
  "pension",
  "side_job",
  "rental_income",
  "social_security",
  "other",
]);

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCurrency(value, fallback = 0) {
  return Math.max(0, normalizeNumber(value, fallback));
}

function normalizePercent(value, fallback = 0) {
  return Math.max(0, Math.min(100, normalizeNumber(value, fallback)));
}

function normalizeName(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createVerificationCode() {
  return `${crypto.randomInt(0, 1_000_000)}`.padStart(6, "0");
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function parseCookies(cookieHeader) {
  return String(cookieHeader ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      return {
        ...cookies,
        [key]: decodeURIComponent(value),
      };
    }, {});
}

function setSessionCookie(response, token) {
  const cookieValue = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionLifetimeDays * 24 * 60 * 60}`,
  ];

  if (secureCookies) {
    cookieValue.push("Secure");
  }

  response.setHeader("Set-Cookie", cookieValue.join("; "));
}

function clearSessionCookie(response) {
  const cookieValue = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secureCookies) {
    cookieValue.push("Secure");
  }

  response.setHeader("Set-Cookie", cookieValue.join("; "));
}

function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) {
    return null;
  }

  const parsedBirthDate = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(parsedBirthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - parsedBirthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > parsedBirthDate.getMonth() ||
    (today.getMonth() === parsedBirthDate.getMonth() &&
      today.getDate() >= parsedBirthDate.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return Math.max(0, age);
}

function calculateYearAtAge(birthDate, age, fallbackYear) {
  if (!birthDate) {
    return fallbackYear;
  }

  const parsedBirthDate = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(parsedBirthDate.getTime())) {
    return fallbackYear;
  }

  return parsedBirthDate.getFullYear() + age;
}

function toUserResponse(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
  };
}

function toProfileResponse(row) {
  const birthDate =
    row.birth_date == null
      ? ""
      : row.birth_date instanceof Date
        ? row.birth_date.toISOString().slice(0, 10)
        : String(row.birth_date).slice(0, 10);
  const derivedAge = calculateAgeFromBirthDate(birthDate);

  return {
    fullName: row.full_name,
    email: row.email,
    birthDate,
    currentAge: derivedAge ?? row.current_age,
    currentSalary: Number(row.current_salary),
    retirementAge: row.retirement_age,
    lifeExpectancyAge: row.life_expectancy_age,
    retirementYear: row.retirement_year,
    retirementEndYear: row.retirement_end_year,
  };
}

function toTargetsResponse(row) {
  return {
    targetCity: row.target_city,
    targetAnnualSpend: Number(row.target_annual_spend),
    inflationRate: Number(row.inflation_rate),
  };
}

function toAssetResponse(row) {
  return {
    id: row.id,
    assetType: row.asset_type,
    amount: Number(row.amount),
    rate: Number(row.rate),
  };
}

function toIncomeStreamResponse(row) {
  const startDate =
    row.start_date instanceof Date
      ? row.start_date.toISOString().slice(0, 10)
      : String(row.start_date).slice(0, 10);
  const endDate =
    row.end_date == null
      ? null
      : row.end_date instanceof Date
        ? row.end_date.toISOString().slice(0, 10)
        : String(row.end_date).slice(0, 10);

  return {
    id: row.id,
    streamType: row.stream_type,
    annualAmount: Number(row.annual_amount),
    annualGrowthRate: Number(row.annual_growth_rate ?? 0),
    startAge: row.start_age == null ? "" : Number(row.start_age),
    startDate,
    endDate,
    isDisabled: Boolean(row.is_disabled),
  };
}

function sanitizeDateString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function sanitizeProfile(payload, accountEmail) {
  const birthDate = sanitizeDateString(payload.birthDate);
  const currentAge = Math.max(
    0,
    Math.min(
      120,
      Math.round(
        calculateAgeFromBirthDate(birthDate) ?? normalizeNumber(payload.currentAge, 35),
      ),
    ),
  );
  const retirementAge = Math.max(
    currentAge,
    Math.min(120, Math.round(normalizeNumber(payload.retirementAge, 65))),
  );
  const lifeExpectancyAge = Math.max(
    retirementAge,
    Math.min(130, Math.round(normalizeNumber(payload.lifeExpectancyAge, 90))),
  );
  const thisYear = new Date().getFullYear();
  const retirementYear = Math.max(
    thisYear,
    Math.round(
      calculateYearAtAge(
        birthDate,
        retirementAge,
        Math.round(normalizeNumber(payload.retirementYear, thisYear + 30)),
      ),
    ),
  );
  const retirementEndYear = Math.max(
    retirementYear,
    Math.round(
      calculateYearAtAge(
        birthDate,
        lifeExpectancyAge,
        Math.round(normalizeNumber(payload.retirementEndYear, retirementYear + 30)),
      ),
    ),
  );

  return {
    full_name: String(payload.fullName ?? "").trim(),
    email: accountEmail,
    birth_date: birthDate,
    current_age: currentAge,
    current_salary: normalizeCurrency(payload.currentSalary),
    retirement_age: retirementAge,
    life_expectancy_age: lifeExpectancyAge,
    retirement_year: retirementYear,
    retirement_end_year: retirementEndYear,
  };
}

function sanitizeTargets(payload) {
  return {
    target_city: String(payload.targetCity ?? "").trim(),
    target_annual_spend: normalizeCurrency(payload.targetAnnualSpend),
    inflation_rate: normalizePercent(payload.inflationRate, 3),
  };
}

function sanitizeAssets(payload) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  return rawItems.map((item) => {
    const assetType = allowedAssetTypes.has(item?.assetType) ? item.assetType : "savings";

    return {
      asset_type: assetType,
      amount: normalizeCurrency(item?.amount),
      rate: normalizePercent(item?.rate, defaultAssetRates[assetType]),
    };
  });
}

function sanitizeIncomeStreams(payload) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  return rawItems.map((item) => {
    const streamType = allowedIncomeStreamTypes.has(item?.streamType)
      ? item.streamType
      : "other";
    const startDate = sanitizeDateString(item?.startDate) ?? `${new Date().getFullYear()}-01-01`;
    const endDate = sanitizeDateString(item?.endDate);

    return {
      stream_type: streamType,
      annual_amount: normalizeCurrency(item?.annualAmount),
      annual_growth_rate:
        streamType === "rental_income" || streamType === "social_security"
          ? normalizePercent(item?.annualGrowthRate)
          : 0,
      start_age:
        streamType === "social_security" ? normalizeNumber(item?.startAge, 67) : null,
      start_date: startDate,
      end_date: endDate && endDate >= startDate ? endDate : null,
      is_disabled: Boolean(item?.isDisabled),
    };
  });
}

function sanitizeAuthRequest(payload) {
  const mode = payload?.mode === "signup" ? "signup" : "signin";
  const firstName = normalizeName(payload?.firstName);
  const lastName = normalizeName(payload?.lastName);
  const email = normalizeEmail(payload?.email);

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (mode === "signup" && (!firstName || !lastName)) {
    throw new Error("First name and last name are required.");
  }

  return {
    mode,
    firstName,
    lastName,
    email,
  };
}

function sanitizeVerification(payload) {
  const email = normalizeEmail(payload?.email);
  const code = String(payload?.code ?? "").trim();

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!/^\d{6}$/.test(code)) {
    throw new Error("Enter the 6-digit verification code.");
  }

  return { email, code };
}

async function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionToken = cookies[sessionCookieName];

  if (!sessionToken) {
    return null;
  }

  const sessionHash = hashValue(sessionToken);
  const { rows } = await pool.query(
    `
      SELECT
        users.id,
        users.first_name,
        users.last_name,
        users.email,
        users.email_verified_at
      FROM auth_sessions
      INNER JOIN users ON users.id = auth_sessions.user_id
      WHERE auth_sessions.token_hash = $1
        AND auth_sessions.expires_at > NOW()
      LIMIT 1
    `,
    [sessionHash],
  );

  return rows[0] ? toUserResponse(rows[0]) : null;
}

async function requireAuth(request, response, next) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      clearSessionCookie(response);
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

async function seedPlannerDataForUser(client, user) {
  const { rows: existingRows } = await client.query(
    "SELECT 1 FROM user_retirement_profiles WHERE user_id = $1 LIMIT 1",
    [user.id],
  );

  if (existingRows.length > 0) {
    return;
  }

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const { rows: verifiedUserCountRows } = await client.query(
    "SELECT COUNT(*)::INTEGER AS count FROM users WHERE email_verified_at IS NOT NULL",
  );
  const shouldMigrateLegacy = verifiedUserCountRows[0]?.count === 1;

  if (shouldMigrateLegacy) {
    const { rows: legacyProfileRows } = await client.query(
      "SELECT * FROM retirement_profiles WHERE id = 1 LIMIT 1",
    );
    const { rows: legacyTargetRows } = await client.query(
      "SELECT * FROM retirement_targets WHERE id = 1 LIMIT 1",
    );
    const { rows: legacyAssetRows } = await client.query(
      `
        SELECT asset_type, amount, rate
        FROM retirement_asset_items
        WHERE owner_id = 1
        ORDER BY id ASC
      `,
    );
    const { rows: legacyIncomeRows } = await client.query(
      `
        SELECT stream_type, annual_amount, annual_growth_rate, start_age, start_date, end_date, is_disabled
        FROM retirement_income_streams
        WHERE owner_id = 1
        ORDER BY id ASC
      `,
    );

    const legacyProfile = legacyProfileRows[0];
    const legacyTargets = legacyTargetRows[0];

    await client.query(
      `
        INSERT INTO user_retirement_profiles (
          user_id,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        user.id,
        legacyProfile?.full_name || fullName,
        user.email,
        legacyProfile?.birth_date ?? null,
        legacyProfile?.current_age ?? 35,
        legacyProfile?.current_salary ?? 0,
        legacyProfile?.retirement_age ?? 65,
        legacyProfile?.life_expectancy_age ?? 90,
        legacyProfile?.retirement_year ?? new Date().getFullYear() + 30,
        legacyProfile?.retirement_end_year ?? new Date().getFullYear() + 60,
      ],
    );

    await client.query(
      `
        INSERT INTO user_retirement_targets (
          user_id,
          target_city,
          target_annual_spend,
          inflation_rate
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        user.id,
        legacyTargets?.target_city ?? "",
        legacyTargets?.target_annual_spend ?? 0,
        legacyTargets?.inflation_rate ?? 3,
      ],
    );

    for (const asset of legacyAssetRows) {
      await client.query(
        `
          INSERT INTO user_retirement_asset_items (user_id, asset_type, amount, rate)
          VALUES ($1, $2, $3, $4)
        `,
        [user.id, asset.asset_type, asset.amount, asset.rate],
      );
    }

    for (const income of legacyIncomeRows) {
      await client.query(
        `
          INSERT INTO user_retirement_income_streams (
          user_id,
          stream_type,
          annual_amount,
          annual_growth_rate,
          start_age,
          start_date,
          end_date,
          is_disabled
        )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          user.id,
          income.stream_type,
          income.annual_amount,
          income.annual_growth_rate ?? 0,
          income.start_age ?? null,
          income.start_date,
          income.end_date,
          income.is_disabled,
        ],
      );
    }

    return;
  }

  await client.query(
    `
      INSERT INTO user_retirement_profiles (
        user_id,
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
        $1,
        $2,
        $3,
        (CURRENT_DATE - INTERVAL '35 years')::DATE,
        35,
        0,
        65,
        90,
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 30,
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 60
      )
    `,
    [user.id, fullName, user.email],
  );

  await client.query(
    `
      INSERT INTO user_retirement_targets (
        user_id,
        target_city,
        target_annual_spend,
        inflation_rate
      )
      VALUES ($1, '', 0, 3)
    `,
    [user.id],
  );
}

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/auth/session", async (request, response) => {
  try {
    const user = await getSessionUser(request);
    response.json({ user });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/request-code", async (request, response) => {
  const client = await pool.connect();

  try {
    const { mode, firstName, lastName, email } = sanitizeAuthRequest(request.body ?? {});
    await client.query("BEGIN");

    const { rows: existingUserRows } = await client.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    let user = existingUserRows[0];

    if (mode === "signup") {
      if (user?.email_verified_at) {
        throw new Error("An account with that email already exists. Sign in instead.");
      }

      if (user) {
        const { rows } = await client.query(
          `
            UPDATE users
            SET first_name = $2,
                last_name = $3,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [user.id, firstName, lastName],
        );
        user = rows[0];
      } else {
        const { rows } = await client.query(
          `
            INSERT INTO users (first_name, last_name, email)
            VALUES ($1, $2, $3)
            RETURNING *
          `,
          [firstName, lastName, email],
        );
        user = rows[0];
      }
    } else {
      if (!user) {
        throw new Error("No account found for that email. Register first.");
      }
    }

    await client.query(
      "DELETE FROM auth_verification_codes WHERE user_id = $1 AND consumed_at IS NULL",
      [user.id],
    );

    const code = createVerificationCode();
    await client.query(
      `
        INSERT INTO auth_verification_codes (user_id, email, code_hash, expires_at)
        VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL)
      `,
      [user.id, email, hashValue(code), String(authCodeLifetimeMinutes)],
    );

    await client.query("COMMIT");

    console.log(`[auth] Verification code for ${email}: ${code}`);
    response.json({
      ok: true,
      debugCode: exposeDebugCodes ? code : undefined,
      message: "Verification code sent.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    response.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/api/auth/verify-code", async (request, response) => {
  const client = await pool.connect();

  try {
    const { email, code } = sanitizeVerification(request.body ?? {});
    await client.query("BEGIN");

    const { rows: userRows } = await client.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    const user = userRows[0];

    if (!user) {
      throw new Error("No account found for that email.");
    }

    const { rows: codeRows } = await client.query(
      `
        SELECT id
        FROM auth_verification_codes
        WHERE user_id = $1
          AND email = $2
          AND code_hash = $3
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [user.id, email, hashValue(code)],
    );

    if (codeRows.length === 0) {
      throw new Error("That verification code is invalid or expired.");
    }

    await client.query(
      "UPDATE auth_verification_codes SET consumed_at = NOW() WHERE id = $1",
      [codeRows[0].id],
    );

    const { rows: verifiedUserRows } = await client.query(
      `
        UPDATE users
        SET email_verified_at = COALESCE(email_verified_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [user.id],
    );

    const verifiedUser = toUserResponse(verifiedUserRows[0]);
    await seedPlannerDataForUser(client, verifiedUser);

    const sessionToken = createSessionToken();
    await client.query(
      `
        INSERT INTO auth_sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' days')::INTERVAL)
      `,
      [verifiedUser.id, hashValue(sessionToken), String(sessionLifetimeDays)],
    );

    await client.query("COMMIT");

    setSessionCookie(response, sessionToken);
    response.json({ user: verifiedUser });
  } catch (error) {
    await client.query("ROLLBACK");
    clearSessionCookie(response);
    response.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/api/auth/logout", async (request, response) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const sessionToken = cookies[sessionCookieName];

    if (sessionToken) {
      await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
        hashValue(sessionToken),
      ]);
    }

    clearSessionCookie(response);
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/api/profile", requireAuth, async (request, response) => {
  const client = await pool.connect();

  try {
    await seedPlannerDataForUser(client, request.user);
    const { rows } = await client.query(
      "SELECT * FROM user_retirement_profiles WHERE user_id = $1 LIMIT 1",
      [request.user.id],
    );
    response.json(toProfileResponse({ ...rows[0], email: request.user.email }));
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put("/api/profile", requireAuth, async (request, response) => {
  try {
    const profile = sanitizeProfile(request.body ?? {}, request.user.email);
    const values = [request.user.id, ...profileFields.map((field) => profile[field])];

    const { rows } = await pool.query(
      `
        INSERT INTO user_retirement_profiles (user_id, ${profileFields.join(", ")})
        VALUES ($1, ${profileFields.map((_field, index) => `$${index + 2}`).join(", ")})
        ON CONFLICT (user_id) DO UPDATE
        SET ${profileFields.map((field, index) => `${field} = $${index + 2}`).join(", ")},
            updated_at = NOW()
        RETURNING *
      `,
      values,
    );

    response.json(toProfileResponse({ ...rows[0], email: request.user.email }));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get("/api/retirement-targets", requireAuth, async (request, response) => {
  const client = await pool.connect();

  try {
    await seedPlannerDataForUser(client, request.user);
    const { rows } = await client.query(
      "SELECT * FROM user_retirement_targets WHERE user_id = $1 LIMIT 1",
      [request.user.id],
    );
    response.json(toTargetsResponse(rows[0]));
  } catch (error) {
    response.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put("/api/retirement-targets", requireAuth, async (request, response) => {
  try {
    const targets = sanitizeTargets(request.body ?? {});
    const values = [request.user.id, ...targetFields.map((field) => targets[field])];

    const { rows } = await pool.query(
      `
        INSERT INTO user_retirement_targets (user_id, ${targetFields.join(", ")})
        VALUES ($1, ${targetFields.map((_field, index) => `$${index + 2}`).join(", ")})
        ON CONFLICT (user_id) DO UPDATE
        SET ${targetFields.map((field, index) => `${field} = $${index + 2}`).join(", ")},
            updated_at = NOW()
        RETURNING *
      `,
      values,
    );

    response.json(toTargetsResponse(rows[0]));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get("/api/assets", requireAuth, async (request, response) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT id, asset_type, amount, rate
        FROM user_retirement_asset_items
        WHERE user_id = $1
        ORDER BY id ASC
      `,
      [request.user.id],
    );

    response.json({ items: rows.map(toAssetResponse) });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.put("/api/assets", requireAuth, async (request, response) => {
  const client = await pool.connect();

  try {
    const assets = sanitizeAssets(request.body ?? {});
    await client.query("BEGIN");
    await client.query("DELETE FROM user_retirement_asset_items WHERE user_id = $1", [
      request.user.id,
    ]);

    const savedAssets = [];

    for (const asset of assets) {
      const { rows } = await client.query(
        `
          INSERT INTO user_retirement_asset_items (user_id, asset_type, amount, rate)
          VALUES ($1, $2, $3, $4)
          RETURNING id, asset_type, amount, rate
        `,
        [request.user.id, asset.asset_type, asset.amount, asset.rate],
      );

      savedAssets.push(toAssetResponse(rows[0]));
    }

    await client.query("COMMIT");
    response.json({ items: savedAssets });
  } catch (error) {
    await client.query("ROLLBACK");
    response.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/income-streams", requireAuth, async (request, response) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT id, stream_type, annual_amount, annual_growth_rate, start_age, start_date, end_date, is_disabled
        FROM user_retirement_income_streams
        WHERE user_id = $1
        ORDER BY id ASC
      `,
      [request.user.id],
    );

    response.json({ items: rows.map(toIncomeStreamResponse) });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.put("/api/income-streams", requireAuth, async (request, response) => {
  const client = await pool.connect();

  try {
    const incomeStreams = sanitizeIncomeStreams(request.body ?? {});
    await client.query("BEGIN");
    await client.query("DELETE FROM user_retirement_income_streams WHERE user_id = $1", [
      request.user.id,
    ]);

    const savedIncomeStreams = [];

    for (const incomeStream of incomeStreams) {
      const { rows } = await client.query(
        `
          INSERT INTO user_retirement_income_streams (
            user_id,
            stream_type,
            annual_amount,
            annual_growth_rate,
            start_age,
            start_date,
            end_date,
            is_disabled
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, stream_type, annual_amount, annual_growth_rate, start_age, start_date, end_date, is_disabled
        `,
        [
          request.user.id,
          incomeStream.stream_type,
          incomeStream.annual_amount,
          incomeStream.annual_growth_rate,
          incomeStream.start_age,
          incomeStream.start_date,
          incomeStream.end_date,
          incomeStream.is_disabled,
        ],
      );

      savedIncomeStreams.push(toIncomeStreamResponse(rows[0]));
    }

    await client.query("COMMIT");
    response.json({ items: savedIncomeStreams });
  } catch (error) {
    await client.query("ROLLBACK");
    response.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get(/^(?!\/api\/).*/, (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(distPath, "index.html"));
  });
}

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to initialize the application", error);
    process.exit(1);
  }
}

startServer();
