import { DEFAULT_USER_ID } from '../config/userConfig.js';
import { generateFinancialProjection } from './projectionService.js';
import {
  getStoredUserById,
  saveStoredUser
} from '../repositories/userRepository.js';
import {
  createDefaultPlanData,
  validateUserPlanData
} from '../validators/userDataValidator.js';

function getCurrentDateParts() {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
}

const EXPENSE_CATEGORY_KEYS = [
  'food',
  'entertainment',
  'transportation',
  'insurance',
  'subscriptions',
  'healthcare',
  'other'
];
const DEFAULT_CASH_YIELD = 0.032;

function createExpenseBreakdown(defaultOther = 0) {
  return {
    food: 0,
    entertainment: 0,
    transportation: 0,
    insurance: 0,
    subscriptions: 0,
    healthcare: 0,
    other: defaultOther
  };
}

function normalizeExpenseBreakdown(breakdown, fallbackTotal = 0) {
  const normalizedBreakdown = createExpenseBreakdown();
  const source = isPlainObject(breakdown) ? breakdown : null;

  if (!source) {
    normalizedBreakdown.other = fallbackTotal;
    return normalizedBreakdown;
  }

  for (const key of EXPENSE_CATEGORY_KEYS) {
    const value = source[key];
    normalizedBreakdown[key] = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  }

  return normalizedBreakdown;
}

function normalizeCareerPhase(phase) {
  const hasHousingAllowance =
    typeof phase?.housingAllowance === 'number' && !Number.isNaN(phase.housingAllowance) && phase.housingAllowance > 0;

  return {
    ...phase,
    compensationType:
      phase?.compensationType === 'clergy' || phase?.compensationType === 'standard'
        ? phase.compensationType
        : hasHousingAllowance
          ? 'clergy'
          : 'standard'
  };
}

function getExpenseBreakdownTotal(breakdown) {
  return EXPENSE_CATEGORY_KEYS.reduce((total, key) => total + (breakdown[key] ?? 0), 0);
}

function normalizePropertyTiming(property, personal, currentDateParts) {
  const baseYear = currentDateParts.year - personal.currentAge;
  const baseMonth = currentDateParts.month;
  const normalizedProperty = { ...property };

  if (typeof normalizedProperty.purchaseYear !== 'number' && typeof normalizedProperty.purchaseAge === 'number') {
    normalizedProperty.purchaseYear = baseYear + normalizedProperty.purchaseAge;
  }

  if (typeof normalizedProperty.purchaseMonth !== 'number') {
    normalizedProperty.purchaseMonth = baseMonth;
  }

  if (
    normalizedProperty.sellYear === undefined &&
    normalizedProperty.sellAge !== undefined &&
    normalizedProperty.sellAge !== null
  ) {
    normalizedProperty.sellYear = baseYear + normalizedProperty.sellAge;
  }

  if (
    normalizedProperty.sellMonth === undefined &&
    normalizedProperty.sellAge !== undefined &&
    normalizedProperty.sellAge !== null
  ) {
    normalizedProperty.sellMonth = baseMonth;
  }

  if (typeof normalizedProperty.downPayment !== 'number') {
    normalizedProperty.downPayment = 0;
  }

  if (typeof normalizedProperty.currentValue !== 'number') {
    normalizedProperty.currentValue = 0;
  }

  if (typeof normalizedProperty.monthlyMortgagePayment !== 'number') {
    normalizedProperty.monthlyMortgagePayment = 0;
  }

  if (typeof normalizedProperty.monthlyTaxAndInsurance !== 'number') {
    normalizedProperty.monthlyTaxAndInsurance = null;
  }

  if (typeof normalizedProperty.name !== 'string' || normalizedProperty.name.trim() === '') {
    normalizedProperty.name = normalizedProperty.propertyId || 'Home';
  }

  return normalizedProperty;
}

function normalizeRentalTiming(rental, currentDateParts) {
  const normalizedRental = { ...rental };

  if (typeof normalizedRental.startYear !== 'number') {
    normalizedRental.startYear = currentDateParts.year;
  }

  if (typeof normalizedRental.startMonth !== 'number') {
    normalizedRental.startMonth = currentDateParts.month;
  }

  if (
    typeof normalizedRental.endYear === 'number' &&
    typeof normalizedRental.endMonth !== 'number'
  ) {
    normalizedRental.endMonth = normalizedRental.startMonth;
  }

  if (
    (typeof normalizedRental.name !== 'string' || normalizedRental.name.trim() === '') &&
    normalizedRental.rentalId
  ) {
    normalizedRental.name = normalizedRental.rentalId;
  }

  if (typeof normalizedRental.name !== 'string' || normalizedRental.name.trim() === '') {
    normalizedRental.name = 'Rental';
  }

  if (typeof normalizedRental.monthlyRent !== 'number') {
    normalizedRental.monthlyRent = 0;
  }

  return normalizedRental;
}

function normalizePlanData(planData) {
  const currentDateParts = getCurrentDateParts();
  const income = planData.income ?? {};
  const currentExpenses = normalizeExpenseBreakdown(
    planData.expenses?.current,
    planData.expenses?.monthlyExpenses ?? 0
  );
  const retirementExpenses = normalizeExpenseBreakdown(
    planData.expenses?.retirement,
    planData.expenses?.expectedRetirementExpenses ?? 0
  );
  const normalizedPlan = {
    ...planData,
    income: {
      careerPhases: (income.careerPhases ?? []).map(normalizeCareerPhase),
      otherIncomeStreams: income.otherIncomeStreams ?? []
    },
    expenses: {
      current: currentExpenses,
      retirement: retirementExpenses,
      monthlyExpenses: getExpenseBreakdownTotal(currentExpenses),
      expectedRetirementExpenses: getExpenseBreakdownTotal(retirementExpenses)
    },
    assumptions: {
      ...planData.assumptions,
      cashYield:
        typeof planData.assumptions?.cashYield === 'number' &&
        !Number.isNaN(planData.assumptions.cashYield)
          ? planData.assumptions.cashYield
          : DEFAULT_CASH_YIELD
    }
  };

  normalizedPlan.realEstate = {
    ...normalizedPlan.realEstate,
    properties: (normalizedPlan.realEstate?.properties ?? []).map((property) =>
      normalizePropertyTiming(property, normalizedPlan.personal, currentDateParts)
    ),
    rentals: (normalizedPlan.realEstate?.rentals ?? []).map((rental) =>
      normalizeRentalTiming(rental, currentDateParts)
    )
  };

  return normalizedPlan;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source;
  }

  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      merged[key] = mergeDeep(target[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function normalizeUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return DEFAULT_USER_ID;
  }

  return userId.trim();
}

export async function getUserPlan(userId = DEFAULT_USER_ID) {
  const normalizedUserId = normalizeUserId(userId);
  const storedUser = await getStoredUserById(normalizedUserId);

  if (storedUser) {
    return normalizePlanData(storedUser);
  }

  const defaultPlan = createDefaultPlanData(normalizedUserId);
  await saveStoredUser(normalizedUserId, defaultPlan);
  return normalizePlanData(defaultPlan);
}

export async function createUserPlan(planData) {
  if (!isPlainObject(planData)) {
    throw createHttpError(400, 'Request body must be a JSON object.');
  }

  const normalizedUserId = normalizeUserId(planData.userId);
  const nextPlan = normalizePlanData({
    ...planData,
    userId: normalizedUserId
  });

  validateUserPlanData(nextPlan);
  await saveStoredUser(normalizedUserId, nextPlan);

  return nextPlan;
}

export async function updateUserPlan(userId, partialData) {
  if (!isPlainObject(partialData)) {
    throw createHttpError(400, 'Request body must be a JSON object.');
  }

  const normalizedUserId = normalizeUserId(userId || partialData.userId);
  const currentPlan = await getUserPlan(normalizedUserId);
  const nextPlan = normalizePlanData(mergeDeep(currentPlan, {
    ...partialData,
    userId: normalizedUserId
  }));

  validateUserPlanData(nextPlan);
  await saveStoredUser(normalizedUserId, nextPlan);

  return nextPlan;
}

export async function getUserFinancialProjection(userId = DEFAULT_USER_ID) {
  const plan = await getUserPlan(userId);
  return generateFinancialProjection(plan);
}
