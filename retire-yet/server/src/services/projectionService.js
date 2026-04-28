import {
  initializeRealEstateState,
  simulateRealEstateMonth
} from './realEstateService.js';
import { calculateNetIncome } from './taxService.js';

const DEFAULT_SAFE_WITHDRAWAL_RATE = 0.04;
const DEFAULT_CASH_YIELD = 0.032;
const MONTE_CARLO_SIMULATION_COUNT = 1000;
const MARKET_SCENARIO_CONFIG = [
  {
    key: 'significantlyBelowAverage',
    label: 'Well Below Average',
    confidenceLevel: 0.9,
    percentile: 0.1,
    description: '90% confidence path modeled from the lower end of simulated outcomes.'
  },
  {
    key: 'belowAverage',
    label: 'Below Average',
    confidenceLevel: 0.75,
    percentile: 0.25,
    description: '75% confidence path modeled from a below-average market outcome.'
  },
  {
    key: 'average',
    label: 'Average',
    confidenceLevel: 0.5,
    percentile: 0.5,
    description: '50% confidence path modeled from the middle of simulated outcomes.'
  }
];

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeRate(value, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return value > 1 ? value / 100 : value;
}

function getCurrentDateParts() {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
}

function toMonthIndex(year, month) {
  return year * 12 + (month - 1);
}

function getBirthMonthIndex(userData) {
  const currentDateParts = getCurrentDateParts();
  const birthYear = currentDateParts.year - userData.personal.currentAge;
  return toMonthIndex(birthYear, currentDateParts.month);
}

function getAgeForMonthIndex(userData, monthIndex) {
  return Math.floor((monthIndex - getBirthMonthIndex(userData)) / 12);
}

function getSafeWithdrawalRate(userData) {
  return normalizeRate(
    userData.assumptions.safeWithdrawalRate,
    DEFAULT_SAFE_WITHDRAWAL_RATE
  );
}

function getCashYield(userData) {
  return normalizeRate(userData.assumptions.cashYield, DEFAULT_CASH_YIELD);
}

function getTotalRetirementBalance(retirementAccounts) {
  return (
    retirementAccounts['401k'] + retirementAccounts.ira + retirementAccounts.rothIra
  );
}

function createPortfolioFromAssets(assets) {
  return {
    cash: assets.cash,
    brokerage: assets.brokerage,
    retirementAccounts: {
      '401k': assets.retirementAccounts['401k'],
      ira: assets.retirementAccounts.ira,
      rothIra: assets.retirementAccounts.rothIra
    }
  };
}

function getInvestablePortfolioValue(portfolio) {
  return portfolio.cash + portfolio.brokerage + getTotalRetirementBalance(portfolio.retirementAccounts);
}

function getCareerPhaseForAge(careerPhases, age) {
  return careerPhases.find((phase) => age >= phase.startAge && age <= phase.endAge) ?? null;
}

function getCareerPhaseBaseSalary(phase, fallbackSalary = 0) {
  return phase?.baseSalary ?? phase?.salary ?? fallbackSalary;
}

function getCareerPhaseHousingAllowance(phase) {
  return phase?.housingAllowance ?? 0;
}

function getCareerPhaseHousingAllowanceExemptPercent(phase) {
  return phase?.housingAllowanceTaxExemptPercent ?? 1;
}

function getCareerPhaseCompensationType(phase) {
  return phase?.compensationType === 'clergy' ? 'clergy' : 'standard';
}

function getOtherIncomeStreamsForAge(otherIncomeStreams, age) {
  return (otherIncomeStreams ?? []).filter(
    (incomeStream) => age >= incomeStream.startAge && age <= incomeStream.endAge
  );
}

function isRetiredForAge(userData, age) {
  if (age > userData.personal.retirementAge) {
    return true;
  }

  if (age < userData.personal.retirementAge) {
    return false;
  }

  return getCareerPhaseForAge(userData.income.careerPhases, age) === null;
}

function getInflatedMonthlyNonHousingExpenses(userData, monthsFromStart, age) {
  const yearsFromStart = monthsFromStart / 12;
  const baseMonthlyExpenses =
    isRetiredForAge(userData, age)
      ? userData.expenses.expectedRetirementExpenses
      : userData.expenses.monthlyExpenses;

  return baseMonthlyExpenses * Math.pow(1 + userData.assumptions.inflationRate, yearsFromStart);
}

function getAnnualEmploymentIncome(userData, age) {
  if (isRetiredForAge(userData, age)) {
    return 0;
  }

  const activeCareerPhase = getCareerPhaseForAge(userData.income.careerPhases, age);
  return getCareerPhaseBaseSalary(activeCareerPhase, 0);
}

function getAnnualOtherIncomeDetails(userData, age) {
  const activeIncomeStreams = getOtherIncomeStreamsForAge(
    userData.income.otherIncomeStreams,
    age
  );

  return activeIncomeStreams.reduce(
    (totals, incomeStream) => {
      const annualAmount = incomeStream.annualAmount ?? 0;
      const taxablePercent = normalizeRate(incomeStream.taxablePercent, 1);
      const taxableIncome = annualAmount * taxablePercent;
      const incomeTax = taxableIncome * 0.22;

      return {
        totalIncome: totals.totalIncome + annualAmount,
        taxableIncome: totals.taxableIncome + taxableIncome,
        incomeTax: totals.incomeTax + incomeTax,
        netIncome: totals.netIncome + annualAmount - incomeTax
      };
    },
    {
      totalIncome: 0,
      taxableIncome: 0,
      incomeTax: 0,
      netIncome: 0
    }
  );
}

function getRetirementContributions(userData, age, earnedIncome) {
  if (isRetiredForAge(userData, age)) {
    return { employeeContribution: 0, employerContribution: 0 };
  }

  const activeCareerPhase = getCareerPhaseForAge(userData.income.careerPhases, age);

  if (!activeCareerPhase) {
    return { employeeContribution: 0, employerContribution: 0 };
  }

  return {
    employeeContribution:
      earnedIncome * (activeCareerPhase.retirementContributionPercent / 100),
    employerContribution: earnedIncome * (activeCareerPhase.employerMatch / 100)
  };
}

function getAnnualEarnedIncomeDetails(userData, age) {
  const employmentIncome = getAnnualEmploymentIncome(userData, age);

  if (employmentIncome <= 0) {
    return {
      totalIncome: 0,
      taxableIncome: 0,
      incomeTax: 0,
      secaTax: 0,
      netIncome: 0
    };
  }

  const activeCareerPhase = getCareerPhaseForAge(userData.income.careerPhases, age);
  const baseSalary = getCareerPhaseBaseSalary(activeCareerPhase, employmentIncome);
  const housingAllowancePercent = getCareerPhaseHousingAllowance(activeCareerPhase);
  const housingAllowanceTaxExemptPercent =
    getCareerPhaseHousingAllowanceExemptPercent(activeCareerPhase);

  return calculateNetIncome({
    baseSalary,
    compensationType: getCareerPhaseCompensationType(activeCareerPhase),
    housingAllowance: housingAllowancePercent,
    housingAllowanceTaxExemptPercent
  });
}

function getAnnualIncomeDetails(userData, age) {
  const earnedIncomeDetails = getAnnualEarnedIncomeDetails(userData, age);
  const otherIncomeDetails = getAnnualOtherIncomeDetails(userData, age);
  const annualSocialSecurityIncome =
    age >= userData.retirement.socialSecurityAge
      ? userData.retirement.socialSecurityBenefit * 12
      : 0;
  const retirementIncome = isRetiredForAge(userData, age)
    ? annualSocialSecurityIncome + userData.retirement.pensionIncome
    : 0;

  return {
    totalIncome:
      earnedIncomeDetails.totalIncome + otherIncomeDetails.totalIncome + retirementIncome,
    taxableIncome:
      earnedIncomeDetails.taxableIncome + otherIncomeDetails.taxableIncome + retirementIncome,
    incomeTax: earnedIncomeDetails.incomeTax + otherIncomeDetails.incomeTax,
    secaTax: earnedIncomeDetails.secaTax,
    netIncome:
      earnedIncomeDetails.netIncome + otherIncomeDetails.netIncome + retirementIncome
  };
}

function getRecommendedWorkingSpend(userData) {
  if (isRetiredForAge(userData, userData.personal.currentAge)) {
    return 0;
  }

  const currentIncome = getAnnualEmploymentIncome(userData, userData.personal.currentAge);
  const currentIncomeDetails = getAnnualIncomeDetails(
    userData,
    userData.personal.currentAge
  );
  const { employeeContribution } = getRetirementContributions(
    userData,
    userData.personal.currentAge,
    currentIncome
  );

  const projectionPreview = runProjectionPath(userData, {
    annualReturnGenerator: () => 0,
    collectYearlyResults: true
  });
  const currentExpenses = projectionPreview.yearlyResults[0]?.expenses ?? 0;

  return Math.max(0, currentIncomeDetails.netIncome / 12 - currentExpenses / 12 - employeeContribution / 12);
}

function sampleStandardNormal() {
  let firstRandom = 0;
  let secondRandom = 0;

  while (firstRandom === 0) {
    firstRandom = Math.random();
  }

  while (secondRandom === 0) {
    secondRandom = Math.random();
  }

  return Math.sqrt(-2 * Math.log(firstRandom)) * Math.cos(2 * Math.PI * secondRandom);
}

function sampleAnnualReturn(mean, standardDeviation) {
  const sampledReturn = mean + standardDeviation * sampleStandardNormal();
  return Math.max(-0.99, sampledReturn);
}

function getMedian(values) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

function getPercentileValue(values, percentile) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentile) - 1)
  );

  return sortedValues[index];
}

function roundRetirementSnapshot(retirementSnapshot) {
  if (!retirementSnapshot) {
    return null;
  }

  return {
    totalNetWorth: roundCurrency(retirementSnapshot.totalNetWorth),
    totalAssetsBreakdown: {
      cash: roundCurrency(retirementSnapshot.totalAssetsBreakdown.cash),
      brokerage: roundCurrency(retirementSnapshot.totalAssetsBreakdown.brokerage),
      retirementAccounts: {
        '401k': roundCurrency(retirementSnapshot.totalAssetsBreakdown.retirementAccounts['401k']),
        ira: roundCurrency(retirementSnapshot.totalAssetsBreakdown.retirementAccounts.ira),
        rothIra: roundCurrency(retirementSnapshot.totalAssetsBreakdown.retirementAccounts.rothIra)
      },
      realEstateEquity: roundCurrency(retirementSnapshot.totalAssetsBreakdown.realEstateEquity)
    }
  };
}

function createAnnualReturnGeneratorFromSequence(annualReturns) {
  let index = 0;

  return () => {
    const annualReturn = annualReturns[index] ?? annualReturns[annualReturns.length - 1] ?? 0;
    index += 1;
    return annualReturn;
  };
}

function createEmptyWithdrawalBreakdown() {
  return {
    cash: 0,
    brokerage: 0,
    ira: 0,
    '401k': 0,
    rothIra: 0
  };
}

function createEmptyExpenseFundingBreakdown() {
  return {
    income: 0,
    cash: 0,
    brokerage: 0,
    ira: 0,
    '401k': 0,
    rothIra: 0
  };
}

function coverCashShortfall(portfolio, shortfall, accountOrder) {
  let remainingShortfall = shortfall;
  const withdrawals = createEmptyWithdrawalBreakdown();

  for (const accountName of accountOrder) {
    if (remainingShortfall <= 0) {
      break;
    }

    if (accountName === 'brokerage') {
      const withdrawal = Math.min(portfolio.brokerage, remainingShortfall);
      portfolio.brokerage -= withdrawal;
      remainingShortfall -= withdrawal;
      withdrawals.brokerage += withdrawal;
      continue;
    }

    if (accountName === 'cash') {
      continue;
    }

    const withdrawal = Math.min(portfolio.retirementAccounts[accountName], remainingShortfall);
    portfolio.retirementAccounts[accountName] -= withdrawal;
    remainingShortfall -= withdrawal;
    withdrawals[accountName] += withdrawal;
  }

  withdrawals.cash = shortfall - (remainingShortfall + Object.values(withdrawals).reduce((sum, value) => sum + value, 0) - withdrawals.cash);
  portfolio.cash = -remainingShortfall;

  return withdrawals;
}

function getWithdrawalOrder(userData, age) {
  if (age >= userData.personal.retirementAge) {
    return ['brokerage', 'ira', '401k', 'rothIra'];
  }

  return ['brokerage', '401k', 'ira', 'rothIra'];
}

function applyGrowth(portfolio, monthlyCashYieldRate, monthlyReturnRate) {
  portfolio.cash *= 1 + monthlyCashYieldRate;
  portfolio.brokerage *= 1 + monthlyReturnRate;
  portfolio.retirementAccounts['401k'] *= 1 + monthlyReturnRate;
  portfolio.retirementAccounts.ira *= 1 + monthlyReturnRate;
  portfolio.retirementAccounts.rothIra *= 1 + monthlyReturnRate;
}

function createRetirementSnapshot(portfolio, realEstateEquity) {
  return {
    totalNetWorth:
      portfolio.cash +
      portfolio.brokerage +
      getTotalRetirementBalance(portfolio.retirementAccounts) +
      realEstateEquity,
    totalAssetsBreakdown: {
      cash: portfolio.cash,
      brokerage: portfolio.brokerage,
      retirementAccounts: {
        '401k': portfolio.retirementAccounts['401k'],
        ira: portfolio.retirementAccounts.ira,
        rothIra: portfolio.retirementAccounts.rothIra
      },
      realEstateEquity
    }
  };
}

function runProjectionPath(userData, options = {}) {
  const { collectYearlyResults = false, annualReturnGenerator } = options;
  const yearlyResults = [];
  const housingState = initializeRealEstateState(userData);
  const portfolio = createPortfolioFromAssets(userData.assets);
  let investablePortfolioAtRetirement = getInvestablePortfolioValue(portfolio);
  let retirementSnapshot = null;
  let survived = true;

  const currentDateParts = getCurrentDateParts();
  const projectionStartMonthIndex = toMonthIndex(currentDateParts.year, currentDateParts.month);
  const totalProjectionMonths =
    (userData.personal.lifeExpectancy - userData.personal.currentAge + 1) * 12;
  let currentAgeBucket = null;
  let currentAgeAccumulator = null;
  let currentMonthlyReturnRate = 0;
  let currentMonthlyCashYieldRate = Math.pow(1 + getCashYield(userData), 1 / 12) - 1;

  function finalizeAgeAccumulator() {
    if (!collectYearlyResults || !currentAgeAccumulator) {
      return;
    }

    yearlyResults.push({
      age: currentAgeAccumulator.age,
      income: roundCurrency(currentAgeAccumulator.income),
      expenses: roundCurrency(currentAgeAccumulator.expenses),
      realEstateEquity: roundCurrency(currentAgeAccumulator.realEstateEquity),
      homeEquity: roundCurrency(currentAgeAccumulator.realEstateEquity),
      cashImpact: roundCurrency(currentAgeAccumulator.cashImpact),
      saleEvents: currentAgeAccumulator.saleEvents.map((event) => ({
        propertyId: event.propertyId,
        propertyName: event.propertyName,
        salePrice: roundCurrency(event.salePrice),
        netProceeds: roundCurrency(event.netProceeds),
        destinationAccount: event.destinationAccount,
        warning: event.warning
      })),
      withdrawalOrder:
        isRetiredForAge(userData, currentAgeAccumulator.age)
          ? ['cash', 'brokerage', 'ira', '401k', 'rothIra']
          : ['cash', 'brokerage', '401k', 'ira', 'rothIra'],
      withdrawals: {
        cash: roundCurrency(currentAgeAccumulator.withdrawals.cash),
        brokerage: roundCurrency(currentAgeAccumulator.withdrawals.brokerage),
        ira: roundCurrency(currentAgeAccumulator.withdrawals.ira),
        '401k': roundCurrency(currentAgeAccumulator.withdrawals['401k']),
        rothIra: roundCurrency(currentAgeAccumulator.withdrawals.rothIra)
      },
      expenseFunding: {
        income: roundCurrency(currentAgeAccumulator.expenseFunding.income),
        cash: roundCurrency(currentAgeAccumulator.expenseFunding.cash),
        brokerage: roundCurrency(currentAgeAccumulator.expenseFunding.brokerage),
        ira: roundCurrency(currentAgeAccumulator.expenseFunding.ira),
        '401k': roundCurrency(currentAgeAccumulator.expenseFunding['401k']),
        rothIra: roundCurrency(currentAgeAccumulator.expenseFunding.rothIra)
      },
      balances: {
        cash: roundCurrency(portfolio.cash),
        brokerage: roundCurrency(portfolio.brokerage),
        ira: roundCurrency(portfolio.retirementAccounts.ira),
        '401k': roundCurrency(portfolio.retirementAccounts['401k']),
        rothIra: roundCurrency(portfolio.retirementAccounts.rothIra)
      },
      netWorth: roundCurrency(currentAgeAccumulator.netWorth),
      retirementBalance: roundCurrency(currentAgeAccumulator.retirementBalance)
    });

    if (currentAgeAccumulator.age === userData.personal.retirementAge) {
      retirementSnapshot = createRetirementSnapshot(
        portfolio,
        currentAgeAccumulator.realEstateEquity
      );
    }
  }

  for (let monthsFromStart = 0; monthsFromStart < totalProjectionMonths; monthsFromStart += 1) {
    const monthIndex = projectionStartMonthIndex + monthsFromStart;
    const age = getAgeForMonthIndex(userData, monthIndex);

    if (age !== currentAgeBucket) {
      finalizeAgeAccumulator();
      currentAgeBucket = age;
      currentAgeAccumulator = {
        age,
        income: 0,
        expenses: 0,
        cashImpact: 0,
        realEstateEquity: 0,
        saleEvents: [],
        withdrawals: createEmptyWithdrawalBreakdown(),
        expenseFunding: createEmptyExpenseFundingBreakdown(),
        netWorth: 0,
        retirementBalance: 0
      };

      if (age === userData.personal.retirementAge) {
        investablePortfolioAtRetirement = getInvestablePortfolioValue(portfolio);
      }

      const annualReturn = annualReturnGenerator(age);
      currentMonthlyReturnRate = Math.pow(1 + annualReturn, 1 / 12) - 1;
      currentMonthlyCashYieldRate = Math.pow(1 + getCashYield(userData), 1 / 12) - 1;
    }

    const incomeDetails = getAnnualIncomeDetails(userData, age);
    const earnedIncome = getAnnualEmploymentIncome(userData, age);
    const monthlyIncome = incomeDetails.totalIncome / 12;
    const monthlyNetIncome = incomeDetails.netIncome / 12;
    const monthlyNonHousingExpenses = getInflatedMonthlyNonHousingExpenses(
      userData,
      monthsFromStart,
      age
    );
    const { employeeContribution, employerContribution } = getRetirementContributions(
      userData,
      age,
      earnedIncome
    );
    const monthlyEmployeeContribution = employeeContribution / 12;
    const monthlyEmployerContribution = employerContribution / 12;
    const monthlySpendableIncome = Math.max(0, monthlyNetIncome - monthlyEmployeeContribution);

    portfolio.cash += monthlyNetIncome - monthlyNonHousingExpenses - monthlyEmployeeContribution;
    portfolio.retirementAccounts['401k'] += monthlyEmployeeContribution + monthlyEmployerContribution;

    const realEstateSummary = simulateRealEstateMonth(housingState, monthIndex, portfolio);
    const totalMonthlyExpenses = monthlyNonHousingExpenses + realEstateSummary.housingCost;
    let nonCashDrawsThisMonth = 0;
    let withdrawalBreakdown = createEmptyWithdrawalBreakdown();

    if (portfolio.cash < 0) {
      withdrawalBreakdown = coverCashShortfall(
        portfolio,
        Math.abs(portfolio.cash),
        getWithdrawalOrder(userData, age)
      );
      currentAgeAccumulator.withdrawals.brokerage += withdrawalBreakdown.brokerage;
      currentAgeAccumulator.withdrawals.ira += withdrawalBreakdown.ira;
      currentAgeAccumulator.withdrawals['401k'] += withdrawalBreakdown['401k'];
      currentAgeAccumulator.withdrawals.rothIra += withdrawalBreakdown.rothIra;
      nonCashDrawsThisMonth +=
        withdrawalBreakdown.brokerage +
        withdrawalBreakdown.ira +
        withdrawalBreakdown['401k'] +
        withdrawalBreakdown.rothIra;
    }

    const incomeFundingThisMonth = Math.min(totalMonthlyExpenses, monthlySpendableIncome);
    const remainingExpenseAfterIncome = Math.max(0, totalMonthlyExpenses - incomeFundingThisMonth);
    const cashReserveFundingThisMonth = Math.max(
      0,
      remainingExpenseAfterIncome - nonCashDrawsThisMonth
    );

    currentAgeAccumulator.withdrawals.cash += cashReserveFundingThisMonth;
    currentAgeAccumulator.expenseFunding.income += incomeFundingThisMonth;
    currentAgeAccumulator.expenseFunding.cash += cashReserveFundingThisMonth;
    currentAgeAccumulator.expenseFunding.brokerage += withdrawalBreakdown.brokerage;
    currentAgeAccumulator.expenseFunding.ira += withdrawalBreakdown.ira;
    currentAgeAccumulator.expenseFunding['401k'] += withdrawalBreakdown['401k'];
    currentAgeAccumulator.expenseFunding.rothIra += withdrawalBreakdown.rothIra;

    const investableBeforeGrowth = getInvestablePortfolioValue(portfolio);

    if (investableBeforeGrowth <= 0) {
      survived = false;
    }

    applyGrowth(portfolio, currentMonthlyCashYieldRate, currentMonthlyReturnRate);

    const retirementBalance = getTotalRetirementBalance(portfolio.retirementAccounts);
    const endingInvestableBalance = getInvestablePortfolioValue(portfolio);
    const netWorth = endingInvestableBalance + realEstateSummary.realEstateEquity;

    currentAgeAccumulator.income += monthlyIncome;
    currentAgeAccumulator.expenses += totalMonthlyExpenses;
    currentAgeAccumulator.cashImpact += realEstateSummary.cashImpact;
    currentAgeAccumulator.realEstateEquity = realEstateSummary.realEstateEquity;
    currentAgeAccumulator.saleEvents.push(...realEstateSummary.saleEvents);
    currentAgeAccumulator.retirementBalance = retirementBalance;
    currentAgeAccumulator.netWorth = netWorth;
  }

  finalizeAgeAccumulator();

  return {
    endingBalance: getInvestablePortfolioValue(portfolio),
    investablePortfolioAtRetirement,
    retirementSnapshot,
    survived,
    yearlyResults
  };
}

function runMonteCarloSimulation(userData) {
  const meanReturn = userData.assumptions.investmentReturnMean;
  const returnStdDev = userData.assumptions.investmentReturnStdDev;
  const endingBalances = [];
  const retirementPortfolioValues = [];
  const simulationRuns = [];
  let successfulRuns = 0;
  const simulationYears =
    userData.personal.lifeExpectancy - userData.personal.currentAge + 1;

  for (let simulationIndex = 0; simulationIndex < MONTE_CARLO_SIMULATION_COUNT; simulationIndex += 1) {
    const annualReturns = Array.from({ length: simulationYears }, () =>
      sampleAnnualReturn(meanReturn, returnStdDev)
    );
    const simulation = runProjectionPath(userData, {
      annualReturnGenerator: createAnnualReturnGeneratorFromSequence(annualReturns)
    });

    endingBalances.push(simulation.endingBalance);
    retirementPortfolioValues.push(simulation.investablePortfolioAtRetirement);
    simulationRuns.push({
      annualReturns,
      endingBalance: simulation.endingBalance,
      investablePortfolioAtRetirement: simulation.investablePortfolioAtRetirement,
      survived: simulation.survived
    });

    if (simulation.survived) {
      successfulRuns += 1;
    }
  }

  const rankedRuns = [...simulationRuns].sort(
    (left, right) =>
      left.investablePortfolioAtRetirement - right.investablePortfolioAtRetirement
  );
  const marketScenarios = {};

  for (const scenarioConfig of MARKET_SCENARIO_CONFIG) {
    const runIndex = Math.min(
      rankedRuns.length - 1,
      Math.max(0, Math.ceil(rankedRuns.length * scenarioConfig.percentile) - 1)
    );
    const selectedRun = rankedRuns[runIndex];
    const scenarioProjection = runProjectionPath(userData, {
      annualReturnGenerator: createAnnualReturnGeneratorFromSequence(selectedRun.annualReturns),
      collectYearlyResults: true
    });

    marketScenarios[scenarioConfig.key] = {
      key: scenarioConfig.key,
      label: scenarioConfig.label,
      confidenceLevel: scenarioConfig.confidenceLevel,
      runsAtOrAbove: Math.round(scenarioConfig.confidenceLevel * MONTE_CARLO_SIMULATION_COUNT),
      description: scenarioConfig.description,
      retirementPortfolioValue: roundCurrency(selectedRun.investablePortfolioAtRetirement),
      successThresholdEndingBalance: roundCurrency(selectedRun.endingBalance),
      recommendedRetirementSpend: roundCurrency(
        (scenarioProjection.investablePortfolioAtRetirement * getSafeWithdrawalRate(userData)) / 12
      ),
      retirementSnapshot: roundRetirementSnapshot(scenarioProjection.retirementSnapshot),
      yearlyResults: scenarioProjection.yearlyResults
    };
  }

  return {
    successProbability: successfulRuns / MONTE_CARLO_SIMULATION_COUNT,
    medianEndingBalance: getMedian(endingBalances),
    p10EndingBalance: getPercentileValue(endingBalances, 0.1),
    p25EndingBalance: getPercentileValue(endingBalances, 0.25),
    medianRetirementPortfolio: getMedian(retirementPortfolioValues),
    p10RetirementPortfolio: getPercentileValue(retirementPortfolioValues, 0.1),
    p25RetirementPortfolio: getPercentileValue(retirementPortfolioValues, 0.25),
    worstCase: Math.min(...endingBalances),
    bestCase: Math.max(...endingBalances),
    marketScenarios
  };
}

export function generateFinancialProjection(userData) {
  const deterministicProjection = runProjectionPath(userData, {
    annualReturnGenerator: () => userData.assumptions.investmentReturnMean,
    collectYearlyResults: true
  });
  const recommendedWorkingSpend = getRecommendedWorkingSpend(userData);
  const monteCarloSummary = runMonteCarloSimulation(userData);
  const recommendedRetirementSpend =
    (deterministicProjection.investablePortfolioAtRetirement * getSafeWithdrawalRate(userData)) /
    12;

  return {
    recommendedWorkingSpend: roundCurrency(recommendedWorkingSpend),
    recommendedRetirementSpend: roundCurrency(recommendedRetirementSpend),
    successProbability: roundCurrency(monteCarloSummary.successProbability),
    medianEndingBalance: roundCurrency(monteCarloSummary.medianEndingBalance),
    p10EndingBalance: roundCurrency(monteCarloSummary.p10EndingBalance),
    p25EndingBalance: roundCurrency(monteCarloSummary.p25EndingBalance),
    medianRetirementPortfolio: roundCurrency(monteCarloSummary.medianRetirementPortfolio),
    p10RetirementPortfolio: roundCurrency(monteCarloSummary.p10RetirementPortfolio),
    p25RetirementPortfolio: roundCurrency(monteCarloSummary.p25RetirementPortfolio),
    worstCase: roundCurrency(monteCarloSummary.worstCase),
    bestCase: roundCurrency(monteCarloSummary.bestCase),
    retirementSnapshot: roundRetirementSnapshot(deterministicProjection.retirementSnapshot),
    yearlyResults: deterministicProjection.yearlyResults,
    marketScenarios: monteCarloSummary.marketScenarios,
    defaultMarketScenario: 'significantlyBelowAverage'
  };
}
