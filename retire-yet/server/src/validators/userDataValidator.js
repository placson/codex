import { DEFAULT_USER_ID } from '../config/userConfig.js';

const PROCEEDS_DESTINATION_ACCOUNTS = ['cash', 'brokerage'];
const OTHER_INCOME_TYPES = ['passive', 'rental', 'business', 'other'];
const CAREER_PHASE_COMPENSATION_TYPES = ['standard', 'clergy'];
const EXPENSE_CATEGORY_KEYS = [
  'food',
  'entertainment',
  'transportation',
  'insurance',
  'subscriptions',
  'healthcare',
  'other'
];

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertObject(value, fieldName) {
  if (!isObject(value)) {
    throw createValidationError(`${fieldName} must be an object.`);
  }
}

function assertNumber(value, fieldName) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createValidationError(`${fieldName} must be a valid number.`);
  }
}

function assertOptionalNumber(value, fieldName) {
  if (value === undefined) {
    return;
  }

  assertNumber(value, fieldName);
}

function assertOptionalNullableNumber(value, fieldName) {
  if (value === undefined || value === null) {
    return;
  }

  assertNumber(value, fieldName);
}

function assertMonthNumber(value, fieldName) {
  assertNumber(value, fieldName);

  if (value < 1 || value > 12) {
    throw createValidationError(`${fieldName} must be between 1 and 12.`);
  }
}

function assertOptionalNullableMonthNumber(value, fieldName) {
  if (value === undefined || value === null) {
    return;
  }

  assertMonthNumber(value, fieldName);
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw createValidationError(`${fieldName} must be an array.`);
  }
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createValidationError(`${fieldName} must be a non-empty string.`);
  }
}

function assertOptionalStringEnum(value, fieldName, allowedValues) {
  if (value === undefined) {
    return;
  }

  assertString(value, fieldName);

  if (!allowedValues.includes(value)) {
    throw createValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string') {
    throw createValidationError(`${fieldName} must be a string.`);
  }
}

function validateCareerPhases(careerPhases) {
  assertArray(careerPhases, 'income.careerPhases');

  for (const [index, phase] of careerPhases.entries()) {
    assertObject(phase, `income.careerPhases[${index}]`);
    assertOptionalString(phase.title, `income.careerPhases[${index}].title`);
    assertOptionalStringEnum(
      phase.compensationType,
      `income.careerPhases[${index}].compensationType`,
      CAREER_PHASE_COMPENSATION_TYPES
    );
    assertNumber(phase.startAge, `income.careerPhases[${index}].startAge`);
    assertNumber(phase.endAge, `income.careerPhases[${index}].endAge`);
    assertOptionalNumber(phase.salary, `income.careerPhases[${index}].salary`);
    assertOptionalNumber(phase.baseSalary, `income.careerPhases[${index}].baseSalary`);
    assertOptionalNumber(
      phase.housingAllowance,
      `income.careerPhases[${index}].housingAllowance`
    );
    assertOptionalNumber(
      phase.housingAllowanceTaxExemptPercent,
      `income.careerPhases[${index}].housingAllowanceTaxExemptPercent`
    );
    assertNumber(
      phase.retirementContributionPercent,
      `income.careerPhases[${index}].retirementContributionPercent`
    );
    assertNumber(phase.employerMatch, `income.careerPhases[${index}].employerMatch`);

    if (phase.salary === undefined && phase.baseSalary === undefined) {
      throw createValidationError(
        `income.careerPhases[${index}] must include baseSalary.`
      );
    }

    if (phase.housingAllowance !== undefined) {
      const housingAllowancePercent =
        phase.housingAllowance > 1 ? phase.housingAllowance / 100 : phase.housingAllowance;

      if (housingAllowancePercent < 0 || housingAllowancePercent > 1) {
        throw createValidationError(
          `income.careerPhases[${index}].housingAllowance must be between 0 and 100 percent.`
        );
      }
    }
  }
}

function validateOtherIncomeStreams(otherIncomeStreams) {
  assertArray(otherIncomeStreams, 'income.otherIncomeStreams');

  for (const [index, incomeStream] of otherIncomeStreams.entries()) {
    assertObject(incomeStream, `income.otherIncomeStreams[${index}]`);
    assertOptionalString(incomeStream.name, `income.otherIncomeStreams[${index}].name`);
    assertOptionalStringEnum(
      incomeStream.incomeType,
      `income.otherIncomeStreams[${index}].incomeType`,
      OTHER_INCOME_TYPES
    );
    assertNumber(
      incomeStream.annualAmount,
      `income.otherIncomeStreams[${index}].annualAmount`
    );
    assertNumber(incomeStream.startAge, `income.otherIncomeStreams[${index}].startAge`);
    assertNumber(incomeStream.endAge, `income.otherIncomeStreams[${index}].endAge`);
    assertOptionalNumber(
      incomeStream.taxablePercent,
      `income.otherIncomeStreams[${index}].taxablePercent`
    );

    if (incomeStream.endAge < incomeStream.startAge) {
      throw createValidationError(
        `income.otherIncomeStreams[${index}].endAge must be on or after startAge.`
      );
    }
  }
}

function validateProperties(properties, lifeExpectancy) {
  assertArray(properties, 'realEstate.properties');

  for (const [index, property] of properties.entries()) {
    assertObject(property, `realEstate.properties[${index}]`);
    assertNumber(property.purchasePrice, `realEstate.properties[${index}].purchasePrice`);
    assertOptionalNumber(property.currentValue, `realEstate.properties[${index}].currentValue`);
    assertOptionalNumber(property.downPayment, `realEstate.properties[${index}].downPayment`);
    assertOptionalNumber(
      property.monthlyMortgagePayment,
      `realEstate.properties[${index}].monthlyMortgagePayment`
    );
    assertOptionalNumber(
      property.monthlyTaxAndInsurance,
      `realEstate.properties[${index}].monthlyTaxAndInsurance`
    );
    assertOptionalNumber(property.purchaseAge, `realEstate.properties[${index}].purchaseAge`);
    assertOptionalNumber(property.purchaseYear, `realEstate.properties[${index}].purchaseYear`);
    assertOptionalNullableMonthNumber(
      property.purchaseMonth,
      `realEstate.properties[${index}].purchaseMonth`
    );
    assertOptionalNullableNumber(property.sellAge, `realEstate.properties[${index}].sellAge`);
    assertOptionalNullableNumber(property.sellYear, `realEstate.properties[${index}].sellYear`);
    assertOptionalNullableMonthNumber(
      property.sellMonth,
      `realEstate.properties[${index}].sellMonth`
    );
    assertNumber(property.appreciationRate, `realEstate.properties[${index}].appreciationRate`);
    assertOptionalNullableNumber(
      property.expectedSalePrice,
      `realEstate.properties[${index}].expectedSalePrice`
    );
    assertOptionalNumber(
      property.sellingCostsPercent,
      `realEstate.properties[${index}].sellingCostsPercent`
    );
    assertOptionalStringEnum(
      property.proceedsDestination,
      `realEstate.properties[${index}].proceedsDestination`,
      PROCEEDS_DESTINATION_ACCOUNTS
    );
    assertObject(property.mortgage, `realEstate.properties[${index}].mortgage`);
    assertNumber(property.mortgage.rate, `realEstate.properties[${index}].mortgage.rate`);
    assertNumber(property.mortgage.term, `realEstate.properties[${index}].mortgage.term`);
    assertNumber(
      property.mortgage.remainingBalance,
      `realEstate.properties[${index}].mortgage.remainingBalance`
    );

    if (
      property.purchaseAge === undefined &&
      property.purchaseYear === undefined
    ) {
      throw createValidationError(
        `realEstate.properties[${index}] must include purchaseAge or purchaseYear.`
      );
    }

    if (property.sellAge !== undefined && property.sellAge !== null) {
      if (property.sellAge <= property.purchaseAge) {
        throw createValidationError(
          `Property ${index + 1}: sell age must be greater than purchase age.`
        );
      }

      if (property.sellAge > lifeExpectancy) {
        throw createValidationError(
          `Property ${index + 1}: sell age cannot be after life expectancy.`
        );
      }
    }

    if (
      property.sellYear !== undefined &&
      property.sellYear !== null &&
      property.purchaseYear !== undefined
    ) {
      const purchaseMonth = property.purchaseMonth ?? 1;
      const sellMonth = property.sellMonth ?? purchaseMonth;

      if (
        property.sellYear < property.purchaseYear ||
        (property.sellYear === property.purchaseYear && sellMonth <= purchaseMonth)
      ) {
        throw createValidationError(
          `Property ${index + 1}: sell date must be after purchase date.`
        );
      }
    }
  }
}

function validateRentals(rentals) {
  assertArray(rentals, 'realEstate.rentals');

  for (const [index, rental] of rentals.entries()) {
    assertObject(rental, `realEstate.rentals[${index}]`);
    assertOptionalString(rental.name, `realEstate.rentals[${index}].name`);
    assertNumber(rental.monthlyRent, `realEstate.rentals[${index}].monthlyRent`);
    assertNumber(rental.startYear, `realEstate.rentals[${index}].startYear`);
    assertMonthNumber(rental.startMonth, `realEstate.rentals[${index}].startMonth`);
    assertOptionalNullableNumber(rental.endYear, `realEstate.rentals[${index}].endYear`);
    assertOptionalNullableMonthNumber(
      rental.endMonth,
      `realEstate.rentals[${index}].endMonth`
    );

    if (rental.endYear !== undefined && rental.endYear !== null) {
      const endMonth = rental.endMonth ?? rental.startMonth;

      if (
        rental.endYear < rental.startYear ||
        (rental.endYear === rental.startYear && endMonth < rental.startMonth)
      ) {
        throw createValidationError(
          `Rental ${index + 1}: end date must be on or after start date.`
        );
      }
    }
  }
}

function validateExpenseBreakdown(expenseBreakdown, fieldName) {
  assertObject(expenseBreakdown, fieldName);

  for (const key of EXPENSE_CATEGORY_KEYS) {
    assertNumber(expenseBreakdown[key], `${fieldName}.${key}`);
  }
}

export function createDefaultPlanData(userId = DEFAULT_USER_ID) {
  return {
    userId,
    schemaVersion: '1.0.0',
    personal: {
      currentAge: 0,
      retirementAge: 0,
      lifeExpectancy: 0
    },
    income: {
      careerPhases: [],
      otherIncomeStreams: []
    },
    assets: {
      cash: 0,
      brokerage: 0,
      retirementAccounts: {
        '401k': 0,
        ira: 0,
        rothIra: 0
      }
    },
    realEstate: {
      properties: [],
      rentals: []
    },
    expenses: {
      current: {
        food: 0,
        entertainment: 0,
        transportation: 0,
        insurance: 0,
        subscriptions: 0,
        healthcare: 0,
        other: 0
      },
      retirement: {
        food: 0,
        entertainment: 0,
        transportation: 0,
        insurance: 0,
        subscriptions: 0,
        healthcare: 0,
        other: 0
      }
    },
    retirement: {
      socialSecurityAge: 0,
      socialSecurityBenefit: 0,
      pensionIncome: 0
    },
    assumptions: {
      inflationRate: 0,
      cashYield: 0.032,
      investmentReturnMean: 0,
      investmentReturnStdDev: 0,
      safeWithdrawalRate: 0.04
    }
  };
}

export function validateUserPlanData(data) {
  assertObject(data, 'userData');
  assertString(data.userId, 'userId');

  assertObject(data.personal, 'personal');
  assertNumber(data.personal.currentAge, 'personal.currentAge');
  assertNumber(data.personal.retirementAge, 'personal.retirementAge');
  assertNumber(data.personal.lifeExpectancy, 'personal.lifeExpectancy');

  assertObject(data.income, 'income');
  validateCareerPhases(data.income.careerPhases);
  validateOtherIncomeStreams(data.income.otherIncomeStreams ?? []);

  assertObject(data.assets, 'assets');
  assertNumber(data.assets.cash, 'assets.cash');
  assertNumber(data.assets.brokerage, 'assets.brokerage');
  assertObject(data.assets.retirementAccounts, 'assets.retirementAccounts');
  assertNumber(data.assets.retirementAccounts['401k'], 'assets.retirementAccounts.401k');
  assertNumber(data.assets.retirementAccounts.ira, 'assets.retirementAccounts.ira');
  assertNumber(data.assets.retirementAccounts.rothIra, 'assets.retirementAccounts.rothIra');

  assertObject(data.realEstate, 'realEstate');
  validateProperties(data.realEstate.properties, data.personal.lifeExpectancy);
  validateRentals(data.realEstate.rentals ?? []);

  assertObject(data.expenses, 'expenses');
  if (data.expenses.current || data.expenses.retirement) {
    validateExpenseBreakdown(data.expenses.current, 'expenses.current');
    validateExpenseBreakdown(data.expenses.retirement, 'expenses.retirement');
  } else {
    assertNumber(data.expenses.monthlyExpenses, 'expenses.monthlyExpenses');
    assertNumber(
      data.expenses.expectedRetirementExpenses,
      'expenses.expectedRetirementExpenses'
    );
  }

  assertOptionalNumber(data.expenses.monthlyExpenses, 'expenses.monthlyExpenses');
  assertOptionalNumber(
    data.expenses.expectedRetirementExpenses,
    'expenses.expectedRetirementExpenses'
  );
  assertOptionalNumber(data.expenses.monthlyRent, 'expenses.monthlyRent');
  assertOptionalNumber(
    data.expenses.expectedRetirementRent,
    'expenses.expectedRetirementRent'
  );

  assertObject(data.retirement, 'retirement');
  assertNumber(data.retirement.socialSecurityAge, 'retirement.socialSecurityAge');
  assertNumber(data.retirement.socialSecurityBenefit, 'retirement.socialSecurityBenefit');
  assertNumber(data.retirement.pensionIncome, 'retirement.pensionIncome');

  assertObject(data.assumptions, 'assumptions');
  assertNumber(data.assumptions.inflationRate, 'assumptions.inflationRate');
  assertOptionalNumber(data.assumptions.cashYield, 'assumptions.cashYield');
  assertNumber(
    data.assumptions.investmentReturnMean,
    'assumptions.investmentReturnMean'
  );
  assertNumber(
    data.assumptions.investmentReturnStdDev,
    'assumptions.investmentReturnStdDev'
  );
  assertOptionalNumber(data.assumptions.safeWithdrawalRate, 'assumptions.safeWithdrawalRate');
}

export function validateStoredUserCollection(data) {
  assertObject(data, 'userStore');
  assertObject(data.users, 'users');

  for (const [userId, userPlan] of Object.entries(data.users)) {
    assertString(userId, 'users.userId');
    validateUserPlanData({
      ...userPlan,
      userId: userPlan.userId || userId
    });
  }
}
