export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
export const DEFAULT_USER_ID = import.meta.env.VITE_DEFAULT_USER_ID || 'demo-user';
export const FRONTEND_VERSION = 'ui-2026-04-28-b';
export const FRONTEND_STORAGE_VERSION = '2';

export function getUserApiUrl(userId = DEFAULT_USER_ID) {
  return `${API_BASE_URL}/users/${encodeURIComponent(userId)}`;
}

export function getUserProjectionApiUrl(userId = DEFAULT_USER_ID) {
  return `${getUserApiUrl(userId)}/projection`;
}

export const stepLabels = [
  'Personal Info',
  'Incomes',
  'Assets',
  'Housing',
  'Expenses',
  'Retirement Info',
  'Assumptions',
  'Retirement Summary'
];

export const proceedsDestinationOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'brokerage', label: 'Brokerage' }
];

export const housingEntryTypeOptions = [
  { value: 'property', label: 'Property' },
  { value: 'rental', label: 'Rental' }
];

export const otherIncomeTypeOptions = [
  { value: 'passive', label: 'Passive income' },
  { value: 'rental', label: 'Rental income' },
  { value: 'business', label: 'Business income' },
  { value: 'other', label: 'Other income' }
];

export const careerPhaseTaxTreatmentOptions = [
  { value: 'standard', label: 'Standard salary' },
  { value: 'clergy', label: 'Clergy compensation' }
];

export const expenseCategoryFields = [
  { key: 'food', label: 'Food & dining' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'transportation', label: 'Auto & transport' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'other', label: 'Other' }
];

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;

export const monthOptions = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' }
];

export const defaultPlanData = {
  schemaVersion: '1.0.0',
  personal: {
    currentAge: 35,
    retirementAge: 65,
    lifeExpectancy: 92
  },
  income: {
    careerPhases: [
      {
        title: 'Current role',
        startAge: 35,
        endAge: 44,
        compensationType: 'standard',
        baseSalary: 145000,
        housingAllowance: 0,
        housingAllowanceTaxExemptPercent: 1,
        retirementContributionPercent: 12,
        employerMatch: 4
      }
    ],
    otherIncomeStreams: []
  },
  assets: {
    cash: 35000,
    brokerage: 120000,
    retirementAccounts: {
      '401k': 240000,
      ira: 55000,
      rothIra: 42000
    }
  },
  realEstate: {
    properties: [
      {
        name: 'Home 1',
        propertyId: 'property-1',
        purchasePrice: 650000,
        downPayment: 240000,
        purchaseAge: 30,
        purchaseYear: currentYear - 5,
        purchaseMonth: currentMonth,
        sellAge: 68,
        sellYear: currentYear + 33,
        sellMonth: currentMonth,
        appreciationRate: 0.03,
        expectedSalePrice: null,
        sellingCostsPercent: 0.06,
        proceedsDestination: 'cash',
        mortgage: {
          rate: 0.0525,
          term: 30,
          remainingBalance: 410000
        }
      }
    ],
    rentals: []
  },
  expenses: {
    current: {
      food: 1200,
      entertainment: 450,
      transportation: 700,
      insurance: 850,
      subscriptions: 150,
      healthcare: 450,
      other: 2400
    },
    retirement: {
      food: 1000,
      entertainment: 350,
      transportation: 450,
      insurance: 700,
      subscriptions: 125,
      healthcare: 775,
      other: 2000
    }
  },
  retirement: {
    socialSecurityAge: 67,
    socialSecurityBenefit: 3200,
    pensionIncome: 0
  },
  assumptions: {
    inflationRate: 0.025,
    cashYield: 0.032,
    investmentReturnMean: 0.07,
    investmentReturnStdDev: 0.12,
    safeWithdrawalRate: 0.04
  }
};

export function createCareerPhase() {
  return {
    title: '',
    startAge: 0,
    endAge: 0,
    compensationType: 'standard',
    baseSalary: 0,
    housingAllowance: 0,
    housingAllowanceTaxExemptPercent: 1,
    retirementContributionPercent: 0,
    employerMatch: 0
  };
}

export function createExpenseBreakdown(defaultOther = 0) {
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

export function createOtherIncomeStream(sequence = 1) {
  return {
    name: `Other income ${sequence}`,
    incomeType: 'passive',
    annualAmount: 0,
    startAge: 0,
    endAge: 0,
    taxablePercent: 1
  };
}

export function createProperty(sequence = 1) {
  return {
    name: `Home ${sequence}`,
    propertyId: `property-${sequence}`,
    isPaidOff: false,
    currentValue: 0,
    purchasePrice: 0,
    downPayment: 0,
    monthlyMortgagePayment: 0,
    monthlyTaxAndInsurance: null,
    purchaseAge: 0,
    purchaseYear: currentYear,
    purchaseMonth: currentMonth,
    sellAge: null,
    sellYear: null,
    sellMonth: currentMonth,
    appreciationRate: 0,
    expectedSalePrice: null,
    sellingCostsPercent: 0.06,
    proceedsDestination: 'cash',
    mortgage: {
      rate: 0,
      term: 30,
      remainingBalance: 0
    }
  };
}

export function createRental(sequence = 1) {
  return {
    name: `Rental ${sequence}`,
    rentalId: `rental-${sequence}`,
    monthlyRent: 0,
    startYear: currentYear,
    startMonth: currentMonth,
    endYear: null,
    endMonth: currentMonth
  };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeDeep(target, source) {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const merged = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) {
      merged[key] = mergeDeep(target[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}
