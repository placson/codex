import { useEffect, useMemo, useState } from "react";

const currentYear = new Date().getFullYear();
const assumedMarketReturn = 7;

const assetTypeOptions = [
  {
    value: "savings",
    label: "Savings",
    description: "Cash reserves, high-yield savings, or money market balances.",
    rateLabel: "APR %",
    defaultRate: 2.5,
    rateMode: "apr",
  },
  {
    value: "stock_portfolio",
    label: "Stock Portfolio",
    description: "Taxable brokerage or directly held market investments.",
    rateLabel: "Annual fees %",
    defaultRate: 0.25,
    rateMode: "fee",
  },
  {
    value: "401k",
    label: "401(k)",
    description: "Employer-sponsored pre-tax or Roth 401(k) balance.",
    rateLabel: "Annual fees %",
    defaultRate: 0.45,
    rateMode: "fee",
  },
  {
    value: "traditional_ira",
    label: "Traditional IRA",
    description: "Traditional IRA balance with blended annual fees.",
    rateLabel: "Annual fees %",
    defaultRate: 0.35,
    rateMode: "fee",
  },
  {
    value: "roth_ira",
    label: "Roth IRA",
    description: "Roth IRA balance with blended annual fees.",
    rateLabel: "Annual fees %",
    defaultRate: 0.35,
    rateMode: "fee",
  },
  {
    value: "403b",
    label: "403(b)",
    description: "Tax-advantaged 403(b) retirement assets.",
    rateLabel: "Annual fees %",
    defaultRate: 0.55,
    rateMode: "fee",
  },
];

const incomeStreamTypeOptions = [
  {
    value: "work_in_retirement",
    label: "Work in Retirement",
    description: "Part-time or consulting income that begins during retirement.",
  },
  {
    value: "pension",
    label: "Pension",
    description: "Defined-benefit pension or annuity-like recurring retirement income.",
  },
  {
    value: "side_job",
    label: "Side Job",
    description: "Supplemental income from freelance, seasonal, or side work.",
  },
  {
    value: "rental_income",
    label: "Rental Income",
    description: "Recurring income from owned real estate or other rental property.",
  },
  {
    value: "social_security",
    label: "Social Security",
    description: "Social Security income that begins at a chosen claiming age.",
  },
  {
    value: "other",
    label: "Other Income",
    description: "Any other recurring income stream you want to model.",
  },
];

const assetTypeMap = Object.fromEntries(
  assetTypeOptions.map((option) => [option.value, option]),
);
const incomeStreamTypeMap = Object.fromEntries(
  incomeStreamTypeOptions.map((option) => [option.value, option]),
);
const retirementAssetTypes = new Set(["401k", "traditional_ira", "roth_ira", "403b"]);

let tempAssetCounter = 0;
let tempIncomeStreamCounter = 0;

const defaultProfile = {
  fullName: "",
  email: "",
  birthDate: "",
  currentAge: 35,
  currentSalary: 0,
  retirementAge: 65,
  lifeExpectancyAge: 90,
  retirementYear: currentYear + 30,
  retirementEndYear: currentYear + 60,
};

const defaultTargets = {
  targetCity: "",
  targetAnnualSpend: 0,
  inflationRate: 3,
};
const defaultAuthForm = {
  firstName: "",
  lastName: "",
  email: "",
  code: "",
};
const chartHeight = 260;
const chartWidth = 960;
const chartScenarios = [
  {
    key: "belowAverage",
    label: "Below average",
    marketReturn: 2,
    color: "#f87171",
  },
  {
    key: "average",
    label: "Average",
    marketReturn: 5,
    color: "#f59e0b",
  },
  {
    key: "aboveAverage",
    label: "Above average",
    marketReturn: 7,
    color: "#10b981",
  },
];
const chartScenarioMap = Object.fromEntries(
  chartScenarios.map((scenario) => [scenario.key, scenario]),
);
const monteCarloTrials = 1000;
const monteCarloMeanReturn = 0.07;
const monteCarloVolatility = 0.12;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedCurrency(value) {
  const absoluteValue = Math.abs(value);
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${formatCurrency(absoluteValue)}`;
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function sanitizeNumericInput(value, maxDecimals = 2) {
  const rawSanitized = String(value ?? "").replace(/[^0-9.]/g, "");
  const sanitized = rawSanitized.startsWith(".") ? `0${rawSanitized}` : rawSanitized;
  const firstDecimalIndex = sanitized.indexOf(".");

  if (firstDecimalIndex === -1) {
    return sanitized;
  }

  const integerPart = sanitized.slice(0, firstDecimalIndex);
  const decimalPart = sanitized
    .slice(firstDecimalIndex + 1)
    .replace(/\./g, "")
    .slice(0, maxDecimals);

  return `${integerPart}.${decimalPart}`;
}

function formatCurrencyInput(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const stringValue = String(value);
  const [integerPartRaw, decimalPart] = stringValue.split(".");
  const normalizedIntegerPart = integerPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const withCommas = normalizedIntegerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decimalPart !== undefined && decimalPart !== ""
    ? `$${withCommas}.${decimalPart}`
    : `$${withCommas}`;
}

function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) {
    return 0;
  }

  const parsedBirthDate = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(parsedBirthDate.getTime())) {
    return 0;
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

function calculateYearAtAge(birthDate, age, fallbackYear = currentYear) {
  if (!birthDate) {
    return fallbackYear;
  }

  const parsedBirthDate = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(parsedBirthDate.getTime())) {
    return fallbackYear;
  }

  return parsedBirthDate.getFullYear() + age;
}

function createSeedFromString(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function nextRandom() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNormalRandom(random) {
  let spare = null;

  return function nextNormal() {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }

    let u = 0;
    let v = 0;
    while (u === 0) {
      u = random();
    }
    while (v === 0) {
      v = random();
    }

    const magnitude = Math.sqrt(-2.0 * Math.log(u));
    const theta = 2.0 * Math.PI * v;
    spare = magnitude * Math.sin(theta);
    return magnitude * Math.cos(theta);
  };
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = (sortedValues.length - 1) * ratio;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function yearsBetween(start, end) {
  return Math.max(0, end - start);
}

function projectCompound(principal, annualRatePercent, years) {
  const annualRate = annualRatePercent / 100;
  return principal * (1 + annualRate) ** years;
}

function getInflatedRetirementSpend(baseSpend, inflationRatePercent, yearsInRetirement) {
  return projectCompound(baseSpend, inflationRatePercent, Math.max(0, yearsInRetirement));
}

function nextTempAssetId() {
  tempAssetCounter += 1;
  return `temp-${tempAssetCounter}`;
}

function buildAsset(assetType = "savings") {
  const definition = assetTypeMap[assetType] ?? assetTypeMap.savings;

  return {
    id: nextTempAssetId(),
    assetType: definition.value,
    amount: 0,
    rate: definition.defaultRate,
  };
}

function normalizeAsset(rawAsset, index = 0) {
  const definition = assetTypeMap[rawAsset?.assetType] ?? assetTypeMap.savings;
  const rawId = rawAsset?.id;

  return {
    id: rawId ?? `temp-${index + 1}`,
    assetType: definition.value,
    amount: Number(rawAsset?.amount ?? 0),
    rate: Number(rawAsset?.rate ?? definition.defaultRate),
  };
}

function normalizeAssetsResponse(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map(normalizeAsset);
}

function nextTempIncomeStreamId() {
  tempIncomeStreamCounter += 1;
  return `income-temp-${tempIncomeStreamCounter}`;
}

function defaultStartDate() {
  return `${currentYear}-01-01`;
}

function buildIncomeStream(streamType = "other") {
  const definition = incomeStreamTypeMap[streamType] ?? incomeStreamTypeMap.other;

  return {
    id: nextTempIncomeStreamId(),
    streamType: definition.value,
    annualAmount: 0,
    annualGrowthRate: 0,
    startAge: 67,
    startDate: defaultStartDate(),
    endDate: "",
    isDisabled: false,
  };
}

function normalizeIncomeStream(rawIncomeStream, index = 0) {
  const definition = incomeStreamTypeMap[rawIncomeStream?.streamType] ?? incomeStreamTypeMap.other;
  const rawId = rawIncomeStream?.id;

  return {
    id: rawId ?? `income-temp-${index + 1}`,
    streamType: definition.value,
    annualAmount: Number(rawIncomeStream?.annualAmount ?? 0),
    annualGrowthRate: Number(rawIncomeStream?.annualGrowthRate ?? 0),
    startAge: rawIncomeStream?.startAge === "" ? "" : Number(rawIncomeStream?.startAge ?? 67),
    startDate: String(rawIncomeStream?.startDate ?? defaultStartDate()).slice(0, 10),
    endDate: rawIncomeStream?.endDate ? String(rawIncomeStream.endDate).slice(0, 10) : "",
    isDisabled: Boolean(rawIncomeStream?.isDisabled),
  };
}

function getIncomeStartYear(incomeStream, birthDate) {
  if (incomeStream.streamType === "social_security") {
    if (!birthDate || incomeStream.startAge === "") {
      return Infinity;
    }

    return calculateYearAtAge(birthDate, Number(incomeStream.startAge || 0), Infinity);
  }

  return Number(String(incomeStream.startDate).slice(0, 4));
}

function isIncomeActiveInYear(incomeStream, year, birthDate) {
  const startYear = getIncomeStartYear(incomeStream, birthDate);
  const endYear = incomeStream.endDate
    ? Number(String(incomeStream.endDate).slice(0, 4))
    : Infinity;

  return startYear <= year && endYear >= year;
}

function isRetirementAssetType(assetType) {
  return retirementAssetTypes.has(assetType);
}

function getInitialRetirementBuckets(assets, yearsToRetirement, marketReturnPercent = 7) {
  const buckets = assets.reduce(
    (totals, asset) => {
      const definition = assetTypeMap[asset.assetType] ?? assetTypeMap.savings;
      const currentAmount = Number(asset.amount);

      if (definition.rateMode === "apr") {
        const projectedSavings = projectCompound(currentAmount, Number(asset.rate), yearsToRetirement);
        return {
          savings: totals.savings + projectedSavings,
          savingsWeightedRate:
            totals.savingsWeightedRate + projectedSavings * (Number(asset.rate) / 100),
          availableMarket: totals.availableMarket,
          retirementMarket: totals.retirementMarket,
        };
      }

      const projectedMarket = projectCompound(currentAmount, marketReturnPercent, yearsToRetirement);

      if (isRetirementAssetType(asset.assetType)) {
        return {
          savings: totals.savings,
          savingsWeightedRate: totals.savingsWeightedRate,
          availableMarket: totals.availableMarket,
          retirementMarket: totals.retirementMarket + projectedMarket,
        };
      }

      return {
        savings: totals.savings,
        savingsWeightedRate: totals.savingsWeightedRate,
        availableMarket: totals.availableMarket + projectedMarket,
        retirementMarket: totals.retirementMarket,
      };
    },
    { savings: 0, savingsWeightedRate: 0, availableMarket: 0, retirementMarket: 0 },
  );

  return {
    ...buckets,
    effectiveSavingsGrowthRate:
      buckets.savings > 0 ? buckets.savingsWeightedRate / buckets.savings : 0,
  };
}

function getActiveRetirementIncome(incomeStreams, year, birthDate) {
  return incomeStreams
    .filter(
      (incomeStream) =>
        !incomeStream.isDisabled && isIncomeActiveInYear(incomeStream, year, birthDate),
    )
    .reduce((total, incomeStream) => {
      const startYear = getIncomeStartYear(incomeStream, birthDate);
      const yearsActive = Math.max(0, year - startYear);
      const annualGrowthRate =
        incomeStream.streamType === "rental_income" ||
        incomeStream.streamType === "social_security"
          ? Number(incomeStream.annualGrowthRate)
          : 0;

      return (
        total +
        projectCompound(Number(incomeStream.annualAmount), annualGrowthRate, yearsActive)
      );
    }, 0);
}

function buildDeterministicRetirementSeries({
  assets,
  incomeStreams,
  birthDate,
  yearsToRetirement,
  retirementYear,
  retirementDurationYears,
  ageAtRetirement,
  desiredRetirementSpend,
  inflationRatePercent,
  marketReturnPercent,
}) {
  const initialBuckets = getInitialRetirementBuckets(assets, yearsToRetirement, marketReturnPercent);
  const retirementSeries = [];
  let remainingSavings = initialBuckets.savings;
  let remainingAvailableMarket = initialBuckets.availableMarket;
  let remainingRetirementMarket = initialBuckets.retirementMarket;

  for (let offset = 0; offset < retirementDurationYears; offset += 1) {
    const year = retirementYear + offset;
    const age = ageAtRetirement + offset;
    const totalValue =
      remainingSavings + remainingAvailableMarket + remainingRetirementMarket;

    retirementSeries.push({
      year,
      age,
      value: Math.max(0, totalValue),
    });

    if (offset === retirementDurationYears - 1) {
      break;
    }

    const yearlyRetirementIncome = getActiveRetirementIncome(incomeStreams, year, birthDate);
    const inflatedSpend = getInflatedRetirementSpend(
      desiredRetirementSpend,
      inflationRatePercent,
      offset,
    );
    const yearlyWithdrawal = Math.max(0, inflatedSpend - yearlyRetirementIncome);

    remainingSavings *= 1 + initialBuckets.effectiveSavingsGrowthRate;
    remainingAvailableMarket *= 1 + marketReturnPercent / 100;
    remainingRetirementMarket *= 1 + marketReturnPercent / 100;

    let withdrawalRemaining = yearlyWithdrawal;
    const withdrawalFromSavings = Math.min(remainingSavings, withdrawalRemaining);
    remainingSavings -= withdrawalFromSavings;
    withdrawalRemaining -= withdrawalFromSavings;

    if (withdrawalRemaining > 0) {
      const withdrawalFromAvailableMarket = Math.min(
        remainingAvailableMarket,
        withdrawalRemaining,
      );
      remainingAvailableMarket -= withdrawalFromAvailableMarket;
      withdrawalRemaining -= withdrawalFromAvailableMarket;
    }

    if (withdrawalRemaining > 0 && age >= 59.5) {
      const withdrawalFromRetirementMarket = Math.min(
        remainingRetirementMarket,
        withdrawalRemaining,
      );
      remainingRetirementMarket -= withdrawalFromRetirementMarket;
    }
  }

  return {
    series: retirementSeries,
    finalBalanceAtEndOfLife:
      retirementSeries.length > 0 ? retirementSeries[retirementSeries.length - 1].value : 0,
  };
}

function buildProjectedRetirementAssets(
  assets,
  yearsToRetirement,
  marketReturnPercent,
) {
  const assetCounts = assets.reduce((counts, asset) => {
    const key = asset.assetType;
    return {
      ...counts,
      [key]: (counts[key] ?? 0) + 1,
    };
  }, {});
  const seenCounts = {};

  return assets.map((asset, index) => {
    const definition = assetTypeMap[asset.assetType] ?? assetTypeMap.savings;
    const nextSeenCount = (seenCounts[asset.assetType] ?? 0) + 1;
    seenCounts[asset.assetType] = nextSeenCount;

    const label =
      assetCounts[asset.assetType] > 1
        ? `${definition.label} ${nextSeenCount}`
        : definition.label;
    const growthRatePercent =
      definition.rateMode === "apr" ? Number(asset.rate) : marketReturnPercent;

    return {
      id: asset.id ?? `asset-${index + 1}`,
      label,
      assetType: definition.value,
      isRetirementAsset: isRetirementAssetType(definition.value),
      isSavingsAsset: definition.rateMode === "apr",
      growthRateDecimal: growthRatePercent / 100,
      balance: projectCompound(Number(asset.amount), growthRatePercent, yearsToRetirement),
    };
  });
}

function buildRetirementTimetable({
  assets,
  incomeStreams,
  birthDate,
  yearsToRetirement,
  retirementYear,
  retirementDurationYears,
  ageAtRetirement,
  desiredRetirementSpend,
  inflationRatePercent,
  marketReturnPercent,
}) {
  const projectedAssets = buildProjectedRetirementAssets(
    assets,
    yearsToRetirement,
    marketReturnPercent,
  );
  let balances = projectedAssets.map((asset) => ({ ...asset }));
  const rows = [];

  for (let offset = 0; offset < retirementDurationYears; offset += 1) {
    const year = retirementYear + offset;
    const age = ageAtRetirement + offset;
    const activeIncome = getActiveRetirementIncome(incomeStreams, year, birthDate);
    const targetSpend = getInflatedRetirementSpend(
      desiredRetirementSpend,
      inflationRatePercent,
      offset,
    );
    const withdrawalNeeded = Math.max(0, targetSpend - activeIncome);
    let withdrawalRemaining = withdrawalNeeded;

    const assetSnapshots = balances.map((asset) => {
      const balanceStart = asset.balance;
      const growth = balanceStart * asset.growthRateDecimal;
      const balanceAfterGrowth = balanceStart + growth;

      return {
        ...asset,
        balanceStart,
        growth,
        withdrawal: 0,
        balanceEnd: balanceAfterGrowth,
      };
    });

    const withdrawFromAssets = (predicate) => {
      assetSnapshots.forEach((asset) => {
        if (!predicate(asset) || withdrawalRemaining <= 0) {
          return;
        }

        const withdrawal = Math.min(asset.balanceEnd, withdrawalRemaining);
        asset.withdrawal += withdrawal;
        asset.balanceEnd -= withdrawal;
        withdrawalRemaining -= withdrawal;
      });
    };

    withdrawFromAssets((asset) => asset.isSavingsAsset && !asset.isRetirementAsset);
    withdrawFromAssets((asset) => !asset.isSavingsAsset && !asset.isRetirementAsset);

    if (age >= 59.5) {
      withdrawFromAssets((asset) => asset.isRetirementAsset);
    }

    const totalStart = assetSnapshots.reduce((sum, asset) => sum + asset.balanceStart, 0);
    const totalGrowth = assetSnapshots.reduce((sum, asset) => sum + asset.growth, 0);
    const totalWithdrawals = assetSnapshots.reduce((sum, asset) => sum + asset.withdrawal, 0);
    const totalEnd = assetSnapshots.reduce((sum, asset) => sum + asset.balanceEnd, 0);

    rows.push({
      year,
      age,
      activeIncome,
      targetSpend,
      incomeGap: activeIncome - targetSpend,
      withdrawalNeeded,
      unfundedShortfall: withdrawalRemaining,
      totalStart,
      totalGrowth,
      totalWithdrawals,
      totalEnd,
      assetSnapshots,
    });

    balances = assetSnapshots.map((asset) => ({
      ...asset,
      balance: asset.balanceEnd,
    }));
  }

  return {
    columns: projectedAssets.map(({ id, label }) => ({ id, label })),
    rows,
    finalBalanceAtEndOfLife: rows.length > 0 ? rows[rows.length - 1].totalEnd : 0,
  };
}

function normalizeIncomeStreamsResponse(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map(normalizeIncomeStream);
}

function RetirementAssetChart({ scenarios = [], inflationRate = 0 }) {
  const allPoints = scenarios.flatMap((scenario) => scenario.series ?? []);

  if (allPoints.length === 0) {
    return null;
  }

  const [hoveredPoint, setHoveredPoint] = useState(null);
  const tooltipWidth = 168;
  const tooltipHeight = 64;

  const padding = { top: 18, right: 18, bottom: 40, left: 78 };
  const values = allPoints.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const valueRange = Math.max(maxValue - minValue, 1);
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const pointCount = scenarios[0]?.series?.length ?? 0;
  const xStep = pointCount > 1 ? innerWidth / (pointCount - 1) : 0;

  const tooltipX = hoveredPoint
    ? Math.min(
        Math.max(hoveredPoint.x, tooltipWidth / 2 + 8),
        chartWidth - tooltipWidth / 2 - 8,
      )
    : 0;
  const tooltipY = hoveredPoint
    ? hoveredPoint.y <= tooltipHeight + 24
      ? hoveredPoint.y + 18
      : hoveredPoint.y - 18
    : 0;
  const tooltipPositionClass =
    hoveredPoint && hoveredPoint.y <= tooltipHeight + 24
      ? "chart-tooltip--below"
      : "chart-tooltip--above";

  const yAxisLabels = [maxValue, maxValue - valueRange / 2, minValue];
  const xAxisLabels =
    pointCount <= 6
      ? scenarios[0]?.series ?? []
      : [
          scenarios[0]?.series?.[0],
          scenarios[0]?.series?.[Math.floor((pointCount - 1) / 2)],
          scenarios[0]?.series?.[pointCount - 1],
        ].filter(Boolean);

  return (
    <div className="chart-shell">
      <div className="chart-copy">
        <p className="section-kicker">Retirement Path</p>
        <h2>Projected asset value by retirement year</h2>
        <p className="projection-copy">
          Assumes savings continue at their entered APR, market-invested assets follow the
          scenario return shown, and retirement spending inflates at {inflationRate}% annually.
          Income shortages are withdrawn from available assets first, then from retirement
          accounts once the modeled retiree reaches age 59.5.
        </p>
      </div>

      <div className="chart-frame">
        {hoveredPoint ? (
          <div
            className={`chart-tooltip ${tooltipPositionClass}`}
            style={{
              left: `${tooltipX}px`,
              top: `${tooltipY}px`,
            }}
          >
            <strong>{hoveredPoint.label}</strong>
            <span>Age {hoveredPoint.age}</span>
            <span>{formatCurrency(hoveredPoint.value)}</span>
          </div>
        ) : null}
        <div className="chart-legend">
          {scenarios.map((scenario) => (
            <div key={scenario.key} className="chart-legend__item">
              <span
                className="chart-legend__swatch"
                style={{ backgroundColor: scenario.color }}
              />
              <span>{scenario.label} ({scenario.marketReturn}%)</span>
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Retirement asset projection chart">
          {yAxisLabels.map((value) => {
            const y =
              padding.top + ((maxValue - value) / valueRange) * innerHeight;

            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  className="chart-grid-line"
                />
                <text x={padding.left - 12} y={y + 4} className="chart-axis-label chart-axis-label--left">
                  {formatCompactCurrency(value)}
                </text>
              </g>
            );
          })}

          {xAxisLabels.map((point) => {
            const index = scenarios[0]?.series?.findIndex((entry) => entry.year === point.year) ?? 0;
            const x = padding.left + index * xStep;

            return (
              <g key={point.year}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={chartHeight - padding.bottom}
                  className="chart-grid-line chart-grid-line--vertical"
                />
                <text
                  x={x}
                  y={chartHeight - 14}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {point.year}
                </text>
              </g>
            );
          })}

          {scenarios.map((scenario) => {
            const polylinePoints = scenario.series
              .map((point, index) => {
                const x = padding.left + index * xStep;
                const y =
                  padding.top + ((maxValue - point.value) / valueRange) * innerHeight;
                return `${x},${y}`;
              })
              .join(" ");

            return (
              <polyline
                key={scenario.key}
                fill="none"
                stroke={scenario.color}
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={polylinePoints}
              />
            );
          })}

          {scenarios.map((scenario) =>
            scenario.series.map((point, index) => {
              const x = padding.left + index * xStep;
              const y =
                padding.top + ((maxValue - point.value) / valueRange) * innerHeight;

              return (
                <circle
                  key={`${scenario.key}-${point.year}-${index}`}
                  cx={x}
                  cy={y}
                  r="4"
                  className="chart-dot"
                  style={{ fill: scenario.color }}
                  onMouseEnter={() =>
                    setHoveredPoint({
                      label: `${scenario.label} (${scenario.marketReturn}%)`,
                      age: point.age,
                      value: point.value,
                      x,
                      y,
                    })
                  }
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

function ProjectionCard({ label, value, tone = "default" }) {
  return (
    <div className={`projection-card projection-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScenarioToggle({ value, onChange }) {
  return (
    <div className="scenario-toggle" role="radiogroup" aria-label="Retirement runway market scenario">
      {chartScenarios.map((scenario) => (
        <button
          key={scenario.key}
          type="button"
          role="radio"
          aria-checked={value === scenario.key}
          className={`scenario-toggle__button ${
            value === scenario.key
              ? `scenario-toggle__button--active scenario-toggle__button--${scenario.key}`
              : ""
          }`}
          onClick={() => onChange(scenario.key)}
        >
          {scenario.label} ({scenario.marketReturn}%)
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  type = "text",
  name,
  value,
  onChange,
  format = "plain",
  step,
  min,
  placeholder,
  readOnly,
  className = "",
}) {
  const inputType = type === "number" ? "text" : type;
  const [isFocused, setIsFocused] = useState(false);
  const displayValue =
    type === "number" && format === "currency" && !isFocused && !readOnly
      ? formatCurrencyInput(value)
      : type === "number" && format === "currency" && readOnly
        ? formatCurrencyInput(value)
        : value ?? "";

  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      <input
        type={inputType}
        name={name}
        value={displayValue}
        onChange={(event) => {
          if (type === "number") {
            onChange({
              target: {
                name,
                value: sanitizeNumericInput(event.target.value, 2),
                type: "number",
              },
            });
            return;
          }

          onChange(event);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        step={step}
        min={min}
        placeholder={placeholder}
        readOnly={readOnly}
        inputMode={type === "number" ? "decimal" : undefined}
      />
    </label>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <label className="field field--select">
      <span>{label}</span>
      <select className="select-field__input" name={name} value={value} onChange={onChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthScreen({
  mode,
  authForm,
  authStep,
  authStatus,
  authError,
  debugCode,
  onModeChange,
  onChange,
  onRequestCode,
  onVerifyCode,
}) {
  return (
    <main className="app-shell app-shell--auth">
      <div className="hero hero--auth">
        <p className="eyebrow">Retirement Calculator</p>
        <h1>Ready to retire?</h1>
        <p className="hero__lede">
          Create an account or sign in with a one-time email code to keep each retirement
          plan private to its owner.
        </p>
      </div>

      <section className="auth-layout">
        <section className="panel auth-panel">
          <div className="auth-panel__tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={`auth-panel__tab ${mode === "signup" ? "auth-panel__tab--active" : ""}`}
              onClick={() => onModeChange("signup")}
            >
              Register
            </button>
            <button
              type="button"
              className={`auth-panel__tab ${mode === "signin" ? "auth-panel__tab--active" : ""}`}
              onClick={() => onModeChange("signin")}
            >
              Sign In
            </button>
          </div>

          <div className="auth-panel__body">
            <div>
              <p className="section-kicker">
                {mode === "signup" ? "Create Account" : "Welcome Back"}
              </p>
              <h2>{mode === "signup" ? "Register with email verification" : "Sign in with a one-time code"}</h2>
              <p className="projection-copy">
                {mode === "signup"
                  ? "We collect your first name, last name, and email, then verify the account with a one-time code."
                  : "Enter your email and we will send a one-time sign-in code."}
              </p>
            </div>

            {authError ? <div className="error-banner">{authError}</div> : null}
            {authStatus ? <div className="auth-status">{authStatus}</div> : null}
            {debugCode ? (
              <div className="auth-debug-code">
                Development code: <strong>{debugCode}</strong>
              </div>
            ) : null}

            <div className="profile-grid">
              {mode === "signup" ? (
                <>
                  <Field
                    label="First name"
                    name="firstName"
                    value={authForm.firstName}
                    onChange={onChange}
                    placeholder="Alex"
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    value={authForm.lastName}
                    onChange={onChange}
                    placeholder="Morgan"
                  />
                </>
              ) : null}

              <Field
                label="Email"
                type="email"
                name="email"
                value={authForm.email}
                onChange={onChange}
                placeholder="alex@example.com"
              />

              {authStep === "verify" ? (
                <Field
                  label="Verification code"
                  name="code"
                  value={authForm.code}
                  onChange={onChange}
                  placeholder="123456"
                />
              ) : null}
            </div>

            <div className="auth-panel__actions">
              {authStep === "verify" ? (
                <>
                  <button type="button" className="button button--secondary" onClick={onRequestCode}>
                    Resend Code
                  </button>
                  <button type="button" onClick={onVerifyCode}>
                    Verify and Continue
                  </button>
                </>
              ) : (
                <button type="button" onClick={onRequestCode}>
                  Send Verification Code
                </button>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function AssetListItem({ asset, onChange, onRemove }) {
  const definition = assetTypeMap[asset.assetType] ?? assetTypeMap.savings;

  return (
    <div className="asset-row">
      <div className="asset-row__header">
        <div className="asset-row__copy">
          <h3>{definition.label}</h3>
          <p>{definition.description}</p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => onRemove(asset.id)}
        >
          Remove
        </button>
      </div>

      <div className="asset-row__inputs asset-row__inputs--wide">
        <SelectField
          label="Asset type"
          name="assetType"
          value={asset.assetType}
          onChange={(event) => onChange(asset.id, "assetType", event.target.value)}
          options={assetTypeOptions}
        />
        <Field
          label="Amount"
          type="number"
          name="amount"
          value={asset.amount}
          format="currency"
          onChange={(event) => onChange(asset.id, "amount", event.target.value)}
          step="0.01"
          min="0"
        />
        <Field
          label={definition.rateLabel}
          type="number"
          name="rate"
          value={asset.rate}
          onChange={(event) => onChange(asset.id, "rate", event.target.value)}
          step="0.01"
          min="0"
        />
      </div>
    </div>
  );
}

function IncomeStreamListItem({ incomeStream, onChange, onRemove }) {
  const definition = incomeStreamTypeMap[incomeStream.streamType] ?? incomeStreamTypeMap.other;
  const isRentalIncome = incomeStream.streamType === "rental_income";
  const isSocialSecurity = incomeStream.streamType === "social_security";
  const incomeLayoutClass = isSocialSecurity
    ? "asset-row__inputs--income-social"
    : isRentalIncome
      ? "asset-row__inputs--income-rental"
      : "asset-row__inputs--income-dated";

  return (
    <div className={`asset-row ${incomeStream.isDisabled ? "asset-row--disabled" : ""}`}>
      <div className="asset-row__header">
        <div className="asset-row__copy">
          <h3>{definition.label}</h3>
          <p>{definition.description}</p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onChange(incomeStream.id, "isDisabled", !incomeStream.isDisabled)}
          >
            {incomeStream.isDisabled ? "Enable" : "Disable"}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => onRemove(incomeStream.id)}
          >
            Remove
          </button>
        </div>
      </div>

      <div
        className={`asset-row__inputs asset-row__inputs--income ${incomeLayoutClass}`}
      >
        <div className="income-grid-item income-grid-item--type">
          <SelectField
            label="Income type"
            name="streamType"
            value={incomeStream.streamType}
            onChange={(event) => onChange(incomeStream.id, "streamType", event.target.value)}
            options={incomeStreamTypeOptions}
          />
        </div>
        <Field
          label="Annual amount"
          type="number"
          name="annualAmount"
          value={incomeStream.annualAmount}
          format="currency"
          onChange={(event) => onChange(incomeStream.id, "annualAmount", event.target.value)}
          step="0.01"
          min="0"
          className={isSocialSecurity ? "field--income-amount field--income-amount-social" : "field--income-amount"}
        />
        {isSocialSecurity ? (
          <Field
            label="Claiming age"
            type="number"
            name="startAge"
            value={incomeStream.startAge}
            onChange={(event) => onChange(incomeStream.id, "startAge", event.target.value)}
            step="0.01"
            min="0"
            placeholder="67"
            className="field--income-start-age"
          />
        ) : null}
        {isSocialSecurity ? (
          <Field
            label="Annual COLA %"
            type="number"
            name="annualGrowthRate"
            value={incomeStream.annualGrowthRate}
            onChange={(event) =>
              onChange(incomeStream.id, "annualGrowthRate", event.target.value)
            }
            step="0.01"
            min="0"
            placeholder="2.50"
            className="field--income-cola"
          />
        ) : null}
        {isRentalIncome ? (
          <Field
            label="Annual rental increase %"
            type="number"
            name="annualGrowthRate"
            value={incomeStream.annualGrowthRate}
            onChange={(event) =>
              onChange(incomeStream.id, "annualGrowthRate", event.target.value)
            }
            step="0.01"
            min="0"
            placeholder="3.50"
            className="field--income-growth"
          />
        ) : null}
        {isSocialSecurity ? null : (
          <Field
            label="Start date"
            type="date"
            name="startDate"
            value={incomeStream.startDate}
            onChange={(event) => onChange(incomeStream.id, "startDate", event.target.value)}
            className={isRentalIncome ? "field--income-date field--income-date-start" : ""}
          />
        )}
        {isSocialSecurity ? null : (
          <Field
            label="End date"
            type="date"
            name="endDate"
            value={incomeStream.endDate}
            onChange={(event) => onChange(incomeStream.id, "endDate", event.target.value)}
            className={isRentalIncome ? "field--income-date field--income-date-end" : ""}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signup");
  const [authStep, setAuthStep] = useState("request");
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [profile, setProfile] = useState(defaultProfile);
  const [targets, setTargets] = useState(defaultTargets);
  const [assets, setAssets] = useState([]);
  const [incomeStreams, setIncomeStreams] = useState([]);
  const [newAssetType, setNewAssetType] = useState("savings");
  const [newIncomeStreamType, setNewIncomeStreamType] = useState("work_in_retirement");
  const [selectedScenarioKey, setSelectedScenarioKey] = useState("aboveAverage");
  const [selectedTimeTableScenarioKey, setSelectedTimeTableScenarioKey] = useState("aboveAverage");
  const [isTimeTableExpanded, setIsTimeTableExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const [assetStatus, setAssetStatus] = useState("");
  const [incomeStatus, setIncomeStatus] = useState("");
  const [error, setError] = useState("");
  const selectedScenario = chartScenarioMap[selectedScenarioKey] ?? chartScenarios[2];
  const selectedTimeTableScenario =
    chartScenarioMap[selectedTimeTableScenarioKey] ?? chartScenarios[2];
  const profileTitle = profile.birthDate
    ? `Profile (Age ${profile.currentAge})`
    : "Profile";

  function resetPlannerState() {
    setProfile(defaultProfile);
    setTargets(defaultTargets);
    setAssets([]);
    setIncomeStreams([]);
    setProfileStatus("");
    setTargetStatus("");
    setAssetStatus("");
    setIncomeStatus("");
    setError("");
  }

  async function loadPlannerData() {
    try {
      setLoading(true);
      setError("");

      const [profileResponse, targetsResponse, assetsResponse, incomeResponse] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/retirement-targets"),
        fetch("/api/assets"),
        fetch("/api/income-streams"),
      ]);

      if (!profileResponse.ok || !targetsResponse.ok || !assetsResponse.ok || !incomeResponse.ok) {
        throw new Error("Unable to load retirement planner data.");
      }

      const [profileData, targetData, assetData, incomeData] = await Promise.all([
        profileResponse.json(),
        targetsResponse.json(),
        assetsResponse.json(),
        incomeResponse.json(),
      ]);

      setProfile({ ...defaultProfile, ...profileData });
      setTargets({ ...defaultTargets, ...targetData });
      setAssets(normalizeAssetsResponse(assetData));
      setIncomeStreams(normalizeIncomeStreamsResponse(incomeData));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const response = await fetch("/api/auth/session");

        if (!response.ok) {
          throw new Error("Unable to load session.");
        }

        const sessionData = await response.json();
        setSession(sessionData);
      } catch (_sessionError) {
        setSession({ user: null });
      } finally {
        setAuthLoading(false);
      }
    }

    bootstrapSession();
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!session?.user) {
      resetPlannerState();
      return;
    }

    loadPlannerData();
  }, [authLoading, session?.user?.id]);

  const projection = useMemo(() => {
    const selectedMarketReturn = selectedScenario.marketReturn;
    const yearsToRetirement =
      profile.retirementYear >= currentYear
        ? yearsBetween(currentYear, profile.retirementYear)
        : yearsBetween(profile.currentAge, profile.retirementAge);
    const yearsInRetirement = yearsBetween(profile.retirementYear, profile.retirementEndYear);
    const retirementDurationYears = Math.max(1, yearsInRetirement + 1);
    const ageAtRetirement = profile.currentAge + yearsToRetirement;

    const summary = assets.reduce(
      (totals, asset) => {
        const definition = assetTypeMap[asset.assetType] ?? assetTypeMap.savings;
        const currentAmount = Number(asset.amount);
        const annualRate =
          definition.rateMode === "apr"
            ? Number(asset.rate)
            : Math.max(-100, selectedMarketReturn - Number(asset.rate));
        const projectedAmount = projectCompound(currentAmount, annualRate, yearsToRetirement);

        return {
          currentAssets: totals.currentAssets + currentAmount,
          totalAtRetirement: totals.totalAtRetirement + projectedAmount,
        };
      },
      { currentAssets: 0, totalAtRetirement: 0, savingsAtRetirement: 0, marketAtRetirement: 0 },
    );

    const retirementIncomeStreams = getActiveRetirementIncome(
      incomeStreams,
      profile.retirementYear,
      profile.birthDate,
    );
    const desiredRetirementSpend = Number(targets.targetAnnualSpend);
    const inflationRate = Number(targets.inflationRate);
    const spendAtRetirementStart = desiredRetirementSpend;
    const sustainableAnnualSpend = summary.totalAtRetirement * 0.04;
    const incomeGapAtRetirementStart = retirementIncomeStreams - spendAtRetirementStart;
    const incomeCoversRetirementSpend = incomeGapAtRetirementStart >= 0;
    const initialBuckets = getInitialRetirementBuckets(
      assets,
      yearsToRetirement,
      selectedMarketReturn,
    );
    const yearsUntilRetirementAccountsAccessible = Math.max(0, Math.ceil(59.5 - ageAtRetirement));
    const bridgeAssetsAtRetirement = initialBuckets.savings + initialBuckets.availableMarket;
    let bridgeSavings = initialBuckets.savings;
    let bridgeAvailableMarket = initialBuckets.availableMarket;
    let bridgeCoveredToAccessAge = true;
    let bridgeShortfall = 0;

    for (let offset = 0; offset < yearsUntilRetirementAccountsAccessible; offset += 1) {
      const year = profile.retirementYear + offset;
      const yearlyRetirementIncome = getActiveRetirementIncome(
        incomeStreams,
        year,
        profile.birthDate,
      );

      const inflatedSpend = getInflatedRetirementSpend(
        desiredRetirementSpend,
        inflationRate,
        offset,
      );
      const yearlyWithdrawal = Math.max(0, inflatedSpend - yearlyRetirementIncome);

      bridgeSavings *= 1 + initialBuckets.effectiveSavingsGrowthRate;
      bridgeAvailableMarket *= 1 + selectedMarketReturn / 100;

      let withdrawalRemaining = yearlyWithdrawal;
      const withdrawalFromSavings = Math.min(bridgeSavings, withdrawalRemaining);
      bridgeSavings -= withdrawalFromSavings;
      withdrawalRemaining -= withdrawalFromSavings;

      if (withdrawalRemaining > 0) {
        const withdrawalFromAvailableMarket = Math.min(
          bridgeAvailableMarket,
          withdrawalRemaining,
        );
        bridgeAvailableMarket -= withdrawalFromAvailableMarket;
        withdrawalRemaining -= withdrawalFromAvailableMarket;
      }

      if (withdrawalRemaining > 0) {
        bridgeCoveredToAccessAge = false;
        bridgeShortfall = withdrawalRemaining;
        break;
      }
    }

    const bridgeBalanceAtAccessAge = Math.max(0, bridgeSavings + bridgeAvailableMarket);
    const chartSeries = chartScenarios.map((scenario) => {
      const result = buildDeterministicRetirementSeries({
        assets,
        incomeStreams,
        birthDate: profile.birthDate,
        yearsToRetirement,
        retirementYear: profile.retirementYear,
        retirementDurationYears,
        ageAtRetirement,
        desiredRetirementSpend,
        inflationRatePercent: inflationRate,
        marketReturnPercent: scenario.marketReturn,
      });

      return {
        ...scenario,
        series: result.series,
        finalBalanceAtEndOfLife: result.finalBalanceAtEndOfLife,
      };
    });
    const timeTables = chartScenarios.reduce((tables, scenario) => {
      return {
        ...tables,
        [scenario.key]: buildRetirementTimetable({
          assets,
          incomeStreams,
          birthDate: profile.birthDate,
          yearsToRetirement,
          retirementYear: profile.retirementYear,
          retirementDurationYears,
          ageAtRetirement,
          desiredRetirementSpend,
          inflationRatePercent: inflationRate,
          marketReturnPercent: scenario.marketReturn,
        }),
      };
    }, {});
    const baseScenario =
      chartSeries.find((scenario) => scenario.key === selectedScenario.key) ??
      chartSeries[chartSeries.length - 1];
    const finalBalanceAtEndOfLife =
      timeTables[selectedScenario.key]?.finalBalanceAtEndOfLife ??
      baseScenario?.finalBalanceAtEndOfLife ??
      0;

    return {
      yearsToRetirement,
      yearsInRetirement,
      currentAssets: summary.currentAssets,
      totalAtRetirement: summary.totalAtRetirement,
      sustainableAnnualSpend,
      targetAnnualSpend: desiredRetirementSpend,
      spendAtRetirementStart,
      inflationRate,
      targetSpendGap: sustainableAnnualSpend - spendAtRetirementStart,
      retirementIncomeStreams,
      incomeCoversRetirementSpend,
      ageAtRetirement,
      hasImmediateAccessToAllAssets: ageAtRetirement >= 59.5,
      selectedMarketReturn,
      selectedScenarioLabel: selectedScenario.label,
      incomeGapAtRetirementStart,
      bridgeAssetsAtRetirement,
      yearsUntilRetirementAccountsAccessible,
      bridgeCoveredToAccessAge,
      bridgeShortfall,
      bridgeBalanceAtAccessAge,
      chartSeries,
      timeTables,
      finalBalanceAtEndOfLife,
    };
  }, [assets, incomeStreams, profile, selectedScenario, targets]);

  const selectedTimeTable =
    projection.timeTables?.[selectedTimeTableScenario.key] ?? { columns: [], rows: [] };
  const runwayTimeTable =
    projection.timeTables?.[selectedScenario.key] ?? { columns: [], rows: [] };

  const monteCarlo = useMemo(() => {
    const yearsToRetirement =
      profile.retirementYear >= currentYear
        ? yearsBetween(currentYear, profile.retirementYear)
        : yearsBetween(profile.currentAge, profile.retirementAge);
    const yearsInRetirement = yearsBetween(profile.retirementYear, profile.retirementEndYear);
    const retirementDurationYears = Math.max(1, yearsInRetirement + 1);
    const ageAtRetirement = profile.currentAge + yearsToRetirement;
    const desiredRetirementSpend = Number(targets.targetAnnualSpend);
    const inflationRate = Number(targets.inflationRate);
    const initialBuckets = getInitialRetirementBuckets(assets, yearsToRetirement);
    const simulationSeed = createSeedFromString(
      JSON.stringify({
        assets,
        incomeStreams,
        profile,
        targets,
        monteCarloTrials,
        monteCarloMeanReturn,
        monteCarloVolatility,
      }),
    );
    const random = createSeededRandom(simulationSeed);
    const randomNormal = createNormalRandom(random);
    let successCount = 0;
    const endingBalances = [];

    for (let trial = 0; trial < monteCarloTrials; trial += 1) {
      let remainingSavings = initialBuckets.savings;
      let remainingAvailableMarket = initialBuckets.availableMarket;
      let remainingRetirementMarket = initialBuckets.retirementMarket;
      let succeeded = true;

      for (let offset = 0; offset < retirementDurationYears; offset += 1) {
        const year = profile.retirementYear + offset;
        const currentAgeInRetirement = ageAtRetirement + offset;
        const yearlyRetirementIncome = getActiveRetirementIncome(
          incomeStreams,
          year,
          profile.birthDate,
        );
        const inflatedSpend = getInflatedRetirementSpend(
          desiredRetirementSpend,
          inflationRate,
          offset,
        );
        const yearlyWithdrawal = Math.max(0, inflatedSpend - yearlyRetirementIncome);
        const marketReturn = Math.max(-0.95, monteCarloMeanReturn + randomNormal() * monteCarloVolatility);

        remainingSavings *= 1 + initialBuckets.effectiveSavingsGrowthRate;
        remainingAvailableMarket *= 1 + marketReturn;
        remainingRetirementMarket *= 1 + marketReturn;

        let withdrawalRemaining = yearlyWithdrawal;
        const withdrawalFromSavings = Math.min(remainingSavings, withdrawalRemaining);
        remainingSavings -= withdrawalFromSavings;
        withdrawalRemaining -= withdrawalFromSavings;

        if (withdrawalRemaining > 0) {
          const withdrawalFromAvailableMarket = Math.min(
            remainingAvailableMarket,
            withdrawalRemaining,
          );
          remainingAvailableMarket -= withdrawalFromAvailableMarket;
          withdrawalRemaining -= withdrawalFromAvailableMarket;
        }

        if (withdrawalRemaining > 0 && currentAgeInRetirement >= 59.5) {
          const withdrawalFromRetirementMarket = Math.min(
            remainingRetirementMarket,
            withdrawalRemaining,
          );
          remainingRetirementMarket -= withdrawalFromRetirementMarket;
          withdrawalRemaining -= withdrawalFromRetirementMarket;
        }

        if (withdrawalRemaining > 0) {
          succeeded = false;
          break;
        }
      }

      const endingBalance =
        remainingSavings + remainingAvailableMarket + remainingRetirementMarket;
      endingBalances.push(Math.max(0, endingBalance));

      if (succeeded) {
        successCount += 1;
      }
    }

    const sortedEndingBalances = [...endingBalances].sort((left, right) => left - right);

    return {
      trials: monteCarloTrials,
      successRate: monteCarloTrials > 0 ? successCount / monteCarloTrials : 0,
      medianEndingBalance: percentile(sortedEndingBalances, 0.5),
      pessimisticEndingBalance: percentile(sortedEndingBalances, 0.1),
      optimisticEndingBalance: percentile(sortedEndingBalances, 0.9),
    };
  }, [assets, incomeStreams, profile, targets]);
  const runwaySummary = useMemo(() => {
    const totalWithdrawals = runwayTimeTable.rows.reduce(
      (sum, row) => sum + Number(row.totalWithdrawals ?? 0),
      0,
    );
    const totalShortfall = runwayTimeTable.rows.reduce(
      (sum, row) => sum + Number(row.unfundedShortfall ?? 0),
      0,
    );
    const firstYearRow = runwayTimeTable.rows[0];
    const futureIncomeStarts = incomeStreams
      .filter((incomeStream) => !incomeStream.isDisabled)
      .map((incomeStream) => {
        const startYear = getIncomeStartYear(incomeStream, profile.birthDate);
        const startsAfterRetirement = startYear > profile.retirementYear;
        const startsWithinHorizon = startYear <= profile.retirementEndYear;

        if (!startsAfterRetirement || !startsWithinHorizon) {
          return null;
        }

        const definition = incomeStreamTypeMap[incomeStream.streamType] ?? incomeStreamTypeMap.other;
        if (incomeStream.streamType === "social_security") {
          return `${definition.label} starts at age ${incomeStream.startAge} in ${startYear} at ${formatCurrency(
            incomeStream.annualAmount,
          )} per year with ${Number(incomeStream.annualGrowthRate || 0).toFixed(2)}% COLA`;
        }

        const endText = incomeStream.endDate
          ? ` through ${String(incomeStream.endDate).slice(0, 4)}`
          : "";
        return `${definition.label} starts in ${startYear} at ${formatCurrency(
          incomeStream.annualAmount,
        )} per year${endText}`;
      })
      .filter(Boolean);
    const bridgeSentence = projection.hasImmediateAccessToAllAssets
      ? "Because retirement starts after age 59.5, the full asset base is available immediately."
      : projection.bridgeCoveredToAccessAge
        ? `Because retirement starts before age 59.5, the plan uses ${formatCurrency(
            projection.bridgeAssetsAtRetirement,
          )} of bridge assets to cover the first ${
            projection.yearsUntilRetirementAccountsAccessible
          } years until retirement accounts open.`
        : `Because retirement starts before age 59.5, the plan needs bridge assets first and is currently short ${formatCurrency(
            projection.bridgeShortfall,
          )} before retirement accounts become available.`;
    const shortfallSentence =
      totalShortfall > 0
        ? ` In the selected scenario, the model still runs short by ${formatCurrency(totalShortfall)} over the full horizon.`
        : "";
    const laterIncomeSentence =
      futureIncomeStarts.length > 0
        ? ` Later in retirement, ${futureIncomeStarts.join("; ")}.`
        : "";

    return `With ${formatCurrency(
      projection.totalAtRetirement,
    )} projected at retirement, a first-year retirement spend target of ${formatCurrency(
      projection.targetAnnualSpend,
    )}, and ${formatCurrency(
      projection.retirementIncomeStreams,
    )} of income active at retirement start, the first retirement year would draw about ${formatCurrency(
      firstYearRow?.totalWithdrawals ?? 0,
    )} from assets. Over the full ${projection.yearsInRetirement}-year retirement horizon, this plan would draw about ${formatCurrency(
      totalWithdrawals,
    )} from assets in the selected ${
      projection.selectedScenarioLabel
    } scenario.${laterIncomeSentence} ${bridgeSentence}${shortfallSentence} The Monte Carlo success rate is ${formatPercent(
      monteCarlo.successRate,
    )}.`;
  }, [incomeStreams, monteCarlo.successRate, profile.birthDate, profile.retirementEndYear, profile.retirementYear, projection, runwayTimeTable.rows]);

  function updateProfile(event) {
    const { name, value } = event.target;
    if (name === "birthDate") {
      const derivedAge = calculateAgeFromBirthDate(value);
      setProfile((current) => ({
        ...current,
        birthDate: value,
        currentAge: derivedAge,
        retirementYear: calculateYearAtAge(
          value,
          Number(current.retirementAge || 0),
          current.retirementYear,
        ),
        retirementEndYear: calculateYearAtAge(
          value,
          Number(current.lifeExpectancyAge || 0),
          current.retirementEndYear,
        ),
      }));
      return;
    }

    if (name === "retirementAge" || name === "lifeExpectancyAge") {
      const numericValue = Number(value || 0);
      setProfile((current) => {
        const nextProfile = {
          ...current,
          [name]: value,
        };
        const normalizedRetirementAge =
          name === "retirementAge" ? numericValue : Number(nextProfile.retirementAge || 0);
        const normalizedLifeExpectancyAge = Math.max(
          normalizedRetirementAge,
          name === "lifeExpectancyAge"
            ? numericValue
            : Number(nextProfile.lifeExpectancyAge || 0),
        );

        return {
          ...nextProfile,
          retirementAge: name === "retirementAge" ? value : String(normalizedRetirementAge),
          lifeExpectancyAge:
            name === "lifeExpectancyAge" ? value : String(normalizedLifeExpectancyAge),
          retirementYear: calculateYearAtAge(
            nextProfile.birthDate,
            normalizedRetirementAge,
            nextProfile.retirementYear,
          ),
          retirementEndYear: calculateYearAtAge(
            nextProfile.birthDate,
            normalizedLifeExpectancyAge,
            nextProfile.retirementEndYear,
          ),
        };
      });
      return;
    }

    setProfile((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateTargets(event) {
    const { name, value } = event.target;
    setTargets((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateAuthForm(event) {
    const { name, value } = event.target;
    setAuthForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function changeAuthMode(mode) {
    setAuthMode(mode);
    setAuthStep("request");
    setAuthStatus("");
    setAuthError("");
    setDebugCode("");
    setAuthForm((current) => ({
      ...current,
      code: "",
    }));
  }

  async function requestAuthCode() {
    setAuthStatus("Sending code...");
    setAuthError("");

    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: authMode,
          firstName: authForm.firstName,
          lastName: authForm.lastName,
          email: authForm.email,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send verification code.");
      }

      setAuthStep("verify");
      setAuthStatus("Verification code sent. Enter it to continue.");
      setDebugCode(payload.debugCode ?? "");
    } catch (authRequestError) {
      setAuthStatus("");
      setAuthError(authRequestError.message);
    }
  }

  async function verifyAuthCode() {
    setAuthStatus("Verifying code...");
    setAuthError("");

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authForm.email,
          code: authForm.code,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to verify code.");
      }

      setSession(payload);
      setAuthStatus("");
      setAuthError("");
      setDebugCode("");
      setAuthStep("request");
      setAuthForm(defaultAuthForm);
    } catch (authVerifyError) {
      setAuthStatus("");
      setAuthError(authVerifyError.message);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      setSession({ user: null });
      resetPlannerState();
    }
  }

  function updateAsset(assetId, field, value) {
    setAssets((current) =>
      current.map((asset) => {
        if (asset.id !== assetId) {
          return asset;
        }

        if (field === "assetType") {
          const definition = assetTypeMap[value] ?? assetTypeMap.savings;
          return {
            ...asset,
            assetType: definition.value,
            rate: definition.defaultRate,
          };
        }

        return {
          ...asset,
          [field]: value,
        };
      }),
    );
  }

  function addAsset() {
    setAssets((current) => [...current, buildAsset(newAssetType)]);
    setAssetStatus("");
  }

  function removeAsset(assetId) {
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
    setAssetStatus("");
  }

  function updateIncomeStream(incomeStreamId, field, value) {
    setIncomeStreams((current) =>
      current.map((incomeStream) => {
        if (incomeStream.id !== incomeStreamId) {
          return incomeStream;
        }

        if (field === "streamType") {
          return {
            ...incomeStream,
            streamType: value,
            annualGrowthRate:
              value === "rental_income"
                ? incomeStream.annualGrowthRate
                : value === "social_security"
                  ? incomeStream.annualGrowthRate || 2.5
                  : 0,
            startAge: value === "social_security" ? incomeStream.startAge || 67 : "",
            endDate: value === "social_security" ? "" : incomeStream.endDate,
          };
        }

        return {
          ...incomeStream,
          [field]: value,
        };
      }),
    );
  }

  function addIncomeStream() {
    setIncomeStreams((current) => [...current, buildIncomeStream(newIncomeStreamType)]);
    setIncomeStatus("");
  }

  function removeIncomeStream(incomeStreamId) {
    setIncomeStreams((current) =>
      current.filter((incomeStream) => incomeStream.id !== incomeStreamId),
    );
    setIncomeStatus("");
  }

  async function saveProfile() {
    setProfileStatus("Saving...");
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error("Profile save failed.");
      }

      const savedProfile = await response.json();
      setProfile({ ...defaultProfile, ...savedProfile });
      setProfileStatus("Profile saved.");
    } catch (saveError) {
      setProfileStatus("");
      setError(saveError.message);
    }
  }

  async function saveTargets() {
    setTargetStatus("Saving...");
    setError("");

    try {
      const response = await fetch("/api/retirement-targets", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(targets),
      });

      if (!response.ok) {
        throw new Error("Retirement targets save failed.");
      }

      const savedTargets = await response.json();
      setTargets({ ...defaultTargets, ...savedTargets });
      setTargetStatus("Retirement targets saved.");
    } catch (saveError) {
      setTargetStatus("");
      setError(saveError.message);
    }
  }

  async function saveAssets() {
    setAssetStatus("Saving...");
    setError("");

    try {
      const response = await fetch("/api/assets", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: assets.map(({ assetType, amount, rate }) => ({
            assetType,
            amount,
            rate,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Asset save failed.");
      }

      const savedAssets = await response.json();
      setAssets(normalizeAssetsResponse(savedAssets));
      setAssetStatus("Assets saved.");
    } catch (saveError) {
      setAssetStatus("");
      setError(saveError.message);
    }
  }

  async function saveIncomeStreams() {
    setIncomeStatus("Saving...");
    setError("");

    try {
      const response = await fetch("/api/income-streams", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: incomeStreams.map(
            ({
              streamType,
              annualAmount,
              annualGrowthRate,
              startAge,
              startDate,
              endDate,
              isDisabled,
            }) => ({
              streamType,
              annualAmount,
              annualGrowthRate,
              startAge,
              startDate,
              endDate,
              isDisabled,
            }),
          ),
        }),
      });

      if (!response.ok) {
        throw new Error("Income streams save failed.");
      }

      const savedIncomeStreams = await response.json();
      setIncomeStreams(normalizeIncomeStreamsResponse(savedIncomeStreams));
      setIncomeStatus("Income streams saved.");
    } catch (saveError) {
      setIncomeStatus("");
      setError(saveError.message);
    }
  }

  function printTimeTable() {
    setIsTimeTableExpanded(true);
    window.setTimeout(() => {
      window.print();
    }, 60);
  }

  if (authLoading || (session?.user && loading)) {
    return (
      <main className="app-shell">
        <section className="loading-panel">Loading retirement planner...</section>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <AuthScreen
        mode={authMode}
        authForm={authForm}
        authStep={authStep}
        authStatus={authStatus}
        authError={authError}
        debugCode={debugCode}
        onModeChange={changeAuthMode}
        onChange={updateAuthForm}
        onRequestCode={requestAuthCode}
        onVerifyCode={verifyAuthCode}
      />
    );
  }

  return (
    <main className="app-shell">
      <div className="hero">
        <p className="eyebrow">Retirement Calculator</p>
        <h1>Ready to retire?</h1>
        <p className="hero__lede">
          Your authenticated retirement plan is stored per account in PostgreSQL and
          projected across multiple market scenarios.
        </p>
        <div className="hero__account">
          <span>
            Signed in as {session.user.firstName} {session.user.lastName} ({session.user.email})
          </span>
          <button type="button" className="button button--secondary" onClick={logout}>
            Sign Out
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="panel panel--chart">
        <RetirementAssetChart
          scenarios={projection.chartSeries}
          inflationRate={projection.inflationRate}
        />
        <div className="monte-carlo-summary">
          <ProjectionCard
            label={`Monte Carlo success rate (${monteCarlo.trials.toLocaleString()} runs)`}
            value={formatPercent(monteCarlo.successRate)}
            tone={monteCarlo.successRate >= 0.8 ? "positive" : "negative"}
          />
          <ProjectionCard
            label="Median ending balance"
            value={formatCurrency(monteCarlo.medianEndingBalance)}
          />
          <ProjectionCard
            label="10th percentile ending balance"
            value={formatCurrency(monteCarlo.pessimisticEndingBalance)}
            tone="negative"
          />
          <ProjectionCard
            label="90th percentile ending balance"
            value={formatCurrency(monteCarlo.optimisticEndingBalance)}
            tone="positive"
          />
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="section-kicker">Section 1</p>
                <h2>{profileTitle}</h2>
              </div>
              <div className="status-group">
                <span>{profileStatus}</span>
                <button type="button" onClick={saveProfile}>
                  Save Profile
                </button>
              </div>
            </div>

            <div className="profile-grid">
              <Field
                label="Full name"
                name="fullName"
                value={profile.fullName}
                onChange={updateProfile}
                placeholder="Alex Morgan"
              />
              <Field
                label="Account email"
                type="email"
                name="email"
                value={profile.email}
                onChange={updateProfile}
                placeholder="alex@example.com"
                readOnly
              />
              <Field
                label="Birthday"
                type="date"
                name="birthDate"
                value={profile.birthDate}
                onChange={updateProfile}
              />
              <Field
                label="Current salary"
                type="number"
                name="currentSalary"
                value={profile.currentSalary}
                format="currency"
                onChange={updateProfile}
                step="0.01"
                min="0"
                placeholder="150000"
              />
              <Field
                label="Retirement age"
                type="number"
                name="retirementAge"
                value={profile.retirementAge}
                onChange={updateProfile}
                min="0"
              />
              <Field
                label="Life expectancy age"
                type="number"
                name="lifeExpectancyAge"
                value={profile.lifeExpectancyAge}
                onChange={updateProfile}
                min={profile.retirementAge}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="section-kicker">Section 2</p>
                <h2>Retirement Targets</h2>
              </div>
              <div className="status-group">
                <span>{targetStatus}</span>
                <button type="button" onClick={saveTargets}>
                  Save Retirement Targets
                </button>
              </div>
            </div>

            <div className="profile-grid">
              <Field
                label="Target retirement city"
                name="targetCity"
                value={targets.targetCity}
                onChange={updateTargets}
                placeholder="San Diego, CA"
              />
              <Field
                label="Target annual spend in first retirement year"
                type="number"
                name="targetAnnualSpend"
                value={targets.targetAnnualSpend}
                format="currency"
                onChange={updateTargets}
                step="0.01"
                min="0"
                placeholder="120000"
              />
              <Field
                label="Annual inflation %"
                type="number"
                name="inflationRate"
                value={targets.inflationRate}
                onChange={updateTargets}
                step="0.01"
                min="0"
                placeholder="3"
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="section-kicker">Section 3</p>
                <h2>Assets</h2>
              </div>
              <div className="status-group">
                <span>{assetStatus}</span>
                <button type="button" onClick={saveAssets}>
                  Save Assets
                </button>
              </div>
            </div>

            <div className="asset-toolbar">
              <SelectField
                label="Add asset type"
                name="newAssetType"
                value={newAssetType}
                onChange={(event) => setNewAssetType(event.target.value)}
                options={assetTypeOptions}
              />
              <button type="button" className="button" onClick={addAsset}>
                Add Asset
              </button>
            </div>

            <div className="asset-stack">
              {assets.length === 0 ? (
                <div className="asset-empty">
                  No assets added yet. Add savings, stock, or retirement accounts above.
                </div>
              ) : null}

              {assets.map((asset) => (
                <AssetListItem
                  key={asset.id}
                  asset={asset}
                  onChange={updateAsset}
                  onRemove={removeAsset}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="section-kicker">Section 4</p>
                <h2>Additional Income</h2>
              </div>
              <div className="status-group">
                <span>{incomeStatus}</span>
                <button type="button" onClick={saveIncomeStreams}>
                  Save Income Streams
                </button>
              </div>
            </div>

            <div className="asset-toolbar">
              <SelectField
                label="Add income type"
                name="newIncomeStreamType"
                value={newIncomeStreamType}
                onChange={(event) => setNewIncomeStreamType(event.target.value)}
                options={incomeStreamTypeOptions}
              />
              <button type="button" className="button" onClick={addIncomeStream}>
                Add Income Stream
              </button>
            </div>

            <div className="asset-stack">
              {incomeStreams.length === 0 ? (
                <div className="asset-empty">
                  No additional income streams added yet. Add retirement work, pensions, or
                  other recurring income above.
                </div>
              ) : null}

              {incomeStreams.map((incomeStream) => (
                <IncomeStreamListItem
                  key={incomeStream.id}
                  incomeStream={incomeStream}
                  onChange={updateIncomeStream}
                  onRemove={removeIncomeStream}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="dashboard-side">
          <section className="panel panel--accent">
            <p className="section-kicker">Projection</p>
            <h2>Retirement runway</h2>
            <p className="projection-copy">
              Assumes savings grow at the entered APR and market-linked assets compound at
              the selected market return of {projection.selectedMarketReturn}% minus the fees
              you entered. Retirement spending starts at your entered first-year retirement
              amount and inflates at {projection.inflationRate}% per year after retirement begins.
            </p>
            <p className="projection-copy">{runwaySummary}</p>

            <ScenarioToggle
              value={selectedScenarioKey}
              onChange={setSelectedScenarioKey}
            />

            <div className="projection-grid">
              <ProjectionCard
                label="Current assets"
                value={formatCurrency(projection.currentAssets)}
              />
              <ProjectionCard
                label="Years until retirement"
                value={`${projection.yearsToRetirement} years`}
              />
              <ProjectionCard
                label="Retirement duration"
                value={`${projection.yearsInRetirement} years`}
              />
              <ProjectionCard
                label="Projected at retirement"
                value={formatCurrency(projection.totalAtRetirement)}
                tone="highlight"
              />
              <ProjectionCard
                label="Target spend in first retirement year"
                value={formatCurrency(projection.spendAtRetirementStart)}
              />
              <ProjectionCard
                label="Income active at retirement start"
                value={formatCurrency(projection.retirementIncomeStreams)}
              />
              <ProjectionCard
                label={
                  projection.incomeGapAtRetirementStart >= 0
                    ? "Income surplus in retirement"
                    : "Income shortage in retirement"
                }
                value={formatSignedCurrency(projection.incomeGapAtRetirementStart)}
                tone={projection.incomeGapAtRetirementStart >= 0 ? "positive" : "negative"}
              />
              {projection.hasImmediateAccessToAllAssets ? (
                <ProjectionCard
                  label="All-assets 4% capacity"
                  value={formatCurrency(projection.sustainableAnnualSpend)}
                  tone="highlight"
                />
              ) : (
                <>
                  <ProjectionCard
                    label="Available bridge assets at retirement"
                    value={formatCurrency(projection.bridgeAssetsAtRetirement)}
                  />
                  <ProjectionCard
                    label="Bridge coverage to age 59.5"
                    value={
                      projection.bridgeCoveredToAccessAge
                        ? `Covered (${projection.yearsUntilRetirementAccountsAccessible} yrs)`
                        : `Short ${formatCurrency(projection.bridgeShortfall)}`
                    }
                    tone={projection.bridgeCoveredToAccessAge ? "positive" : "negative"}
                  />
                  <ProjectionCard
                    label="Bridge balance at age 59.5"
                    value={formatCurrency(projection.bridgeBalanceAtAccessAge)}
                    tone={projection.bridgeCoveredToAccessAge ? "positive" : "negative"}
                  />
                </>
              )}
              <ProjectionCard
                label="Final balance at end of life"
                value={formatCurrency(projection.finalBalanceAtEndOfLife)}
              />
              <ProjectionCard
                label="Inflation assumption"
                value={formatPercent(projection.inflationRate / 100)}
              />
            </div>
          </section>

        </aside>
      </section>

      <section className="panel panel--print-focus">
        <div className="time-table-panel__header">
          <div>
            <p className="section-kicker">Time table</p>
            <h2>Year-by-year retirement math</h2>
            <p className="projection-copy">
              Expand this section to inspect how each asset grows and gets spent across retirement,
              then print the selected scenario view. Spending starts at your entered first-year
              retirement amount, and each later row shows the inflation-adjusted amount for that year.
            </p>
          </div>
          <div className="time-table-panel__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setIsTimeTableExpanded((current) => !current)}
            >
              {isTimeTableExpanded ? "Collapse Time Table" : "Expand Time Table"}
            </button>
            <button type="button" onClick={printTimeTable}>
              Print Selected Scenario
            </button>
          </div>
        </div>

        {isTimeTableExpanded ? (
          <>
            <ScenarioToggle
              value={selectedTimeTableScenarioKey}
              onChange={setSelectedTimeTableScenarioKey}
            />

            <p className="projection-copy time-table-panel__scenario-copy">
              Printing uses the {selectedTimeTableScenario.label.toLowerCase()} projection at{" "}
              {selectedTimeTableScenario.marketReturn}% annual market growth with{" "}
              {formatPercent(projection.inflationRate / 100)} annual inflation applied after the
              first retirement year.
            </p>

            {selectedTimeTable.rows.length === 0 ? (
              <div className="asset-empty">
                Add a retirement horizon and assets to see the yearly retirement table.
              </div>
            ) : (
              <div className="time-table-shell">
                <table className="time-table">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th>Year</th>
                      <th>Income</th>
                      <th>Spend</th>
                      <th>Surplus / shortage</th>
                      <th>Withdrawn</th>
                      <th>Total end balance</th>
                      {selectedTimeTable.columns.map((column) => (
                        <th key={column.id}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTimeTable.rows.map((row) => (
                      <tr key={`${selectedTimeTableScenario.key}-${row.year}-${row.age}`}>
                        <td>{row.age}</td>
                        <td>{row.year}</td>
                        <td>{formatCurrency(row.activeIncome)}</td>
                        <td>{formatCurrency(row.targetSpend)}</td>
                        <td
                          className={
                            row.incomeGap >= 0
                              ? "time-table__metric time-table__metric--positive"
                              : "time-table__metric time-table__metric--negative"
                          }
                        >
                          {formatSignedCurrency(row.incomeGap)}
                        </td>
                        <td
                          className={
                            row.unfundedShortfall > 0
                              ? "time-table__metric time-table__metric--negative"
                              : ""
                          }
                        >
                          {row.unfundedShortfall > 0
                            ? `${formatCurrency(row.totalWithdrawals)} funded / ${formatCurrency(row.unfundedShortfall)} short`
                            : formatCurrency(row.totalWithdrawals)}
                        </td>
                        <td>{formatCurrency(row.totalEnd)}</td>
                        {row.assetSnapshots.map((asset) => (
                          <td key={asset.id}>
                            <div className="time-table__asset-cell">
                              <strong>{formatCurrency(asset.balanceEnd)}</strong>
                              <span>Start {formatCurrency(asset.balanceStart)}</span>
                              <span className="time-table__metric time-table__metric--positive">
                                +{formatCurrency(asset.growth)}
                              </span>
                              <span
                                className={
                                  asset.withdrawal > 0
                                    ? "time-table__metric time-table__metric--negative"
                                    : ""
                                }
                              >
                                -{formatCurrency(asset.withdrawal)}
                              </span>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
