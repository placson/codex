const DEFAULT_PROPERTY_TAX_RATE = 0.012;
const DEFAULT_INSURANCE_RATE = 0.005;
const DEFAULT_SELLING_COSTS_PERCENT = 0.06;

export const PROCEEDS_DESTINATION_ACCOUNTS = ['cash', 'brokerage'];

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

function getPropertyId(property, index) {
  return property.propertyId || `property-${index + 1}`;
}

function getRentalId(rental, index) {
  return rental.rentalId || `rental-${index + 1}`;
}

function getResolvedPurchaseYear(property, userData, currentDateParts) {
  if (typeof property.purchaseYear === 'number') {
    return property.purchaseYear;
  }

  if (typeof property.purchaseAge === 'number') {
    return currentDateParts.year - userData.personal.currentAge + property.purchaseAge;
  }

  return currentDateParts.year;
}

function getResolvedPurchaseMonth(property, currentDateParts) {
  return typeof property.purchaseMonth === 'number' ? property.purchaseMonth : currentDateParts.month;
}

function getResolvedSellYear(property, userData, currentDateParts) {
  if (typeof property.sellYear === 'number') {
    return property.sellYear;
  }

  if (typeof property.sellAge === 'number') {
    return currentDateParts.year - userData.personal.currentAge + property.sellAge;
  }

  return null;
}

function getResolvedSellMonth(property, currentDateParts) {
  if (property.sellYear === undefined && property.sellAge === undefined) {
    return null;
  }

  return typeof property.sellMonth === 'number' ? property.sellMonth : currentDateParts.month;
}

function getConfiguredLoanBalance(property) {
  if (typeof property.mortgage.originalBalance === 'number') {
    return property.mortgage.originalBalance;
  }

  if (
    typeof property.mortgage.remainingBalance === 'number' &&
    property.mortgage.remainingBalance > 0
  ) {
    return Math.min(property.purchasePrice, property.mortgage.remainingBalance);
  }

  return null;
}

function getCurrentPropertyValue(property, fallbackValue) {
  if (typeof property.currentValue === 'number' && property.currentValue > 0) {
    return property.currentValue;
  }

  return fallbackValue;
}

function getDownPaymentAmount(property) {
  if (typeof property.downPayment === 'number') {
    return property.downPayment;
  }

  if (typeof property.downPaymentPercent === 'number') {
    return property.purchasePrice * normalizeRate(property.downPaymentPercent);
  }

  const configuredLoanBalance = getConfiguredLoanBalance(property);

  if (configuredLoanBalance === null) {
    return 0;
  }

  return Math.max(0, property.purchasePrice - configuredLoanBalance);
}

function getInitialLoanBalance(property) {
  const configuredLoanBalance = getConfiguredLoanBalance(property);

  if (configuredLoanBalance !== null) {
    return configuredLoanBalance;
  }

  return Math.max(0, property.purchasePrice - getDownPaymentAmount(property));
}

function getRemainingMortgageMonths(property, monthsOwnedBeforeProjection) {
  const derivedRemainingMonths = getDerivedRemainingMortgageMonths(
    getConfiguredLoanBalance(property) ?? property.mortgage.remainingBalance ?? 0,
    property.mortgage.rate,
    property.monthlyMortgagePayment
  );

  if (derivedRemainingMonths !== null) {
    return derivedRemainingMonths;
  }

  if (typeof property.mortgage.remainingTermMonths === 'number') {
    return Math.max(0, Math.round(property.mortgage.remainingTermMonths));
  }

  if (typeof property.mortgage.remainingTermYears === 'number') {
    return Math.max(0, Math.round(property.mortgage.remainingTermYears * 12));
  }

  return Math.max(0, Math.round(property.mortgage.term * 12 - monthsOwnedBeforeProjection));
}

function getDerivedRemainingMortgageMonths(balance, annualRate, monthlyPayment) {
  if (
    typeof monthlyPayment !== 'number' ||
    Number.isNaN(monthlyPayment) ||
    monthlyPayment <= 0 ||
    balance <= 0
  ) {
    return null;
  }

  const normalizedAnnualRate = normalizeRate(annualRate);
  const monthlyRate = normalizedAnnualRate / 12;

  if (monthlyRate <= 0) {
    return Math.max(1, Math.ceil(balance / monthlyPayment));
  }

  const monthlyInterestOnlyPayment = balance * monthlyRate;

  if (monthlyPayment <= monthlyInterestOnlyPayment) {
    return null;
  }

  const remainingMonths =
    -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate);

  if (!Number.isFinite(remainingMonths) || remainingMonths <= 0) {
    return null;
  }

  return Math.max(1, Math.ceil(remainingMonths));
}

function getMonthlyMortgagePayment(balance, annualRate, remainingMonths, scheduledPaymentOverride) {
  if (balance <= 0 || remainingMonths <= 0) {
    return 0;
  }

  if (
    typeof scheduledPaymentOverride === 'number' &&
    !Number.isNaN(scheduledPaymentOverride) &&
    scheduledPaymentOverride > 0
  ) {
    return scheduledPaymentOverride;
  }

  const normalizedAnnualRate = normalizeRate(annualRate);
  const monthlyRate = normalizedAnnualRate / 12;

  if (monthlyRate <= 0) {
    return balance / remainingMonths;
  }

  const compoundFactor = Math.pow(1 + monthlyRate, remainingMonths);
  return balance * ((monthlyRate * compoundFactor) / (compoundFactor - 1));
}

function applyMortgagePaymentForMonth(balance, annualRate, remainingMonths, scheduledPaymentOverride) {
  if (balance <= 0 || remainingMonths <= 0) {
    return {
      endingBalance: 0,
      remainingMonths: 0,
      payment: 0
    };
  }

  const normalizedAnnualRate = normalizeRate(annualRate);
  const monthlyPayment = getMonthlyMortgagePayment(
    balance,
    normalizedAnnualRate,
    remainingMonths,
    scheduledPaymentOverride
  );
  const monthlyInterest = balance * (normalizedAnnualRate / 12);
  const scheduledPrincipal = monthlyPayment - monthlyInterest;
  const actualPrincipal = Math.min(balance, Math.max(0, scheduledPrincipal));
  const actualPayment = actualPrincipal + monthlyInterest;

  return {
    endingBalance: Math.max(0, balance - actualPrincipal),
    remainingMonths: Math.max(0, remainingMonths - 1),
    payment: actualPayment
  };
}

function getAnnualPropertyTax(property, propertyValue) {
  if (typeof property.annualPropertyTax === 'number') {
    return property.annualPropertyTax;
  }

  return propertyValue * normalizeRate(property.propertyTaxRate, DEFAULT_PROPERTY_TAX_RATE);
}

function getAnnualInsurance(property, propertyValue) {
  if (typeof property.annualInsurance === 'number') {
    return property.annualInsurance;
  }

  return propertyValue * normalizeRate(property.insuranceRate, DEFAULT_INSURANCE_RATE);
}

function getMonthlyTaxAndInsurance(property, propertyValue) {
  if (
    typeof property.monthlyTaxAndInsurance === 'number' &&
    !Number.isNaN(property.monthlyTaxAndInsurance) &&
    property.monthlyTaxAndInsurance >= 0
  ) {
    return property.monthlyTaxAndInsurance;
  }

  const annualPropertyTax = getAnnualPropertyTax(property, propertyValue);
  const annualInsurance = getAnnualInsurance(property, propertyValue);
  return (annualPropertyTax + annualInsurance) / 12;
}

function getSellingCostsPercent(property) {
  return normalizeRate(property.sellingCostsPercent, DEFAULT_SELLING_COSTS_PERCENT);
}

function getMonthlyAppreciationFactor(property) {
  return Math.pow(1 + normalizeRate(property.appreciationRate), 1 / 12);
}

function addAmountToDestination(portfolio, destination, amount) {
  portfolio[destination] += amount;
}

export function initializeRealEstateState(userData) {
  const currentDateParts = getCurrentDateParts();
  const projectionStartMonthIndex = toMonthIndex(currentDateParts.year, currentDateParts.month);

  const propertyStates = userData.realEstate.properties.map((property, index) => {
    const purchaseYear = getResolvedPurchaseYear(property, userData, currentDateParts);
    const purchaseMonth = getResolvedPurchaseMonth(property, currentDateParts);
    const sellYear = getResolvedSellYear(property, userData, currentDateParts);
    const sellMonth = getResolvedSellMonth(property, currentDateParts);
    const purchaseMonthIndex = toMonthIndex(purchaseYear, purchaseMonth);
    const sellMonthIndex =
      typeof sellYear === 'number' && typeof sellMonth === 'number'
        ? toMonthIndex(sellYear, sellMonth)
        : null;
    const isOwnedAtProjectionStart =
      projectionStartMonthIndex >= purchaseMonthIndex &&
      (sellMonthIndex === null || projectionStartMonthIndex <= sellMonthIndex);
    const monthsOwnedBeforeProjection = Math.max(0, projectionStartMonthIndex - purchaseMonthIndex);
    const currentValue = isOwnedAtProjectionStart
      ? getCurrentPropertyValue(
          property,
          property.purchasePrice * Math.pow(getMonthlyAppreciationFactor(property), monthsOwnedBeforeProjection)
        )
      : 0;

    return {
      ...property,
      name: property.name || `Home ${index + 1}`,
      propertyId: getPropertyId(property, index),
      purchaseYear,
      purchaseMonth,
      sellYear,
      sellMonth,
      purchaseMonthIndex,
      sellMonthIndex,
      sellingCostsPercent: getSellingCostsPercent(property),
      proceedsDestination:
        PROCEEDS_DESTINATION_ACCOUNTS.includes(property.proceedsDestination)
          ? property.proceedsDestination
          : 'cash',
      isOwned: isOwnedAtProjectionStart,
      isSold: sellMonthIndex !== null && projectionStartMonthIndex > sellMonthIndex,
      currentValue,
      currentMortgageBalance: isOwnedAtProjectionStart ? property.mortgage.remainingBalance : 0,
      remainingMortgageMonths: isOwnedAtProjectionStart
        ? getRemainingMortgageMonths(property, monthsOwnedBeforeProjection)
        : 0
    };
  });

  const rentalStates = (userData.realEstate.rentals ?? []).map((rental, index) => {
    const startMonthIndex = toMonthIndex(rental.startYear, rental.startMonth);
    const endMonthIndex =
      typeof rental.endYear === 'number' && typeof rental.endMonth === 'number'
        ? toMonthIndex(rental.endYear, rental.endMonth)
        : null;

    return {
      ...rental,
      name: rental.name || `Rental ${index + 1}`,
      rentalId: getRentalId(rental, index),
      startMonthIndex,
      endMonthIndex
    };
  });

  return {
    propertyStates,
    rentalStates
  };
}

export function simulateRealEstateMonth(housingState, monthIndex, portfolio) {
  const propertyStates = housingState.propertyStates ?? [];
  const rentalStates = housingState.rentalStates ?? [];
  let realEstateEquity = 0;
  let cashImpact = 0;
  let housingCost = 0;
  let ownedPropertyCount = 0;
  let activeRentalCount = 0;
  const saleEvents = [];

  for (const property of propertyStates) {
    if (property.isSold) {
      continue;
    }

    if (!property.isOwned && monthIndex === property.purchaseMonthIndex) {
      const downPayment = getDownPaymentAmount(property);

      property.isOwned = true;
      property.currentValue = property.purchasePrice;
      property.currentMortgageBalance = getInitialLoanBalance(property);
      property.remainingMortgageMonths = getRemainingMortgageMonths(property, 0);

      portfolio.cash -= downPayment;
      cashImpact -= downPayment;
    }

    if (!property.isOwned) {
      continue;
    }

    ownedPropertyCount += 1;

    const startingValue = property.currentValue;
    property.currentValue *= getMonthlyAppreciationFactor(property);

    const mortgageSummary = applyMortgagePaymentForMonth(
      property.currentMortgageBalance,
      property.mortgage.rate,
      property.remainingMortgageMonths,
      property.monthlyMortgagePayment
    );
    property.currentMortgageBalance = mortgageSummary.endingBalance;
    property.remainingMortgageMonths = mortgageSummary.remainingMonths;

    const averagePropertyValue = (startingValue + property.currentValue) / 2;
    const monthlyTaxAndInsurance = getMonthlyTaxAndInsurance(property, averagePropertyValue);
    const monthlyHousingCost = mortgageSummary.payment + monthlyTaxAndInsurance;

    portfolio.cash -= monthlyHousingCost;
    cashImpact -= monthlyHousingCost;
    housingCost += monthlyHousingCost;

    if (property.sellMonthIndex !== null && monthIndex === property.sellMonthIndex) {
      const salePrice =
        typeof property.expectedSalePrice === 'number' &&
        !Number.isNaN(property.expectedSalePrice) &&
        property.expectedSalePrice > 0
          ? property.expectedSalePrice
          : property.currentValue;
      const sellingCosts = salePrice * property.sellingCostsPercent;
      const warning =
        property.currentMortgageBalance > salePrice
          ? `Mortgage balance exceeds sale price for ${property.name}.`
          : null;
      const netProceeds = salePrice - property.currentMortgageBalance - sellingCosts;

      addAmountToDestination(portfolio, property.proceedsDestination, netProceeds);

      if (property.proceedsDestination === 'cash') {
        cashImpact += netProceeds;
      }

      saleEvents.push({
        propertyId: property.propertyId,
        propertyName: property.name,
        salePrice,
        netProceeds,
        destinationAccount: property.proceedsDestination,
        warning
      });

      property.isOwned = false;
      property.isSold = true;
      property.currentValue = 0;
      property.currentMortgageBalance = 0;
      property.remainingMortgageMonths = 0;
      continue;
    }

    realEstateEquity += Math.max(0, property.currentValue - property.currentMortgageBalance);
  }

  for (const rental of rentalStates) {
    const isActive =
      monthIndex >= rental.startMonthIndex &&
      (rental.endMonthIndex === null || monthIndex <= rental.endMonthIndex);

    if (!isActive) {
      continue;
    }

    activeRentalCount += 1;
    portfolio.cash -= rental.monthlyRent;
    cashImpact -= rental.monthlyRent;
    housingCost += rental.monthlyRent;
  }

  return {
    realEstateEquity,
    cashImpact,
    housingCost,
    ownedPropertyCount,
    activeRentalCount,
    saleEvents
  };
}
