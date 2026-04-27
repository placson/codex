const DEFAULT_FEDERAL_INCOME_TAX_RATE = 0.22;
const DEFAULT_SECA_TAX_RATE = 0.153;

export function normalizeRate(value, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return value > 1 ? value / 100 : value;
}

export function calculateHousingAllowanceAmount(totalSalary, housingAllowancePercent = 0) {
  const allowancePercent = normalizeRate(housingAllowancePercent, 0);
  return totalSalary * allowancePercent;
}

export function calculateTaxableIncome({
  baseSalary,
  housingAllowance = 0,
  housingAllowanceTaxExemptPercent = 1
}) {
  const exemptPercent = normalizeRate(housingAllowanceTaxExemptPercent, 1);
  const housingAllowanceAmount = calculateHousingAllowanceAmount(baseSalary, housingAllowance);

  // `baseSalary` is treated as total annual compensation for the phase.
  // The housing allowance is the share of that salary designated for housing,
  // and only the non-exempt portion remains subject to federal income tax.
  return baseSalary - housingAllowanceAmount * exemptPercent;
}

export function calculateNetIncome({
  baseSalary,
  compensationType = 'standard',
  housingAllowance = 0,
  housingAllowanceTaxExemptPercent = 1,
  incomeTaxRate = DEFAULT_FEDERAL_INCOME_TAX_RATE,
  secaTaxRate = DEFAULT_SECA_TAX_RATE
}) {
  const totalIncome = baseSalary;
  const isClergyCompensation = compensationType === 'clergy';
  const effectiveHousingAllowance = isClergyCompensation ? housingAllowance : 0;
  const effectiveHousingAllowanceTaxExemptPercent = isClergyCompensation
    ? housingAllowanceTaxExemptPercent
    : 0;
  const housingAllowanceAmount = calculateHousingAllowanceAmount(
    baseSalary,
    effectiveHousingAllowance
  );
  const taxableIncome = calculateTaxableIncome({
    baseSalary,
    housingAllowance: effectiveHousingAllowance,
    housingAllowanceTaxExemptPercent: effectiveHousingAllowanceTaxExemptPercent
  });
  const incomeTax = taxableIncome * incomeTaxRate;
  const secaTax = isClergyCompensation ? totalIncome * secaTaxRate : 0;

  return {
    totalIncome,
    housingAllowanceAmount,
    taxableIncome,
    incomeTax,
    secaTax,
    netIncome: totalIncome - incomeTax - secaTax
  };
}
