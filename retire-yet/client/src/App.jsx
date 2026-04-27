import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  DEFAULT_USER_ID,
  createCareerPhase,
  createExpenseBreakdown,
  createOtherIncomeStream,
  createProperty,
  createRental,
  defaultPlanData,
  expenseCategoryFields,
  getUserApiUrl,
  getUserProjectionApiUrl,
  housingEntryTypeOptions,
  monthOptions,
  mergeDeep,
  otherIncomeTypeOptions,
  careerPhaseTaxTreatmentOptions,
  proceedsDestinationOptions,
  stepLabels
} from './planModel';

function App() {
  const [currentUserId, setCurrentUserId] = useState(getInitialUserId);
  const [userIdDraft, setUserIdDraft] = useState(getInitialUserId);
  const [planData, setPlanData] = useState(defaultPlanData);
  const [projectionData, setProjectionData] = useState(null);
  const [selectedMarketScenario, setSelectedMarketScenario] = useState('significantlyBelowAverage');
  const [openScenarioInfoKey, setOpenScenarioInfoKey] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    void loadDashboardData();
  }, [currentUserId]);

  useEffect(() => {
    window.localStorage.setItem('retire-yet-user-id', currentUserId);
  }, [currentUserId]);

  async function loadDashboardData() {
    setIsLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const userApiUrl = getUserApiUrl(currentUserId);
      const projectionApiUrl = getUserProjectionApiUrl(currentUserId);
      const [planResponse, projectionResponse] = await Promise.all([
        fetch(userApiUrl),
        fetch(projectionApiUrl)
      ]);

      if (!planResponse.ok) {
        throw new Error('Unable to load plan data.');
      }

      if (!projectionResponse.ok) {
        throw new Error('Unable to load projections.');
      }

      const [plan, projection] = await Promise.all([
        planResponse.json(),
        projectionResponse.json()
      ]);

      const mergedPlan = mergeDeep(defaultPlanData, { ...plan, userId: currentUserId });
      const summaryGate = getSummaryGateState(mergedPlan);

      setPlanData(mergedPlan);
      setProjectionData(projection);
      setSelectedMarketScenario(projection.defaultMarketScenario ?? 'significantlyBelowAverage');
      setCurrentStep(summaryGate.canAccessSummary ? stepLabels.length - 1 : summaryGate.firstIncompleteStep);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError.message));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProjectionOnly() {
    const response = await fetch(getUserProjectionApiUrl(currentUserId));

    if (!response.ok) {
      throw new Error('Unable to refresh projections.');
    }

    const projection = await response.json();
    setProjectionData(projection);
    setSelectedMarketScenario(projection.defaultMarketScenario ?? 'significantlyBelowAverage');
  }

  function updateTopLevelSection(section, field, value) {
    setPlanData((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }

  function updateNestedSection(section, nestedSection, field, value) {
    setPlanData((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [nestedSection]: {
          ...current[section][nestedSection],
          [field]: value
        }
      }
    }));
  }

  function updateExpenseCategory(period, field, value) {
    setPlanData((current) => ({
      ...current,
      expenses: {
        ...current.expenses,
        [period]: {
          ...createExpenseBreakdown(),
          ...current.expenses?.[period],
          [field]: value
        }
      }
    }));
  }

  function updateCareerPhase(index, field, value) {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        careerPhases: current.income.careerPhases.map((phase, phaseIndex) =>
          phaseIndex === index ? { ...phase, [field]: value } : phase
        )
      }
    }));
  }

  function addCareerPhase() {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        careerPhases: [createCareerPhase(), ...current.income.careerPhases]
      }
    }));
  }

  function removeCareerPhase(index) {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        careerPhases: current.income.careerPhases.filter((_, phaseIndex) => phaseIndex !== index)
      }
    }));
  }

  function updateOtherIncomeStream(index, field, value) {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        otherIncomeStreams: current.income.otherIncomeStreams.map((incomeStream, streamIndex) =>
          streamIndex === index ? { ...incomeStream, [field]: value } : incomeStream
        )
      }
    }));
  }

  function addOtherIncomeStream() {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        otherIncomeStreams: [
          createOtherIncomeStream(current.income.otherIncomeStreams.length + 1),
          ...current.income.otherIncomeStreams
        ]
      }
    }));
  }

  function removeOtherIncomeStream(index) {
    setPlanData((current) => ({
      ...current,
      income: {
        ...current.income,
        otherIncomeStreams: current.income.otherIncomeStreams.filter(
          (_, streamIndex) => streamIndex !== index
        )
      }
    }));
  }

  function updateProperty(index, field, value) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        properties: current.realEstate.properties.map((property, propertyIndex) =>
          propertyIndex === index ? { ...property, [field]: value } : property
        )
      }
    }));
  }

  function setPropertyPaidOff(index, isPaidOff) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        properties: current.realEstate.properties.map((property, propertyIndex) => {
          if (propertyIndex !== index) {
            return property;
          }

          const purchasePrice = property.purchasePrice ?? 0;

          if (isPaidOff) {
            return {
              ...property,
              isPaidOff: true,
              downPayment: purchasePrice,
              mortgage: {
                ...property.mortgage,
                rate: 0,
                term: 30,
                remainingBalance: 0
              }
            };
          }

          return {
            ...property,
            isPaidOff: false
          };
        })
      }
    }));
  }

  function updatePropertyMortgage(index, field, value) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        properties: current.realEstate.properties.map((property, propertyIndex) =>
          propertyIndex === index
            ? {
                ...property,
                mortgage: {
                  ...property.mortgage,
                  [field]: value
                }
              }
            : property
        )
      }
    }));
  }

  function addProperty() {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        properties: [
          createProperty(current.realEstate.properties.length + 1),
          ...current.realEstate.properties
        ]
      }
    }));
  }

  function updateRental(index, field, value) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        rentals: current.realEstate.rentals.map((rental, rentalIndex) =>
          rentalIndex === index ? { ...rental, [field]: value } : rental
        )
      }
    }));
  }

  function addRental() {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        rentals: [createRental(current.realEstate.rentals.length + 1), ...current.realEstate.rentals]
      }
    }));
  }

  function removeRental(index) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        rentals: current.realEstate.rentals.filter((_, rentalIndex) => rentalIndex !== index)
      }
    }));
  }

  function removeProperty(index) {
    setPlanData((current) => ({
      ...current,
      realEstate: {
        ...current.realEstate,
        properties: current.realEstate.properties.filter(
          (_, propertyIndex) => propertyIndex !== index
        )
      }
    }));
  }

  function goToNextStep() {
    const currentStepErrors = getStepValidationErrors(planData, currentStep);

    if (currentStepErrors.length > 0) {
      setError(`Complete ${stepLabels[currentStep]} before moving to the next step.`);
      return;
    }

    setError('');
    setCurrentStep((step) => Math.min(step + 1, stepLabels.length - 1));
  }

  function goToPreviousStep() {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function handleStepSelection(targetStep) {
    if (targetStep <= currentStep) {
      setCurrentStep(targetStep);
      return;
    }

    const firstBlockingStep = findFirstBlockingStep(planData, targetStep);

    if (firstBlockingStep !== null) {
      setCurrentStep(firstBlockingStep);
      setError(`Complete ${stepLabels[firstBlockingStep]} before moving ahead.`);
      return;
    }

    setError('');
    setCurrentStep(targetStep);
  }

  function handleUserSwitch(event) {
    event.preventDefault();

    const normalizedUserId = normalizeUserIdInput(userIdDraft);

    if (!normalizedUserId) {
      setError('Enter a planner ID to load or create a local test user.');
      return;
    }

    if (normalizedUserId === currentUserId) {
      return;
    }

    setCurrentUserId(normalizedUserId);
    setSuccessMessage('');
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(getUserApiUrl(currentUserId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...planData,
          userId: currentUserId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to save plan data.');
      }

      const mergedPlan = mergeDeep(defaultPlanData, { ...data, userId: currentUserId });
      const summaryGate = getSummaryGateState(mergedPlan);

      setPlanData(mergedPlan);
      setSuccessMessage('Plan saved.');
      if (summaryGate.canAccessSummary && currentStep === stepLabels.length - 2) {
        setCurrentStep(stepLabels.length - 1);
      }

      try {
        await loadProjectionOnly();
        setSuccessMessage('Plan saved and projections refreshed.');
      } catch (projectionError) {
        setSuccessMessage('Plan saved, but projections could not be refreshed automatically.');
      }
    } catch (submitError) {
      setError(getFriendlyErrorMessage(submitError.message));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="planner-layout">
          <p className="status-text">Loading your plan and projections...</p>
        </section>
      </main>
    );
  }

  const yearlyResults = projectionData?.yearlyResults ?? [];
  const scenarioOptions = Object.values(projectionData?.marketScenarios ?? {});
  const activeMarketScenario =
    projectionData?.marketScenarios?.[selectedMarketScenario] ??
    scenarioOptions[0] ??
    null;
  const summaryStepIndex = stepLabels.length - 1;
  const summaryGate = getSummaryGateState(planData);
  const canAccessSummary = summaryGate.canAccessSummary;
  const isSummaryStep = currentStep === summaryStepIndex;
  const currentStepValidationErrors =
    currentStep < summaryStepIndex ? getStepValidationErrors(planData, currentStep) : [];
  const displayedYearlyResults = activeMarketScenario?.yearlyResults ?? yearlyResults;
  const netWorthData = displayedYearlyResults.map((year) => ({
    age: year.age,
    netWorth: year.netWorth,
    retirementBalance: year.retirementBalance,
    realEstateEquity: year.realEstateEquity
  }));
  const incomeExpenseData = displayedYearlyResults.map((year) => ({
    age: year.age,
    income: year.income,
    expenses: year.expenses
  }));
  const saleEvents = displayedYearlyResults.flatMap((year) =>
    (year.saleEvents ?? []).map((event) => ({
      ...event,
      age: year.age
    }))
  );
  const latestYear = displayedYearlyResults[displayedYearlyResults.length - 1];
  const retirementYear =
    displayedYearlyResults.find((year) => year.age === planData.personal.retirementAge) ?? latestYear;
  const successProbability = projectionData?.successProbability ?? 0;
  const readinessScore = Math.min(100, Math.round(successProbability * 100));
  const monteCarloData = [
    {
      name: 'Well Below Avg',
      value: projectionData?.p10RetirementPortfolio ?? 0,
      color: '#c96b5d'
    },
    {
      name: 'Below Avg',
      value: projectionData?.p25RetirementPortfolio ?? 0,
      color: '#d9a35b'
    },
    {
      name: 'Average',
      value: projectionData?.medianRetirementPortfolio ?? 0,
      color: '#4d8f7a'
    }
  ];
  const endOfLifeAssetData = scenarioOptions.map((scenario) => ({
    name:
      scenario.label === 'Well Below Average'
        ? 'Well Below Avg'
        : scenario.label === 'Below Average'
          ? 'Below Avg'
          : scenario.label,
    value: scenario.yearlyResults?.[scenario.yearlyResults.length - 1]?.netWorth ?? 0,
    color:
      scenario.key === 'significantlyBelowAverage'
        ? '#c96b5d'
        : scenario.key === 'belowAverage'
          ? '#d9a35b'
          : '#4d8f7a'
  }));
  const activeRetirementSnapshot =
    activeMarketScenario?.retirementSnapshot ?? projectionData?.retirementSnapshot ?? null;
  const retirementBreakdownSource =
    retirementYear && retirementYear.balances
      ? {
          cash: retirementYear.balances.cash ?? 0,
          brokerage: retirementYear.balances.brokerage ?? 0,
          retirementAccounts: {
            '401k': retirementYear.balances['401k'] ?? 0,
            ira: retirementYear.balances.ira ?? 0,
            rothIra: retirementYear.balances.rothIra ?? 0
          },
          realEstateEquity: retirementYear.realEstateEquity ?? 0
        }
      : activeRetirementSnapshot?.totalAssetsBreakdown ?? null;
  const retirementBreakdown = retirementBreakdownSource
    ? [
        {
          name: 'Cash',
          value: retirementBreakdownSource.cash,
          color: '#6f8ea4'
        },
        {
          name: 'Brokerage',
          value: retirementBreakdownSource.brokerage,
          color: '#4d8f7a'
        },
        {
          name: '401(k)',
          value: retirementBreakdownSource.retirementAccounts['401k'],
          color: '#d18d47'
        },
        {
          name: 'IRA',
          value: retirementBreakdownSource.retirementAccounts.ira,
          color: '#8e7cc3'
        },
        {
          name: 'Roth IRA',
          value: retirementBreakdownSource.retirementAccounts.rothIra,
          color: '#d86a78'
        },
        {
          name: 'Real Estate',
          value: retirementBreakdownSource.realEstateEquity,
          color: '#9caa5a'
        }
      ].filter((asset) => asset.value > 0)
    : [];
  const retirementBreakdownTotal = retirementBreakdown.reduce(
    (total, asset) => total + asset.value,
    0
  );

  return (
    <main className="app-shell">
      <section className="planner-layout">
        <aside className="step-sidebar">
          <p className="eyebrow">Retirement Planner</p>
          <h1>Build and stress-test your plan</h1>
          <p className="subtle">
            Edit income, assets, and real-estate sale rules, then inspect how the plan evolves.
          </p>

          <form className="user-switcher" onSubmit={handleUserSwitch}>
            <label className="field compact-field">
              <span>Planner ID</span>
              <input
                type="text"
                value={userIdDraft}
                onChange={(event) => setUserIdDraft(event.target.value)}
                placeholder="demo-user"
              />
              <small>
                Local multi-user testing only. Loading a new ID creates a separate planner.
              </small>
            </label>
            <button type="submit" className="secondary-button">
              Load planner
            </button>
          </form>

          <p className="subtle active-user-label">Active planner: {currentUserId}</p>

          <ol className="step-list">
            {stepLabels.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={`step-pill ${index === currentStep ? 'is-active' : ''}`}
                  onClick={() => handleStepSelection(index)}
                  disabled={index === summaryStepIndex && !canAccessSummary}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>

          {!canAccessSummary ? (
            <p className="status-text onboarding-note">
              Complete {formatStepList(summaryGate.incompleteStepLabels)} to unlock Retirement Summary.
            </p>
          ) : null}
        </aside>

        <section className="content-column">
          {!isSummaryStep ? (
            <form className="form-panel" onSubmit={handleSubmit}>
              <header className="form-header">
                <div>
                  <p className="eyebrow">Step {currentStep + 1}</p>
                  <h2>{stepLabels[currentStep]}</h2>
                </div>
                <button type="button" className="secondary-button" onClick={loadDashboardData}>
                  Reload from server
                </button>
              </header>

              {currentStepValidationErrors.length > 0 ? (
                <div className="status-text error-text validation-panel">
                  <strong>Required before continuing</strong>
                  <ul className="validation-list">
                    {currentStepValidationErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? <p className="status-text error-text">{error}</p> : null}
              {successMessage ? <p className="status-text success-text">{successMessage}</p> : null}

              <FormStep
                currentStep={currentStep}
                planData={planData}
                updateCareerPhase={updateCareerPhase}
                updateExpenseCategory={updateExpenseCategory}
                updateNestedSection={updateNestedSection}
                updateOtherIncomeStream={updateOtherIncomeStream}
                updateProperty={updateProperty}
                updatePropertyMortgage={updatePropertyMortgage}
                setPropertyPaidOff={setPropertyPaidOff}
                updateRental={updateRental}
                updateTopLevelSection={updateTopLevelSection}
                addCareerPhase={addCareerPhase}
                addOtherIncomeStream={addOtherIncomeStream}
                addProperty={addProperty}
                addRental={addRental}
                removeCareerPhase={removeCareerPhase}
                removeOtherIncomeStream={removeOtherIncomeStream}
                removeProperty={removeProperty}
                removeRental={removeRental}
              />

              <StepNavigation
                currentStep={currentStep}
                isSubmitting={isSubmitting}
                onNext={goToNextStep}
                onPrevious={goToPreviousStep}
                canAccessSummary={canAccessSummary}
                isCurrentStepValid={currentStepValidationErrors.length === 0}
                showSave
              />
            </form>
          ) : null}

          {isSummaryStep ? (
            <Dashboard
              activeMarketScenario={activeMarketScenario}
              endOfLifeAssetData={endOfLifeAssetData}
              incomeExpenseData={incomeExpenseData}
              latestYear={latestYear}
              marketScenarioOptions={scenarioOptions}
              monteCarloData={monteCarloData}
              netWorthData={netWorthData}
              onSelectMarketScenario={setSelectedMarketScenario}
              onToggleScenarioInfo={setOpenScenarioInfoKey}
              openScenarioInfoKey={openScenarioInfoKey}
              selectedMarketScenario={selectedMarketScenario}
              yearlyResults={displayedYearlyResults}
              lifeExpectancy={planData.personal.lifeExpectancy}
              projectionData={projectionData}
              readinessScore={readinessScore}
              retirementAge={planData.personal.retirementAge}
              retirementBreakdown={retirementBreakdown}
              retirementBreakdownTotal={retirementBreakdownTotal}
              retirementYear={retirementYear}
              saleEvents={saleEvents}
              summaryStepIndex={summaryStepIndex}
              currentStep={currentStep}
              isSubmitting={isSubmitting}
              isSummaryStep={isSummaryStep}
              onNextStep={goToNextStep}
              onPreviousStep={goToPreviousStep}
              onReload={loadDashboardData}
              showAlerts={isSummaryStep}
              error={error}
              successMessage={successMessage}
            />
          ) : null}
        </section>
      </section>

      {isSummaryStep ? (
        <section className="summary-ledger-section">
          <ChartCard
            title="Withdrawal ledger"
            description="Open the ledger to inspect annual expenses, how much is paid from cash on hand, and when true portfolio drawdowns begin."
          >
            <WithdrawalLedger yearlyResults={displayedYearlyResults} retirementAge={planData.personal.retirementAge} />
          </ChartCard>
        </section>
      ) : null}
    </main>
  );
}

function Dashboard({
  activeMarketScenario,
  currentStep,
  endOfLifeAssetData,
  error,
  incomeExpenseData,
  isSubmitting,
  isSummaryStep,
  latestYear,
  lifeExpectancy,
  marketScenarioOptions,
  monteCarloData,
  netWorthData,
  onNextStep,
  onPreviousStep,
  onReload,
  onSelectMarketScenario,
  onToggleScenarioInfo,
  openScenarioInfoKey,
  yearlyResults,
  projectionData,
  readinessScore,
  retirementAge,
  retirementBreakdown,
  retirementBreakdownTotal,
  selectedMarketScenario,
  retirementYear,
  saleEvents,
  showAlerts,
  successMessage,
  summaryStepIndex
}) {
  return (
    <section className="dashboard-panel">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Step {summaryStepIndex + 1}</p>
          <h2>Retirement Summary</h2>
        </div>
        {isSummaryStep ? (
          <button type="button" className="secondary-button" onClick={onReload}>
            Reload from server
          </button>
        ) : null}
      </header>

      {showAlerts && error ? <p className="status-text error-text">{error}</p> : null}
      {showAlerts && successMessage ? <p className="status-text success-text">{successMessage}</p> : null}

      <MarketScenarioToggle
        activeMarketScenario={activeMarketScenario}
        marketScenarioOptions={marketScenarioOptions}
        onSelectMarketScenario={onSelectMarketScenario}
        onToggleScenarioInfo={onToggleScenarioInfo}
        openScenarioInfoKey={openScenarioInfoKey}
        selectedMarketScenario={selectedMarketScenario}
      />

      <div className="summary-grid">
        <MetricCard
          label="Projected assets at retirement"
          value={formatCurrency(retirementBreakdownTotal)}
          detail={`at age ${retirementAge ?? '-'}`}
          tone="teal"
        />
        <MetricCard
          label="Recommended working spend"
          value={formatCurrency(projectionData?.recommendedWorkingSpend ?? 0)}
          detail={
            (projectionData?.recommendedWorkingSpend ?? 0) > 0
              ? 'per month'
              : 'no extra monthly surplus above your current modeled spending'
          }
          tone="sand"
        />
        <MetricCard
          label="Recommended retirement spend"
          value={formatCurrency(
            activeMarketScenario?.recommendedRetirementSpend ??
              projectionData?.recommendedRetirementSpend ??
              0
          )}
          detail="per month"
          tone="green"
        />
        <MetricCard
          label="Probability of Success"
          value={formatPercent(projectionData?.successProbability ?? 0)}
          infoContent={getProbabilityOfSuccessInfoCopy(
            projectionData?.successProbability ?? 0,
            retirementYear?.expenses ?? 0,
            lifeExpectancy
          )}
          tone="slate"
        />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Net worth over time"
          description="Net worth, retirement balance, and real-estate equity by age."
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={netWorthData}>
              <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 3" />
              <XAxis dataKey="age" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={formatCurrencyCompact}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip formatter={tooltipCurrency} />
              <Line type="monotone" dataKey="netWorth" stroke="#173042" strokeWidth={3} dot={false} />
              <Line
                type="monotone"
                dataKey="retirementBalance"
                stroke="#4d8f7a"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="realEstateEquity"
                stroke="#d18d47"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Income vs expenses"
          description="Annual income and annual expenses across the projection horizon."
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incomeExpenseData}>
              <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 3" />
              <XAxis dataKey="age" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={formatCurrencyCompact}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip formatter={tooltipCurrency} />
              <Bar dataKey="income" fill="#4d8f7a" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" fill="#d18d47" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Retirement readiness"
          description="Success odds, retirement assets, and the configured spending rule."
        >
          <div className="readiness-block">
            <div
              className="readiness-ring"
              style={{
                background: `conic-gradient(#4d8f7a 0deg, #4d8f7a ${
                  readinessScore * 3.6
                }deg, #dde8e2 ${readinessScore * 3.6}deg, #dde8e2 360deg)`
              }}
            >
              <div className="readiness-ring-inner">
                <strong>{readinessScore}%</strong>
                <span>success rate</span>
              </div>
            </div>
            <div className="readiness-copy">
              <p>
                Retirement at age <strong>{retirementYear?.age ?? '-'}</strong> projects{' '}
                <strong>{formatCurrency(retirementYear?.retirementBalance ?? 0)}</strong> in
                retirement assets.
              </p>
              <p>
                Across 1,000 Monte Carlo runs,{' '}
                <strong>{Math.round((projectionData?.successProbability ?? 0) * 1000)}</strong>{' '}
                successfully supported about{' '}
                <strong>{formatCurrency((retirementYear?.expenses ?? 0) / 12)}</strong> per month of retirement
                spending through age <strong>{lifeExpectancy}</strong>.
              </p>
              <p>
                Suggested retirement spending is{' '}
                <strong>
                  {formatCurrency(
                    activeMarketScenario?.recommendedRetirementSpend ??
                      projectionData?.recommendedRetirementSpend ??
                      0
                  )}
                </strong>{' '}
                per month using the configured withdrawal rule.
              </p>
              <p>
                Retirement snapshot net worth:{' '}
                <strong>{formatCurrency(activeMarketScenario?.retirementSnapshot?.totalNetWorth ?? projectionData?.retirementSnapshot?.totalNetWorth ?? 0)}</strong>
              </p>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Monte Carlo results"
          description="Representative retirement-date portfolios for the same three market cases used by the toggle."
        >
          <div className="monte-carlo-grid">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monteCarloData} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={formatCurrencyCompact}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip formatter={tooltipCurrency} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {monteCarloData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="scenario-list">
              {monteCarloData.map((scenario) => (
                <div key={scenario.name} className="scenario-card">
                  <span>{scenario.name}</span>
                  <strong>{formatCurrency(scenario.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Projected assets at end of life"
          description="End-of-life net worth under the same three market cases."
        >
          <div className="monte-carlo-grid">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={endOfLifeAssetData} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={formatCurrencyCompact}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip formatter={tooltipCurrency} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {endOfLifeAssetData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="scenario-list">
              {endOfLifeAssetData.map((scenario) => (
                <div key={scenario.name} className="scenario-card">
                  <span>{scenario.name}</span>
                  <strong>{formatCurrency(scenario.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Sale event summary"
          description="Projected sale timing, gross sale price, and where proceeds are allocated."
        >
          <div className="event-list">
            {saleEvents.length === 0 ? (
              <p className="subtle">No property sales are currently scheduled.</p>
            ) : (
              saleEvents.map((event) => (
                <div key={`${event.propertyId}-${event.age}`} className="event-card">
                  <div>
                    <strong>{event.propertyName ?? event.propertyId}</strong>
                    <p className="subtle">Age {event.age}</p>
                  </div>
                  <div className="event-values">
                    <span>Sale price: {formatCurrency(event.salePrice)}</span>
                    <span>Net proceeds: {formatCurrency(event.netProceeds)}</span>
                    <span>Destination: {formatDestinationLabel(event.destinationAccount)}</span>
                    {event.warning ? <span className="warning-text">{event.warning}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </ChartCard>

        <ChartCard
          title={`Retirement assets at age ${retirementAge ?? '-'}`}
          description={`Total assets at the beginning of retirement: ${formatCurrency(retirementBreakdownTotal)}.`}
        >
          <div className="retirement-breakdown-grid">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={retirementBreakdown}>
                <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={formatCurrencyCompact}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <Tooltip formatter={tooltipCurrency} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {retirementBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="scenario-list">
              {retirementBreakdown.map((asset) => (
                <div key={asset.name} className="scenario-card">
                  <span>{asset.name}</span>
                  <strong>{formatCurrency(asset.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

      </div>

      {isSummaryStep ? (
        <StepNavigation
          currentStep={currentStep}
          isSubmitting={isSubmitting}
          onNext={onNextStep}
          onPrevious={onPreviousStep}
          showSave={false}
        />
      ) : null}
    </section>
  );
}

function StepNavigation({
  currentStep,
  isSubmitting,
  onNext,
  onPrevious,
  canAccessSummary,
  isCurrentStepValid,
  showSave
}) {
  const isSummaryLocked =
    currentStep === stepLabels.length - 2 && (!canAccessSummary || !isCurrentStepValid);
  const isNextDisabled =
    !isCurrentStepValid || (currentStep === stepLabels.length - 2 && !canAccessSummary);

  return (
    <footer className="form-footer">
      <button
        type="button"
        className="secondary-button"
        onClick={onPrevious}
        disabled={currentStep === 0}
      >
        Previous step
      </button>

      <div className="footer-actions">
        {currentStep < stepLabels.length - 1 ? (
          <button
            type="button"
            className="primary-button"
            onClick={onNext}
            disabled={isNextDisabled}
          >
            Next step
          </button>
        ) : null}

        {showSave ? (
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting || !isCurrentStepValid}
          >
            {isSubmitting ? 'Saving...' : 'Save plan'}
          </button>
        ) : null}
      </div>
    </footer>
  );
}

function MarketScenarioToggle({
  activeMarketScenario,
  marketScenarioOptions,
  onSelectMarketScenario,
  onToggleScenarioInfo,
  openScenarioInfoKey,
  selectedMarketScenario
}) {
  if (marketScenarioOptions.length === 0) {
    return null;
  }

  return (
    <section className="scenario-toggle-panel">
      <div className="scenario-toggle-copy">
        <p className="eyebrow">Market View</p>
        <h3>Projection confidence bands</h3>
        <p className="subtle">
          Switch between conservative and midpoint market paths based on simulated outcomes.
        </p>
      </div>

      <div className="scenario-toggle-group" role="tablist" aria-label="Market projection scenarios">
        {marketScenarioOptions.map((scenario) => (
          <div key={scenario.key} className="scenario-toggle-wrap">
            <div className="scenario-toggle-head">
              <button
                type="button"
                className={`scenario-toggle ${scenario.key === selectedMarketScenario ? 'is-active' : ''}`}
                onClick={() => onSelectMarketScenario(scenario.key)}
              >
                <strong>{scenario.label}</strong>
              </button>

              <button
                type="button"
                className={`scenario-info-button ${openScenarioInfoKey === scenario.key ? 'is-active' : ''}`}
                aria-label={`Explain ${scenario.label} scenario`}
                aria-expanded={openScenarioInfoKey === scenario.key}
                onClick={() =>
                  onToggleScenarioInfo(openScenarioInfoKey === scenario.key ? null : scenario.key)
                }
              >
                i
              </button>
            </div>

            {openScenarioInfoKey === scenario.key ? (
              <div className="scenario-info-popover">
                <strong>{scenario.label}</strong>
                <p>{getScenarioInfoCopy(scenario.label, scenario.confidenceLevel)}</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {activeMarketScenario ? (
        <p className="scenario-toggle-note">
          {activeMarketScenario.description}
        </p>
      ) : null}
    </section>
  );
}

function WithdrawalLedger({ yearlyResults, retirementAge }) {
  const retirementYears = yearlyResults.filter((year) => year.age >= retirementAge);
  const firstBrokerageDraw = retirementYears.find((year) => (year.withdrawals?.brokerage ?? 0) > 0);
  const firstIraDraw = retirementYears.find((year) => (year.withdrawals?.ira ?? 0) > 0);
  const first401kDraw = retirementYears.find((year) => (year.withdrawals?.['401k'] ?? 0) > 0);

  return (
    <details className="ledger-shell">
      <summary className="ledger-summary">
        <div>
          <strong>Year-by-year withdrawal ledger</strong>
          <p className="subtle">
            {yearlyResults.length} annual rows from age {yearlyResults[0]?.age ?? '-'} to{' '}
            {yearlyResults[yearlyResults.length - 1]?.age ?? '-'}
          </p>
        </div>
        <span className="ledger-summary-action">Expand</span>
      </summary>

      <div className="ledger-overview">
        <div className="ledger-overview-card">
          <span>Retirement drawdown order</span>
          <strong>Cash → Brokerage → IRA → 401(k)</strong>
        </div>
        <div className="ledger-overview-card">
          <span>First brokerage draw</span>
          <strong>{firstBrokerageDraw ? `Age ${firstBrokerageDraw.age}` : 'Not used'}</strong>
        </div>
        <div className="ledger-overview-card">
          <span>First IRA draw</span>
          <strong>{firstIraDraw ? `Age ${firstIraDraw.age}` : 'Not used'}</strong>
        </div>
        <div className="ledger-overview-card">
          <span>First 401(k) draw</span>
          <strong>{first401kDraw ? `Age ${first401kDraw.age}` : 'Not used'}</strong>
        </div>
      </div>

      <div className="ledger-table-header" role="presentation">
        <span>Year</span>
        <span>Expenses</span>
        <span>Expense funding</span>
        <span>Liquid assets</span>
        <span>Retirement assets</span>
        <span>Net worth</span>
      </div>

      <div className="ledger-rows">
        {yearlyResults.map((year) => {
          const liquidAssets = (year.balances?.cash ?? 0) + (year.balances?.brokerage ?? 0);
          const retirementAssets =
            (year.balances?.ira ?? 0) + (year.balances?.['401k'] ?? 0) + (year.balances?.rothIra ?? 0);

          return (
            <details key={year.age} className="ledger-row">
              <summary className="ledger-row-summary">
                <span>
                  <strong>Age {year.age}</strong>
                  <small>{year.age >= retirementAge ? 'Retired' : 'Working'}</small>
                </span>
                <span>{formatCurrency(year.expenses)}</span>
                <span>{formatExpenseFundingSummary(year.expenseFunding)}</span>
                <span>{formatCurrency(liquidAssets)}</span>
                <span>{formatCurrency(retirementAssets)}</span>
                <span>{formatCurrency(year.netWorth)}</span>
              </summary>

              <div className="ledger-row-details">
                <div className="ledger-detail-grid">
                  <LedgerMetric
                    label="Income"
                    value={formatCurrency(year.income)}
                    detail={year.age >= retirementAge ? 'Retirement income year' : 'Working income year'}
                  />
                  <LedgerMetric
                    label="Cash impact"
                    value={formatSignedCurrency(year.cashImpact ?? 0)}
                    detail="Real-estate carrying costs and sale proceeds."
                  />
                  <LedgerMetric
                    label="Withdrawal order"
                    value={formatWithdrawalOrder(year.withdrawalOrder)}
                    detail="Applied only after recurring income and cash reserves are exhausted."
                  />
                  <LedgerMetric
                    label="Sale events"
                    value={year.saleEvents?.length ? `${year.saleEvents.length} event` : 'None'}
                    detail={year.saleEvents?.length ? summarizeSaleEvents(year.saleEvents) : 'No property sale in this year.'}
                  />
                </div>

                <div className="ledger-balance-grid">
                  <div className="ledger-balance-card">
                    <span>End-of-year balances</span>
                    <ul>
                      <li>Cash: {formatCurrency(year.balances?.cash ?? 0)}</li>
                      <li>Brokerage: {formatCurrency(year.balances?.brokerage ?? 0)}</li>
                      <li>IRA: {formatCurrency(year.balances?.ira ?? 0)}</li>
                      <li>401(k): {formatCurrency(year.balances?.['401k'] ?? 0)}</li>
                      <li>Roth IRA: {formatCurrency(year.balances?.rothIra ?? 0)}</li>
                      <li>Real-estate equity: {formatCurrency(year.realEstateEquity ?? 0)}</li>
                    </ul>
                  </div>

                  <div className="ledger-balance-card">
                    <span>How expenses were funded</span>
                    <ul>
                      <li>Paid from recurring income: {formatCurrency(year.expenseFunding?.income ?? 0)}</li>
                      <li>Paid from cash reserves: {formatCurrency(year.expenseFunding?.cash ?? 0)}</li>
                      <li>Drawn from brokerage: {formatCurrency(year.expenseFunding?.brokerage ?? 0)}</li>
                      <li>Drawn from IRA: {formatCurrency(year.expenseFunding?.ira ?? 0)}</li>
                      <li>Drawn from 401(k): {formatCurrency(year.expenseFunding?.['401k'] ?? 0)}</li>
                      <li>Drawn from Roth IRA: {formatCurrency(year.expenseFunding?.rothIra ?? 0)}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

function LedgerMetric({ label, value, detail }) {
  return (
    <div className="ledger-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function MetricCard({ label, value, detail, infoContent, tone }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-header">
        <p>{label}</p>
        {infoContent ? (
          <details className="metric-info">
            <summary className="metric-info-button" aria-label={`Explain ${label}`}>
              i
            </summary>
            <div className="metric-info-popover">
              <p>{infoContent}</p>
            </div>
          </details>
        ) : null}
      </div>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

function ChartCard({ title, description, children }) {
  return (
    <article className="chart-card">
      <div className="chart-header">
        <h3>{title}</h3>
        <p className="subtle">{description}</p>
      </div>
      {children}
    </article>
  );
}

function FormStep(props) {
  const {
    currentStep,
    planData,
    updateCareerPhase,
    updateExpenseCategory,
    updateNestedSection,
    updateOtherIncomeStream,
    updateProperty,
    updatePropertyMortgage,
    setPropertyPaidOff,
    updateRental,
    updateTopLevelSection,
    addCareerPhase,
    addOtherIncomeStream,
    addProperty,
    addRental,
    removeCareerPhase,
    removeOtherIncomeStream,
    removeProperty,
    removeRental
  } = props;
  const [housingEntryType, setHousingEntryType] = useState('property');
  const [incomeEntryType, setIncomeEntryType] = useState('salaryIncome');

  const normalizedExpenses = getNormalizedExpenseState(planData.expenses);
  const currentNonHousingMonthlyTotal = getExpenseBreakdownTotal(normalizedExpenses.current);
  const retirementNonHousingMonthlyTotal = getExpenseBreakdownTotal(normalizedExpenses.retirement);
  const housingTimelineWarnings = getHousingTimelineWarnings(planData);
  const workingBudgetWarnings = getWorkingBudgetWarnings(planData, normalizedExpenses.current);
  const currentHousingMonthlyEstimate = estimateMonthlyHousingCostForAge(
    planData,
    planData.personal.currentAge
  );
  const retirementHousingMonthlyEstimate = estimateMonthlyHousingCostForAge(
    planData,
    planData.personal.retirementAge
  );

  if (currentStep === 0) {
    return (
      <section className="step-content">
        <div className="field-grid">
          <NumberField
            label="Current age"
            value={planData.personal.currentAge}
            onChange={(value) => updateTopLevelSection('personal', 'currentAge', value)}
          />
          <NumberField
            label="Retirement age"
            value={planData.personal.retirementAge}
            onChange={(value) => updateTopLevelSection('personal', 'retirementAge', value)}
          />
          <NumberField
            label="Life expectancy"
            value={planData.personal.lifeExpectancy}
            onChange={(value) => updateTopLevelSection('personal', 'lifeExpectancy', value)}
          />
        </div>
      </section>
    );
  }

  if (currentStep === 1) {
    return (
      <section className="step-content">
        <div className="section-header">
          <div>
            <h3>Income entries</h3>
            <p className="subtle">
              Add salary-based income phases with explicit start and end ages, or recurring
              non-job income sources like passive rental income.
            </p>
          </div>
          <div className="footer-actions">
            <label className="inline-select">
              <span>Income type</span>
              <select value={incomeEntryType} onChange={(event) => setIncomeEntryType(event.target.value)}>
                <option value="salaryIncome">Salary income</option>
                <option value="otherIncome">Other income</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                incomeEntryType === 'otherIncome' ? addOtherIncomeStream() : addCareerPhase()
              }
            >
              Add income
            </button>
          </div>
        </div>

        <div className="section-header">
          <div>
            <h3>Other income</h3>
            <p className="subtle">
              Add recurring non-job income here, such as passive rental income, business income,
              or other taxable cash flow.
            </p>
          </div>
        </div>

        <div className="card-list">
          {planData.income.otherIncomeStreams?.length ? (
            planData.income.otherIncomeStreams.map((incomeStream, index) => (
              <section key={`other-income-${index}`} className="data-card">
                <div className="card-header">
                  <h4>{incomeStream.name?.trim() || `Other income ${index + 1}`}</h4>
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => removeOtherIncomeStream(index)}
                  >
                    Remove
                  </button>
                </div>

                <div className="field-grid">
                  <TextField
                    label="Income label"
                    value={incomeStream.name ?? ''}
                    onChange={(value) => updateOtherIncomeStream(index, 'name', value)}
                    hint="For example duplex cash flow or advisory income."
                  />
                  <SelectField
                    label="Income type"
                    value={incomeStream.incomeType ?? 'passive'}
                    options={otherIncomeTypeOptions}
                    onChange={(value) => updateOtherIncomeStream(index, 'incomeType', value)}
                  />
                  <CurrencyField
                    label="Annual amount"
                    value={incomeStream.annualAmount ?? 0}
                    onChange={(value) => updateOtherIncomeStream(index, 'annualAmount', value)}
                  />
                  <DecimalField
                    label="Taxable percent"
                    value={incomeStream.taxablePercent ?? 1}
                    onChange={(value) => updateOtherIncomeStream(index, 'taxablePercent', value)}
                    hint="Use 1.0 if fully taxable or 0.5 if only half is taxable."
                  />
                  <NumberField
                    label="Start age"
                    value={incomeStream.startAge ?? 0}
                    onChange={(value) => updateOtherIncomeStream(index, 'startAge', value)}
                  />
                  <NumberField
                    label="End age"
                    value={incomeStream.endAge ?? 0}
                    onChange={(value) => updateOtherIncomeStream(index, 'endAge', value)}
                  />
                </div>
              </section>
            ))
          ) : (
            <p className="status-text">
              No passive or other non-job income added yet.
            </p>
          )}
        </div>

        <div className="section-header">
          <div>
            <h3>Salary income</h3>
            <p className="subtle">
              Capture each job phase and choose whether it uses standard salary tax treatment or clergy compensation.
            </p>
          </div>
        </div>

        <div className="card-list">
          {planData.income.careerPhases.map((phase, index) => (
            <section key={`phase-${index}`} className="data-card">
              <div className="card-header">
                <h4>{phase.title?.trim() || `Phase ${index + 1}`}</h4>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => removeCareerPhase(index)}
                  disabled={planData.income.careerPhases.length === 1}
                >
                  Remove
                </button>
              </div>

              {phase.compensationType === 'clergy' ? (
                <p className="subtle section-note">
                  Housing allowance is a percentage of salary earmarked for housing. That portion can be exempt from federal income tax, but it is still included in SECA tax for clergy compensation.
                </p>
              ) : (
                <p className="subtle section-note">
                  Standard salary phases use regular income-tax treatment. Housing allowance and SECA do not apply unless you switch this phase to clergy compensation.
                </p>
              )}

              <div className="field-grid">
                <TextField
                  label="Job title"
                  value={phase.title ?? ''}
                  onChange={(value) => updateCareerPhase(index, 'title', value)}
                  hint="Label this career phase, for example Senior Pastor or School Administrator."
                />
                <SelectField
                  label="Tax treatment"
                  value={phase.compensationType ?? 'standard'}
                  options={careerPhaseTaxTreatmentOptions}
                  onChange={(value) => updateCareerPhase(index, 'compensationType', value)}
                />
                <NumberField
                  label="Start age"
                  value={phase.startAge}
                  onChange={(value) => updateCareerPhase(index, 'startAge', value)}
                />
                <NumberField
                  label="End age"
                  value={phase.endAge}
                  onChange={(value) => updateCareerPhase(index, 'endAge', value)}
                />
                <CurrencyField
                  label="Annual salary"
                  value={phase.baseSalary ?? phase.salary ?? 0}
                  onChange={(value) => updateCareerPhase(index, 'baseSalary', value)}
                  hint="Total annual compensation for this phase before tax treatment."
                />
                {phase.compensationType === 'clergy' ? (
                  <>
                    <PercentField
                      label="Housing allowance %"
                      value={phase.housingAllowance ?? 0}
                      onChange={(value) => updateCareerPhase(index, 'housingAllowance', value ?? 0)}
                      hint="Percent of salary designated for housing. Example: 50 means 50% of salary."
                    />
                    <DecimalField
                      label="Housing allowance tax-exempt %"
                      value={phase.housingAllowanceTaxExemptPercent ?? 1}
                      onChange={(value) =>
                        updateCareerPhase(index, 'housingAllowanceTaxExemptPercent', value)
                      }
                      hint="Use 1.0 for fully exempt or 0.5 for 50% of the housing-designated amount exempt."
                    />
                  </>
                ) : (
                  <>
                    <ReadOnlyField
                      label="Housing allowance %"
                      value="Not used for standard salary"
                      hint="Switch tax treatment to clergy compensation to model a housing allowance."
                    />
                    <ReadOnlyField
                      label="Housing allowance tax-exempt %"
                      value="Not used for standard salary"
                      hint="SECA and clergy housing allowance are only applied to clergy phases."
                    />
                  </>
                )}
                <PercentField
                  label="Retirement contribution %"
                  value={phase.retirementContributionPercent}
                  onChange={(value) =>
                    updateCareerPhase(index, 'retirementContributionPercent', value)
                  }
                />
                <PercentField
                  label="Employer match %"
                  value={phase.employerMatch}
                  onChange={(value) => updateCareerPhase(index, 'employerMatch', value)}
                />
              </div>
            </section>
          ))}
        </div>
      </section>
    );
  }

  if (currentStep === 2) {
    return (
      <section className="step-content">
        <div className="field-grid">
          <CurrencyField
            label="Cash"
            value={planData.assets.cash}
            onChange={(value) => updateTopLevelSection('assets', 'cash', value)}
          />
          <CurrencyField
            label="Brokerage"
            value={planData.assets.brokerage}
            onChange={(value) => updateTopLevelSection('assets', 'brokerage', value)}
          />
          <CurrencyField
            label="401(k)"
            value={planData.assets.retirementAccounts['401k']}
            onChange={(value) =>
              updateNestedSection('assets', 'retirementAccounts', '401k', value)
            }
          />
          <CurrencyField
            label="IRA"
            value={planData.assets.retirementAccounts.ira}
            onChange={(value) => updateNestedSection('assets', 'retirementAccounts', 'ira', value)}
          />
          <CurrencyField
            label="Roth IRA"
            value={planData.assets.retirementAccounts.rothIra}
            onChange={(value) =>
              updateNestedSection('assets', 'retirementAccounts', 'rothIra', value)
            }
          />
        </div>
      </section>
    );
  }

  if (currentStep === 3) {
    return (
      <section className="step-content">
        <div className="section-header">
          <div>
            <h3>Housing entries</h3>
            <p className="subtle">
              Add owned homes and rentals here. The projection uses these month-by-month housing
              entries to calculate shelter costs.
            </p>
          </div>
          <div className="footer-actions">
            <label className="inline-select">
              <span>Housing type</span>
              <select value={housingEntryType} onChange={(event) => setHousingEntryType(event.target.value)}>
                {housingEntryTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => (housingEntryType === 'rental' ? addRental() : addProperty())}
            >
              Add housing
            </button>
          </div>
        </div>

        {housingTimelineWarnings.map((warning) => (
          <p key={warning} className="status-text warning-text">
            {warning}
          </p>
        ))}

        <div className="card-list">
          {planData.realEstate.properties.length === 0 &&
          (planData.realEstate.rentals ?? []).length === 0 ? (
            <p className="status-text">
              No housing entries added yet. Add a property or rental so the plan has a housing path.
            </p>
          ) : (
            <>
              {(planData.realEstate.rentals ?? []).map((rental, index) => (
                <section key={rental.rentalId || `rental-${index}`} className="data-card">
                  <div className="card-header">
                    <h4>{rental.name || `Rental ${index + 1}`}</h4>
                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={() => removeRental(index)}
                    >
                      Remove
                    </button>
                  </div>

                  <p className="subtle section-note">
                    Add rental periods here, including temporary overlap while you still own a home.
                  </p>

                  <div className="field-grid">
                    <TextField
                      label="Rental label"
                      value={rental.name ?? ''}
                      onChange={(value) => updateRental(index, 'name', value)}
                    />
                    <CurrencyField
                      label="Monthly rent"
                      value={rental.monthlyRent ?? 0}
                      onChange={(value) => updateRental(index, 'monthlyRent', value)}
                    />
                    <NumberField
                      label="Start year"
                      value={rental.startYear ?? 0}
                      onChange={(value) => updateRental(index, 'startYear', value)}
                    />
                    <NumberSelectField
                      label="Start month"
                      value={rental.startMonth ?? 1}
                      options={monthOptions}
                      onChange={(value) => updateRental(index, 'startMonth', value)}
                    />
                    <OptionalNumberField
                      label="End year"
                      value={rental.endYear}
                      onChange={(value) => updateRental(index, 'endYear', value)}
                      hint="Optional. Leave blank if rent continues until the end of the plan."
                    />
                    <NumberSelectField
                      label="End month"
                      value={rental.endMonth ?? 1}
                      options={monthOptions}
                      onChange={(value) => updateRental(index, 'endMonth', value)}
                      hint="Used only when an end year is provided."
                    />
                  </div>
                </section>
              ))}

              {planData.realEstate.properties.map((property, index) => (
                <section
                  key={property.propertyId || `property-${index}`}
                  className="data-card"
                >
                  <div className="card-header">
                    <h4>{property.name || `Home ${index + 1}`}</h4>
                    <button
                      type="button"
                      className="text-button danger-text"
                      onClick={() => removeProperty(index)}
                    >
                      Remove
                    </button>
                  </div>

                  <p className="subtle section-note">
                    Add home purchases and sale dates here. Month/year timing is used to make
                    same-year sale and purchase transitions more precise.
                  </p>

                  <div className="toggle-row">
                    <span className="subtle">Financing</span>
                    <div className="toggle-group">
                      <button
                        type="button"
                        className={`toggle-chip ${property.isPaidOff ? '' : 'is-active'}`}
                        onClick={() => setPropertyPaidOff(index, false)}
                      >
                        Financed
                      </button>
                      <button
                        type="button"
                        className={`toggle-chip ${property.isPaidOff ? 'is-active' : ''}`}
                        onClick={() => setPropertyPaidOff(index, true)}
                      >
                        Paid off
                      </button>
                    </div>
                  </div>

                  <div className="field-grid">
                    <TextField
                      label="Home name"
                      value={property.name ?? ''}
                      onChange={(value) => updateProperty(index, 'name', value)}
                    />
                    <CurrencyField
                      label="Home value"
                      value={property.currentValue || property.purchasePrice}
                      onChange={(value) => {
                        updateProperty(index, 'purchasePrice', value);
                        updateProperty(index, 'currentValue', value);

                        if (property.isPaidOff) {
                          updateProperty(index, 'downPayment', value);
                        }
                      }}
                      hint={
                        property.isPaidOff
                          ? 'Used as the current or cash-purchase value for a paid-off home.'
                          : undefined
                      }
                    />
                    <NumberField
                      label="Purchase year"
                      value={property.purchaseYear ?? 0}
                      onChange={(value) => updateProperty(index, 'purchaseYear', value)}
                    />
                    <NumberSelectField
                      label="Purchase month"
                      value={property.purchaseMonth ?? 1}
                      options={monthOptions}
                      onChange={(value) => updateProperty(index, 'purchaseMonth', value)}
                    />
                    <OptionalNumberField
                      label="Sell year"
                      value={property.sellYear}
                      onChange={(value) => updateProperty(index, 'sellYear', value)}
                      hint="Leave blank to keep the property through the full projection."
                    />
                    <NumberSelectField
                      label="Sell month"
                      value={property.sellMonth ?? 1}
                      options={monthOptions}
                      onChange={(value) => updateProperty(index, 'sellMonth', value)}
                      hint="Used only when a sell year is provided."
                    />
                    <DecimalField
                      label="Appreciation rate"
                      value={property.appreciationRate}
                      onChange={(value) => updateProperty(index, 'appreciationRate', value)}
                      hint="Use decimal form, for example 0.03"
                    />
                    <OptionalCurrencyField
                      label="Expected sale price override"
                      value={property.expectedSalePrice}
                      onChange={(value) => updateProperty(index, 'expectedSalePrice', value)}
                      hint="Optional. If blank, sale price is derived from appreciation."
                    />
                    <DecimalField
                      label="Selling costs percent"
                      value={property.sellingCostsPercent ?? 0.06}
                      onChange={(value) => updateProperty(index, 'sellingCostsPercent', value)}
                      hint="Default is 0.06 for 6%."
                    />
                    <SelectField
                      label="Proceeds destination"
                      value={property.proceedsDestination ?? 'cash'}
                      options={proceedsDestinationOptions}
                      onChange={(value) => updateProperty(index, 'proceedsDestination', value)}
                    />
                    {!property.isPaidOff ? (
                      <>
                        <CurrencyField
                          label="Loan balance"
                          value={property.mortgage.remainingBalance}
                          onChange={(value) => updatePropertyMortgage(index, 'remainingBalance', value)}
                          hint="Current remaining mortgage balance."
                        />
                        <DecimalField
                          label="Interest rate"
                          value={property.mortgage.rate}
                          onChange={(value) => updatePropertyMortgage(index, 'rate', value)}
                          hint="Enter 5.52 for 5.52% or 0.0552."
                        />
                        <CurrencyField
                          label="Monthly mortgage"
                          value={property.monthlyMortgagePayment ?? 0}
                          onChange={(value) => updateProperty(index, 'monthlyMortgagePayment', value)}
                          hint="Principal and interest only."
                        />
                        <OptionalCurrencyField
                          label="Monthly taxes + insurance"
                          value={property.monthlyTaxAndInsurance}
                          onChange={(value) => updateProperty(index, 'monthlyTaxAndInsurance', value)}
                          hint="Optional. Leave blank to estimate from the home value."
                        />
                      </>
                    ) : (
                      <>
                        <OptionalCurrencyField
                          label="Monthly taxes + insurance"
                          value={property.monthlyTaxAndInsurance}
                          onChange={(value) => updateProperty(index, 'monthlyTaxAndInsurance', value)}
                          hint="Optional. Leave blank to estimate from the home value. Enter HOA here too if you want it included."
                        />
                        <ReadOnlyField
                          label="Loan"
                          value="Skipped for paid-off homes"
                          hint="The model assumes no loan payment and no remaining mortgage balance."
                        />
                      </>
                    )}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </section>
    );
  }

  if (currentStep === 4) {
    return (
      <section className="step-content">
        <p className="subtle section-note">
          Break out non-housing spending here so it is easier to review. Housing costs are pulled
          from the Housing step and shown below as estimated monthly housing cost.
        </p>
        {workingBudgetWarnings.map((warning) => (
          <div key={warning.id} className="status-text warning-text">
            <strong>{warning.title}</strong>
            <div>{warning.detail}</div>
            <div>{warning.suggestion}</div>
          </div>
        ))}
        <section className="data-card expense-card">
          <div className="card-header">
            <div>
              <h3>Current monthly expenses</h3>
              <p className="subtle">
                Enter today&apos;s recurring non-housing spending. Housing cost is estimated from
                the housing entries active at age {planData.personal.currentAge}.
              </p>
            </div>
          </div>
          <div className="field-grid">
            {expenseCategoryFields.map((category) => (
              <CurrencyField
                key={`current-${category.key}`}
                label={category.label}
                value={normalizedExpenses.current?.[category.key] ?? 0}
                onChange={(value) => updateExpenseCategory('current', category.key, value)}
              />
            ))}
          </div>
          <div className="expense-summary-grid">
            <ExpenseSummaryStat
              label="Current non-housing subtotal"
              value={currentNonHousingMonthlyTotal}
            />
            <ExpenseSummaryStat
              label={`Estimated monthly housing cost at age ${planData.personal.currentAge}`}
              value={currentHousingMonthlyEstimate}
            />
            <ExpenseSummaryStat
              label="Total monthly spending modeled today"
              value={currentNonHousingMonthlyTotal + currentHousingMonthlyEstimate}
            />
          </div>
        </section>

        <section className="data-card expense-card">
          <div className="card-header">
            <div>
              <h3>Estimated retirement expenses</h3>
              <p className="subtle">
                Enter retirement-era non-housing spending. Housing cost is estimated from the
                housing entries active at age {planData.personal.retirementAge}.
              </p>
            </div>
          </div>
          <div className="field-grid">
            {expenseCategoryFields.map((category) => (
              <CurrencyField
                key={`retirement-${category.key}`}
                label={category.label}
                value={normalizedExpenses.retirement?.[category.key] ?? 0}
                onChange={(value) => updateExpenseCategory('retirement', category.key, value)}
              />
            ))}
          </div>
          <div className="expense-summary-grid">
            <ExpenseSummaryStat
              label="Retirement non-housing subtotal"
              value={retirementNonHousingMonthlyTotal}
            />
            <ExpenseSummaryStat
              label={`Estimated monthly housing cost at age ${planData.personal.retirementAge}`}
              value={retirementHousingMonthlyEstimate}
            />
            <ExpenseSummaryStat
              label="Total monthly spending modeled in retirement"
              value={retirementNonHousingMonthlyTotal + retirementHousingMonthlyEstimate}
            />
          </div>
        </section>
      </section>
    );
  }

  if (currentStep === 5) {
    return (
      <section className="step-content">
        <p className="subtle section-note">
          Enter Social Security as a monthly benefit amount. The backend converts it to
          annual income during projection.
        </p>
        <div className="field-grid">
          <NumberField
            label="Social Security age"
            value={planData.retirement.socialSecurityAge}
            onChange={(value) => updateTopLevelSection('retirement', 'socialSecurityAge', value)}
          />
          <CurrencyField
            label="Social Security benefit (monthly)"
            value={planData.retirement.socialSecurityBenefit}
            onChange={(value) =>
              updateTopLevelSection('retirement', 'socialSecurityBenefit', value)
            }
            hint="Enter the monthly benefit. It is annualized in the backend projection."
          />
          <CurrencyField
            label="Pension income"
            value={planData.retirement.pensionIncome}
            onChange={(value) => updateTopLevelSection('retirement', 'pensionIncome', value)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="step-content">
      <div className="field-grid">
        <DecimalField
          label="Inflation rate"
          value={planData.assumptions.inflationRate}
          onChange={(value) => updateTopLevelSection('assumptions', 'inflationRate', value)}
          hint="Use decimal form, for example 0.025"
        />
        <DecimalField
          label="Cash yield"
          value={planData.assumptions.cashYield ?? 0.032}
          onChange={(value) => updateTopLevelSection('assumptions', 'cashYield', value)}
          hint="Annual yield for cash equivalents like HYSA or Treasuries, for example 0.032"
        />
        <DecimalField
          label="Investment return mean"
          value={planData.assumptions.investmentReturnMean}
          onChange={(value) => updateTopLevelSection('assumptions', 'investmentReturnMean', value)}
          hint="Use decimal form, for example 0.07"
        />
        <DecimalField
          label="Investment return std dev"
          value={planData.assumptions.investmentReturnStdDev}
          onChange={(value) =>
            updateTopLevelSection('assumptions', 'investmentReturnStdDev', value)
          }
          hint="Use decimal form, for example 0.12"
        />
        <DecimalField
          label="Safe withdrawal rate"
          value={planData.assumptions.safeWithdrawalRate ?? 0.04}
          onChange={(value) => updateTopLevelSection('assumptions', 'safeWithdrawalRate', value)}
          hint="Use decimal form, for example 0.04"
        />
      </div>
    </section>
  );
}

function ExpenseSummaryStat({ label, value }) {
  return (
    <div className="expense-summary-stat">
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function BaseField({
  label,
  value,
  onChange,
  hint,
  inputMode = 'decimal',
  parseValue = parseNumericValue,
  formatValue = formatPlainFieldValue,
  getEditableValue = getPlainEditableFieldValue
}) {
  const [inputValue, setInputValue] = useState(formatValue(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatValue(value));
    }
  }, [formatValue, isFocused, value]);

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        value={inputValue}
        onFocus={() => {
          setIsFocused(true);
          setInputValue(getEditableValue(value));
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setInputValue(nextValue);
          onChange(parseValue(nextValue));
        }}
        onBlur={(event) => {
          if (event.target.value.trim() === '') {
            setIsFocused(false);
            onChange(parseValue(''));
            setInputValue('');
            return;
          }

          const parsedValue = parseValue(event.target.value);
          setIsFocused(false);
          onChange(parsedValue);
          setInputValue(formatValue(parsedValue));
        }}
      />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SelectField({ label, value, options, onChange, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function NumberSelectField({ label, value, options, onChange, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function TextField({ label, value, onChange, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ReadOnlyField({ label, value, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} readOnly />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function NumberField(props) {
  return <BaseField {...props} inputMode="numeric" />;
}

function OptionalNumberField(props) {
  return <BaseField {...props} inputMode="numeric" parseValue={parseOptionalNumericValue} />;
}

function CurrencyField(props) {
  return (
    <BaseField
      {...props}
      inputMode="decimal"
      formatValue={formatCurrencyFieldValue}
      getEditableValue={getCurrencyEditableFieldValue}
    />
  );
}

function OptionalCurrencyField(props) {
  return (
    <BaseField
      {...props}
      inputMode="decimal"
      parseValue={parseOptionalNumericValue}
      formatValue={formatOptionalCurrencyFieldValue}
      getEditableValue={getOptionalCurrencyEditableFieldValue}
    />
  );
}

function PercentField(props) {
  return <BaseField {...props} inputMode="decimal" />;
}

function DecimalField(props) {
  return <BaseField {...props} inputMode="decimal" />;
}

function parseNumericValue(value) {
  if (value === '') {
    return 0;
  }

  const parsedValue = Number(sanitizeNumericInput(value));
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
}

function parseOptionalNumericValue(value) {
  if (value === '') {
    return null;
  }

  const parsedValue = Number(sanitizeNumericInput(value));
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function sanitizeNumericInput(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/[$,%\s,]/g, '');
}

function formatPlainFieldValue(value) {
  if (value === null || value === undefined || value === '' || value === 0) {
    return '';
  }

  return String(value);
}

function getPlainEditableFieldValue(value) {
  return formatPlainFieldValue(value);
}

function formatCurrencyFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return formatCurrency(Number(value) || 0);
}

function formatOptionalCurrencyFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return formatCurrency(Number(value) || 0);
}

function getCurrencyEditableFieldValue(value) {
  if (value === null || value === undefined || value === '' || value === 0) {
    return '';
  }

  return String(value);
}

function getOptionalCurrencyEditableFieldValue(value) {
  return getCurrencyEditableFieldValue(value);
}

function getInitialUserId() {
  const storedUserId = window.localStorage.getItem('retire-yet-user-id');
  return normalizeUserIdInput(storedUserId) || DEFAULT_USER_ID;
}

function normalizeUserIdInput(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, '-').toLowerCase();
}

function getSummaryGateState(planData) {
  const incompleteChecks = stepLabels
    .slice(0, stepLabels.length - 1)
    .map((label, stepIndex) => ({
      stepIndex,
      label,
      isComplete: getStepValidationErrors(planData, stepIndex).length === 0
    }))
    .filter((check) => !check.isComplete);

  return {
    canAccessSummary: incompleteChecks.length === 0,
    firstIncompleteStep: incompleteChecks[0]?.stepIndex ?? stepLabels.length - 1,
    incompleteStepLabels: incompleteChecks.map((check) => check.label)
  };
}

function getStepValidationErrors(planData, stepIndex) {
  switch (stepIndex) {
    case 0:
      return getPersonalStepErrors(planData);
    case 1:
      return getIncomeStepErrors(planData);
    case 2:
      return getAssetStepErrors(planData);
    case 3:
      return getHousingStepErrors(planData);
    case 4:
      return getExpenseStepErrors(planData);
    case 5:
      return getRetirementStepErrors(planData);
    case 6:
      return getAssumptionStepErrors(planData);
    default:
      return [];
  }
}

function findFirstBlockingStep(planData, targetStep) {
  for (let stepIndex = 0; stepIndex < targetStep; stepIndex += 1) {
    if (getStepValidationErrors(planData, stepIndex).length > 0) {
      return stepIndex;
    }
  }

  return null;
}

function hasRequiredIncomeData(planData) {
  const hasValidCareerPhase = (planData.income?.careerPhases ?? []).some((phase) => {
    const compensation = phase.baseSalary ?? phase.salary ?? 0;

    return (
      typeof compensation === 'number' &&
      compensation > 0 &&
      (phase.startAge ?? 0) >= 0 &&
      (phase.endAge ?? -1) >= (phase.startAge ?? 0)
    );
  });

  const hasValidOtherIncome = (planData.income?.otherIncomeStreams ?? []).some((incomeStream) => {
    return (
      (incomeStream.annualAmount ?? 0) > 0 &&
      (incomeStream.endAge ?? -1) >= (incomeStream.startAge ?? 0)
    );
  });

  return hasValidCareerPhase || hasValidOtherIncome;
}

function getPersonalStepErrors(planData) {
  const errors = [];
  const { currentAge = 0, retirementAge = 0, lifeExpectancy = 0 } = planData.personal ?? {};

  if (currentAge <= 0) {
    errors.push('Enter your current age.');
  }

  if (retirementAge <= 0) {
    errors.push('Enter your retirement age.');
  } else if (retirementAge <= currentAge) {
    errors.push('Retirement age must be greater than current age.');
  }

  if (lifeExpectancy <= 0) {
    errors.push('Enter your life expectancy.');
  } else if (lifeExpectancy <= retirementAge) {
    errors.push('Life expectancy must be greater than retirement age.');
  }

  return errors;
}

function getIncomeStepErrors(planData) {
  const errors = [];
  const careerPhases = planData.income?.careerPhases ?? [];
  const otherIncomeStreams = planData.income?.otherIncomeStreams ?? [];

  if (!hasRequiredIncomeData(planData)) {
    errors.push('Add at least one income source with a valid amount and time period.');
  }

  careerPhases.forEach((phase, index) => {
    const compensation = phase.baseSalary ?? phase.salary ?? 0;

    if (!(phase.title ?? '').trim()) {
      errors.push(`Salary income ${index + 1}: enter a job title.`);
    }

    if (compensation <= 0) {
      errors.push(`Salary income ${index + 1}: enter an annual salary greater than zero.`);
    }

    if ((phase.endAge ?? -1) < (phase.startAge ?? 0)) {
      errors.push(`Salary income ${index + 1}: end age must be on or after start age.`);
    }
  });

  otherIncomeStreams.forEach((incomeStream, index) => {
    if (!(incomeStream.name ?? '').trim()) {
      errors.push(`Other income ${index + 1}: enter an income label.`);
    }

    if ((incomeStream.annualAmount ?? 0) <= 0) {
      errors.push(`Other income ${index + 1}: enter an annual amount greater than zero.`);
    }

    if ((incomeStream.endAge ?? -1) < (incomeStream.startAge ?? 0)) {
      errors.push(`Other income ${index + 1}: end age must be on or after start age.`);
    }
  });

  return errors;
}

function getAssetStepErrors(planData) {
  const errors = [];
  const assets = planData.assets ?? {};
  const retirementAccounts = assets.retirementAccounts ?? {};
  const fields = [
    ['cash', assets.cash],
    ['brokerage', assets.brokerage],
    ['401(k)', retirementAccounts['401k']],
    ['IRA', retirementAccounts.ira],
    ['Roth IRA', retirementAccounts.rothIra]
  ];

  fields.forEach(([label, value]) => {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      errors.push(`Enter a valid ${label} balance of zero or more.`);
    }
  });

  return errors;
}

function getHousingStepErrors(planData) {
  const errors = [];
  const properties = planData.realEstate?.properties ?? [];
  const rentals = planData.realEstate?.rentals ?? [];

  if (properties.length === 0 && rentals.length === 0) {
    errors.push('Add at least one housing entry, either a property or a rental.');
  }

  properties.forEach((property, index) => {
    if (!(property.name ?? '').trim()) {
      errors.push(`Housing property ${index + 1}: enter a label.`);
    }

    if (((property.currentValue ?? 0) <= 0) && ((property.purchasePrice ?? 0) <= 0)) {
      errors.push(`Housing property ${index + 1}: enter a home value greater than zero.`);
    }

    if ((property.purchaseYear ?? 0) <= 0) {
      errors.push(`Housing property ${index + 1}: enter a purchase year.`);
    }

    if ((property.purchaseMonth ?? 0) < 1 || (property.purchaseMonth ?? 0) > 12) {
      errors.push(`Housing property ${index + 1}: choose a valid purchase month.`);
    }

    if ((property.mortgage?.remainingBalance ?? 0) < 0) {
      errors.push(`Housing property ${index + 1}: mortgage balance cannot be negative.`);
    }

    if (!property.isPaidOff) {
      if ((property.mortgage?.remainingBalance ?? 0) <= 0) {
        errors.push(`Housing property ${index + 1}: enter a current mortgage balance greater than zero, or mark the home paid off.`);
      }

      if ((property.monthlyMortgagePayment ?? 0) <= 0) {
        errors.push(`Housing property ${index + 1}: enter the monthly mortgage payment.`);
      }
    }

    if (
      property.monthlyTaxAndInsurance !== null &&
      property.monthlyTaxAndInsurance !== undefined &&
      (property.monthlyTaxAndInsurance ?? 0) < 0
    ) {
      errors.push(`Housing property ${index + 1}: monthly housing carrying costs cannot be negative.`);
    }
  });

  rentals.forEach((rental, index) => {
    if (!(rental.name ?? '').trim()) {
      errors.push(`Rental ${index + 1}: enter a label.`);
    }

    if ((rental.monthlyRent ?? -1) < 0) {
      errors.push(`Rental ${index + 1}: monthly rent cannot be negative.`);
    }

    if ((rental.startYear ?? 0) <= 0) {
      errors.push(`Rental ${index + 1}: enter a start year.`);
    }

    if ((rental.startMonth ?? 0) < 1 || (rental.startMonth ?? 0) > 12) {
      errors.push(`Rental ${index + 1}: choose a valid start month.`);
    }
  });

  return errors;
}

function getExpenseStepErrors(planData) {
  const errors = [];
  const normalizedExpenses = getNormalizedExpenseState(planData.expenses);
  const currentTotal = getExpenseBreakdownTotal(normalizedExpenses.current);
  const retirementTotal = getExpenseBreakdownTotal(normalizedExpenses.retirement);

  if (currentTotal <= 0) {
    errors.push('Enter your current monthly expenses.');
  }

  if (retirementTotal <= 0) {
    errors.push('Enter your retirement monthly expenses.');
  }

  return errors;
}

function getRetirementStepErrors(planData) {
  const errors = [];
  const retirement = planData.retirement ?? {};

  if ((retirement.socialSecurityAge ?? 0) <= 0) {
    errors.push('Enter your Social Security claiming age.');
  }

  if (
    typeof retirement.socialSecurityBenefit !== 'number' ||
    Number.isNaN(retirement.socialSecurityBenefit) ||
    retirement.socialSecurityBenefit < 0
  ) {
    errors.push('Enter a valid monthly Social Security benefit of zero or more.');
  }

  if (
    typeof retirement.pensionIncome !== 'number' ||
    Number.isNaN(retirement.pensionIncome) ||
    retirement.pensionIncome < 0
  ) {
    errors.push('Enter a valid pension income amount of zero or more.');
  }

  return errors;
}

function getAssumptionStepErrors(planData) {
  const errors = [];
  const assumptions = planData.assumptions ?? {};

  if ((assumptions.inflationRate ?? -1) < 0) {
    errors.push('Enter a valid inflation rate of zero or more.');
  }

  if ((assumptions.cashYield ?? -1) < 0) {
    errors.push('Enter a valid cash yield of zero or more.');
  }

  if ((assumptions.investmentReturnMean ?? 0) <= 0) {
    errors.push('Enter an investment return mean greater than zero.');
  }

  if ((assumptions.investmentReturnStdDev ?? -1) < 0) {
    errors.push('Enter an investment return standard deviation of zero or more.');
  }

  if ((assumptions.safeWithdrawalRate ?? 0) <= 0) {
    errors.push('Enter a safe withdrawal rate greater than zero.');
  }

  return errors;
}

function formatStepList(stepNames) {
  if (stepNames.length === 0) {
    return 'all required steps';
  }

  if (stepNames.length === 1) {
    return stepNames[0];
  }

  if (stepNames.length === 2) {
    return `${stepNames[0]} and ${stepNames[1]}`;
  }

  return `${stepNames.slice(0, -1).join(', ')}, and ${stepNames[stepNames.length - 1]}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatSignedCurrency(value) {
  if (value === 0) {
    return formatCurrency(0);
  }

  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

function formatCurrencyCompact(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function tooltipCurrency(value) {
  return [formatCurrency(value)];
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getNormalizedExpenseState(expenses) {
  const fallbackCurrentOther =
    typeof expenses?.monthlyExpenses === 'number' ? expenses.monthlyExpenses : 0;
  const fallbackRetirementOther =
    typeof expenses?.expectedRetirementExpenses === 'number'
      ? expenses.expectedRetirementExpenses
      : 0;

  return {
    current: {
      ...createExpenseBreakdown(fallbackCurrentOther),
      ...(expenses?.current ?? {})
    },
    retirement: {
      ...createExpenseBreakdown(fallbackRetirementOther),
      ...(expenses?.retirement ?? {})
    }
  };
}

function calculateHousingAllowanceAmount(totalSalary, housingAllowancePercent = 0) {
  return totalSalary * normalizeRate(housingAllowancePercent, 0);
}

function calculateClientNetIncome({
  baseSalary,
  compensationType = 'standard',
  housingAllowance = 0,
  housingAllowanceTaxExemptPercent = 1,
  incomeTaxRate = 0.22,
  secaTaxRate = 0.153
}) {
  const isClergyCompensation = compensationType === 'clergy';
  const effectiveHousingAllowance = isClergyCompensation ? housingAllowance : 0;
  const effectiveHousingAllowanceTaxExemptPercent = isClergyCompensation
    ? housingAllowanceTaxExemptPercent
    : 0;
  const housingAllowanceAmount = calculateHousingAllowanceAmount(
    baseSalary,
    effectiveHousingAllowance
  );
  const taxableIncome =
    baseSalary -
    housingAllowanceAmount * normalizeRate(effectiveHousingAllowanceTaxExemptPercent, 1);
  const incomeTax = taxableIncome * incomeTaxRate;
  const secaTax = isClergyCompensation ? baseSalary * secaTaxRate : 0;

  return {
    totalIncome: baseSalary,
    netIncome: baseSalary - incomeTax - secaTax
  };
}

function getClientEmployeeRetirementContribution(phase, earnedIncome) {
  if (!phase) {
    return 0;
  }

  return earnedIncome * ((phase.retirementContributionPercent ?? 0) / 100);
}

function getCareerPhaseForAgeClient(planData, age) {
  return (
    planData.income?.careerPhases?.find((phase) => age >= phase.startAge && age <= phase.endAge) ??
    null
  );
}

function getOtherIncomeStreamsForAgeClient(planData, age) {
  return (planData.income?.otherIncomeStreams ?? []).filter(
    (incomeStream) => age >= incomeStream.startAge && age <= incomeStream.endAge
  );
}

function isRetiredForAgeClient(planData, age) {
  if (age > planData.personal.retirementAge) {
    return true;
  }

  if (age < planData.personal.retirementAge) {
    return false;
  }

  return getCareerPhaseForAgeClient(planData, age) === null;
}

function getInflatedWorkingMonthlyExpenses(planData, monthlyBaseExpenses, age) {
  const yearsFromStart = Math.max(0, age - planData.personal.currentAge);
  return monthlyBaseExpenses * Math.pow(1 + (planData.assumptions?.inflationRate ?? 0), yearsFromStart);
}

function getBudgetReductionSuggestions(expenseBreakdown, housingCost) {
  const suggestions = [
    { label: 'Housing', value: housingCost },
    ...expenseCategoryFields.map((category) => ({
      label: category.label,
      value: Number(expenseBreakdown?.[category.key]) || 0
    }))
  ]
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);

  if (suggestions.length === 0) {
    return 'Reduce current monthly expenses to stay within your working-years budget.';
  }

  return `Reduce current monthly expenses, starting with ${suggestions
    .map((item) => `${item.label} (${formatCurrency(item.value)}/mo)`)
    .join(', ')}.`;
}

function getWorkingBudgetWarnings(planData, currentExpenseBreakdown) {
  const warnings = [];
  let activeWarning = null;
  const workingMonthlyBaseExpenses = getExpenseBreakdownTotal(currentExpenseBreakdown);
  const currentAge = planData.personal.currentAge;

  for (let age = planData.personal.currentAge; age <= planData.personal.retirementAge; age += 1) {
    if (isRetiredForAgeClient(planData, age)) {
      continue;
    }

    const activeCareerPhase = getCareerPhaseForAgeClient(planData, age);

    if (!activeCareerPhase) {
      continue;
    }

    const baseSalary = activeCareerPhase.baseSalary ?? activeCareerPhase.salary ?? 0;
    const incomeDetails = calculateClientNetIncome({
      baseSalary,
      compensationType: activeCareerPhase.compensationType ?? 'standard',
      housingAllowance: activeCareerPhase.housingAllowance ?? 0,
      housingAllowanceTaxExemptPercent: activeCareerPhase.housingAllowanceTaxExemptPercent ?? 1
    });
    const otherIncomeDetails = getOtherIncomeStreamsForAgeClient(planData, age).reduce(
      (totals, incomeStream) => {
        const annualAmount = incomeStream.annualAmount ?? 0;
        const taxablePercent = normalizeRate(incomeStream.taxablePercent, 1);
        const incomeTax = annualAmount * taxablePercent * 0.22;

        return {
          totalIncome: totals.totalIncome + annualAmount,
          netIncome: totals.netIncome + annualAmount - incomeTax
        };
      },
      { totalIncome: 0, netIncome: 0 }
    );
    const employeeContribution = getClientEmployeeRetirementContribution(
      activeCareerPhase,
      incomeDetails.totalIncome
    );
    const monthlyNetIncome =
      (incomeDetails.netIncome - employeeContribution + otherIncomeDetails.netIncome) / 12;
    const monthlyHousingCost = estimateMonthlyHousingCostForAge(planData, age);
    const monthlyExpenses =
      getInflatedWorkingMonthlyExpenses(planData, workingMonthlyBaseExpenses, age) +
      monthlyHousingCost;
    const monthlyShortfall = monthlyExpenses - monthlyNetIncome;

    if (monthlyShortfall <= 0) {
      activeWarning = null;
      continue;
    }

    if (!activeWarning || age !== activeWarning.endAge + 1) {
      activeWarning = {
        startAge: age,
        endAge: age,
        snapshots: [
          {
            age,
            monthlyShortfall,
            monthlyExpenses,
            monthlyNetIncome,
            monthlyHousingCost
          }
        ]
      };
      warnings.push(activeWarning);
      continue;
    }

    activeWarning.endAge = age;
    activeWarning.snapshots.push({
      age,
      monthlyShortfall,
      monthlyExpenses,
      monthlyNetIncome,
      monthlyHousingCost
    });
  }

  return warnings.map((warning, index) => {
    const averageShortfall =
      warning.snapshots.reduce((sum, snapshot) => sum + snapshot.monthlyShortfall, 0) /
      warning.snapshots.length;
    const averageExpenses =
      warning.snapshots.reduce((sum, snapshot) => sum + snapshot.monthlyExpenses, 0) /
      warning.snapshots.length;
    const averageNetIncome =
      warning.snapshots.reduce((sum, snapshot) => sum + snapshot.monthlyNetIncome, 0) /
      warning.snapshots.length;
    const averageHousingCost =
      warning.snapshots.reduce((sum, snapshot) => sum + snapshot.monthlyHousingCost, 0) /
      warning.snapshots.length;
    const ageLabel =
      warning.startAge === warning.endAge
        ? `age ${warning.startAge}`
        : `ages ${warning.startAge}-${warning.endAge}`;
    const currentAgeSnapshot =
      warning.snapshots.find((snapshot) => snapshot.age === currentAge) ?? warning.snapshots[0];
    const hasCurrentAgeInWarning = currentAgeSnapshot.age === currentAge;
    const currentAgeLabel = hasCurrentAgeInWarning
      ? `At age ${currentAge}`
      : `At the start of this period (age ${currentAgeSnapshot.age})`;
    const currentAgeDetail = `${currentAgeLabel}, modeled spending is about ${formatCurrency(
      currentAgeSnapshot.monthlyExpenses
    )}/mo while estimated take-home income is about ${formatCurrency(
      currentAgeSnapshot.monthlyNetIncome
    )}/mo.`;
    const averageDetail =
      warning.snapshots.length > 1
        ? ` Across ${ageLabel}, the average is about ${formatCurrency(
            averageExpenses
          )}/mo of spending versus ${formatCurrency(averageNetIncome)}/mo of take-home income.`
        : '';

    return {
      id: `working-budget-warning-${index}`,
      title: `Warning: spending exceeds take-home pay during ${ageLabel}.`,
      detail: `${currentAgeDetail}${averageDetail} The gap in this warning period would be funded from your cash reserves first. Gross salary is not the same as take-home pay here: the estimate uses taxes and any payroll retirement contributions.`,
      suggestion: `${getBudgetReductionSuggestions(currentExpenseBreakdown, averageHousingCost)} Reducing current expenses by at least ${formatCurrency(averageShortfall)} per month would keep this period within budget. Retirement expenses are not part of this warning.`
    };
  });
}

function getExpenseBreakdownTotal(expenses = {}) {
  return expenseCategoryFields.reduce(
    (total, category) => total + (Number(expenses?.[category.key]) || 0),
    0
  );
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

function getBirthMonthIndex(planData) {
  const currentDateParts = getCurrentDateParts();
  return toMonthIndex(
    currentDateParts.year - planData.personal.currentAge,
    currentDateParts.month
  );
}

function getResolvedPurchaseYear(property, planData, currentDateParts) {
  if (typeof property.purchaseYear === 'number') {
    return property.purchaseYear;
  }

  if (typeof property.purchaseAge === 'number') {
    return currentDateParts.year - planData.personal.currentAge + property.purchaseAge;
  }

  return currentDateParts.year;
}

function getResolvedPurchaseMonth(property, currentDateParts) {
  return typeof property.purchaseMonth === 'number' ? property.purchaseMonth : currentDateParts.month;
}

function getResolvedSellYear(property, planData, currentDateParts) {
  if (typeof property.sellYear === 'number') {
    return property.sellYear;
  }

  if (typeof property.sellAge === 'number') {
    return currentDateParts.year - planData.personal.currentAge + property.sellAge;
  }

  return null;
}

function getResolvedSellMonth(property, currentDateParts) {
  if (property.sellYear === undefined && property.sellAge === undefined) {
    return null;
  }

  return typeof property.sellMonth === 'number' ? property.sellMonth : currentDateParts.month;
}

function getResolvedRentalEndMonth(rental) {
  if (rental.endYear === undefined || rental.endYear === null) {
    return null;
  }

  return typeof rental.endMonth === 'number' ? rental.endMonth : rental.startMonth;
}

function getConfiguredLoanBalance(property) {
  if (typeof property.mortgage?.originalBalance === 'number') {
    return property.mortgage.originalBalance;
  }

  if (
    typeof property.mortgage?.remainingBalance === 'number' &&
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
  return configuredLoanBalance === null
    ? 0
    : Math.max(0, property.purchasePrice - configuredLoanBalance);
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
    getConfiguredLoanBalance(property) ?? property.mortgage?.remainingBalance ?? 0,
    property.mortgage?.rate ?? 0,
    property.monthlyMortgagePayment
  );

  if (derivedRemainingMonths !== null) {
    return derivedRemainingMonths;
  }

  if (typeof property.mortgage?.remainingTermMonths === 'number') {
    return Math.max(0, Math.round(property.mortgage.remainingTermMonths));
  }

  if (typeof property.mortgage?.remainingTermYears === 'number') {
    return Math.max(0, Math.round(property.mortgage.remainingTermYears * 12));
  }

  return Math.max(0, Math.round((property.mortgage?.term ?? 0) * 12 - monthsOwnedBeforeProjection));
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

  const monthlyRate = normalizeRate(annualRate) / 12;

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

  const monthlyRate = normalizeRate(annualRate) / 12;

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

  return {
    endingBalance: Math.max(0, balance - actualPrincipal),
    remainingMonths: Math.max(0, remainingMonths - 1),
    payment: actualPrincipal + monthlyInterest
  };
}

function getAnnualPropertyTax(property, propertyValue) {
  if (typeof property.annualPropertyTax === 'number') {
    return property.annualPropertyTax;
  }

  return propertyValue * normalizeRate(property.propertyTaxRate, 0.012);
}

function getAnnualInsurance(property, propertyValue) {
  if (typeof property.annualInsurance === 'number') {
    return property.annualInsurance;
  }

  return propertyValue * normalizeRate(property.insuranceRate, 0.005);
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

function getMonthlyAppreciationFactor(property) {
  return Math.pow(1 + normalizeRate(property.appreciationRate), 1 / 12);
}

function getActiveHousingCountsForMonth(planData, monthIndex) {
  const currentDateParts = getCurrentDateParts();
  let activePropertyCount = 0;
  let activeRentalCount = 0;

  for (const property of planData.realEstate?.properties ?? []) {
    if (!property || typeof property.purchasePrice !== 'number') {
      continue;
    }

    const purchaseYear = getResolvedPurchaseYear(property, planData, currentDateParts);
    const purchaseMonth = getResolvedPurchaseMonth(property, currentDateParts);
    const sellYear = getResolvedSellYear(property, planData, currentDateParts);
    const sellMonth = getResolvedSellMonth(property, currentDateParts);
    const purchaseMonthIndex = toMonthIndex(purchaseYear, purchaseMonth);
    const sellMonthIndex =
      typeof sellYear === 'number' && typeof sellMonth === 'number'
        ? toMonthIndex(sellYear, sellMonth)
        : null;

    if (
      monthIndex >= purchaseMonthIndex &&
      (sellMonthIndex === null || monthIndex <= sellMonthIndex)
    ) {
      activePropertyCount += 1;
    }
  }

  for (const rental of planData.realEstate?.rentals ?? []) {
    if (!rental || typeof rental.monthlyRent !== 'number' || typeof rental.startYear !== 'number') {
      continue;
    }

    const rentalStartMonthIndex = toMonthIndex(rental.startYear, rental.startMonth ?? 1);
    const rentalEndMonth = getResolvedRentalEndMonth(rental);
    const rentalEndMonthIndex =
      typeof rental.endYear === 'number' && typeof rentalEndMonth === 'number'
        ? toMonthIndex(rental.endYear, rentalEndMonth)
        : null;

    if (
      monthIndex >= rentalStartMonthIndex &&
      (rentalEndMonthIndex === null || monthIndex <= rentalEndMonthIndex)
    ) {
      activeRentalCount += 1;
    }
  }

  return {
    activePropertyCount,
    activeRentalCount
  };
}

function formatMonthYearFromIndex(monthIndex) {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const label = monthOptions.find((option) => option.value === month)?.label ?? `${month}`;
  return `${label} ${year}`;
}

function getHousingTimelineWarnings(planData) {
  const warnings = [];

  if (!planData?.personal) {
    return warnings;
  }

  const startMonthIndex = toMonthIndex(getCurrentDateParts().year, getCurrentDateParts().month);
  const endMonthIndex = getBirthMonthIndex(planData) + (planData.personal.lifeExpectancy + 1) * 12 - 1;
  let firstGapMonthIndex = null;
  let firstOverlapMonthIndex = null;
  let gapMonthCount = 0;
  let overlapMonthCount = 0;

  for (let monthIndex = startMonthIndex; monthIndex <= endMonthIndex; monthIndex += 1) {
    const { activePropertyCount, activeRentalCount } = getActiveHousingCountsForMonth(
      planData,
      monthIndex
    );

    if (activePropertyCount === 0 && activeRentalCount === 0) {
      gapMonthCount += 1;
      if (firstGapMonthIndex === null) {
        firstGapMonthIndex = monthIndex;
      }
    }

    if (activePropertyCount > 0 && activeRentalCount > 0) {
      overlapMonthCount += 1;
      if (firstOverlapMonthIndex === null) {
        firstOverlapMonthIndex = monthIndex;
      }
    }
  }

  if (firstGapMonthIndex !== null) {
    warnings.push(
      `No housing is modeled for ${gapMonthCount} month${gapMonthCount === 1 ? '' : 's'} starting ${formatMonthYearFromIndex(firstGapMonthIndex)}. Add a rental or property coverage for that period.`
    );
  }

  if (firstOverlapMonthIndex !== null) {
    warnings.push(
      `Rental and owned-property housing overlap for ${overlapMonthCount} month${overlapMonthCount === 1 ? '' : 's'} starting ${formatMonthYearFromIndex(firstOverlapMonthIndex)}. That can be intentional during a move, but both costs will be modeled.`
    );
  }

  return warnings;
}

function estimateMonthlyHousingCostForAge(planData, age) {
  if (
    typeof age !== 'number' ||
    Number.isNaN(age) ||
    !Array.isArray(planData?.realEstate?.properties)
  ) {
    return 0;
  }

  const currentDateParts = getCurrentDateParts();
  const startMonthIndex = toMonthIndex(currentDateParts.year, currentDateParts.month);
  const targetMonthIndex = getBirthMonthIndex(planData) + age * 12;

  let totalHousingCost = (planData.realEstate?.rentals ?? []).reduce((total, rental) => {
    if (!rental || typeof rental.monthlyRent !== 'number' || typeof rental.startYear !== 'number') {
      return total;
    }

    const rentalStartMonthIndex = toMonthIndex(rental.startYear, rental.startMonth ?? 1);
    const rentalEndMonth = getResolvedRentalEndMonth(rental);
    const rentalEndMonthIndex =
      typeof rental.endYear === 'number' && typeof rentalEndMonth === 'number'
        ? toMonthIndex(rental.endYear, rentalEndMonth)
        : null;

    if (
      targetMonthIndex >= rentalStartMonthIndex &&
      (rentalEndMonthIndex === null || targetMonthIndex <= rentalEndMonthIndex)
    ) {
      return total + rental.monthlyRent;
    }

    return total;
  }, 0);

  totalHousingCost += (planData.realEstate?.properties ?? []).reduce((totalPropertyCost, property) => {
    if (!property || typeof property.purchasePrice !== 'number') {
      return totalPropertyCost;
    }

    const purchaseYear = getResolvedPurchaseYear(property, planData, currentDateParts);
    const purchaseMonth = getResolvedPurchaseMonth(property, currentDateParts);
    const sellYear = getResolvedSellYear(property, planData, currentDateParts);
    const sellMonth = getResolvedSellMonth(property, currentDateParts);
    const purchaseMonthIndex = toMonthIndex(purchaseYear, purchaseMonth);
    const sellMonthIndex =
      typeof sellYear === 'number' && typeof sellMonth === 'number'
        ? toMonthIndex(sellYear, sellMonth)
        : null;

    if (targetMonthIndex < purchaseMonthIndex) {
      return totalPropertyCost;
    }

    if (sellMonthIndex !== null && targetMonthIndex > sellMonthIndex) {
      return totalPropertyCost;
    }

    let currentValue = getCurrentPropertyValue(property, property.purchasePrice);
    let currentMortgageBalance = getInitialLoanBalance(property);
    let remainingMortgageMonths = getRemainingMortgageMonths(property, 0);
    let simulationMonthIndex = purchaseMonthIndex;

    if (purchaseMonthIndex <= startMonthIndex) {
      const monthsOwnedBeforeProjection = Math.max(0, startMonthIndex - purchaseMonthIndex);
      const isOwnedAtProjectionStart =
        startMonthIndex >= purchaseMonthIndex &&
        (sellMonthIndex === null || startMonthIndex <= sellMonthIndex);

      if (!isOwnedAtProjectionStart) {
        return totalPropertyCost;
      }

      currentValue = getCurrentPropertyValue(
        property,
        property.purchasePrice * Math.pow(getMonthlyAppreciationFactor(property), monthsOwnedBeforeProjection)
      );
      currentMortgageBalance = property.mortgage?.remainingBalance ?? 0;
      remainingMortgageMonths = getRemainingMortgageMonths(property, monthsOwnedBeforeProjection);
      simulationMonthIndex = startMonthIndex;
    }

    let targetMonthlyHousingCost = 0;

    for (let monthIndex = simulationMonthIndex; monthIndex <= targetMonthIndex; monthIndex += 1) {
      const startingValue = currentValue;
      currentValue *= getMonthlyAppreciationFactor(property);

      const mortgageSummary = applyMortgagePaymentForMonth(
        currentMortgageBalance,
        property.mortgage?.rate ?? 0,
        remainingMortgageMonths,
        property.monthlyMortgagePayment
      );
      currentMortgageBalance = mortgageSummary.endingBalance;
      remainingMortgageMonths = mortgageSummary.remainingMonths;

      const averagePropertyValue = (startingValue + currentValue) / 2;
      targetMonthlyHousingCost =
        mortgageSummary.payment + getMonthlyTaxAndInsurance(property, averagePropertyValue);
    }

    return totalPropertyCost + targetMonthlyHousingCost;
  }, 0);

  return totalHousingCost;
}

function getProbabilityOfSuccessInfoCopy(successProbability, annualRetirementExpenses, lifeExpectancy) {
  const successfulRuns = Math.round(successProbability * 1000);

  return `We run 1,000 Monte Carlo market simulations. A run counts as successful when your plan can continue supporting about ${formatCurrency(annualRetirementExpenses / 12)} per month of retirement spending through age ${lifeExpectancy} without your investable portfolio running out. In this plan, ${successfulRuns} of 1,000 runs succeeded, which gives a ${formatPercent(successProbability)} probability of success.`;
}

function formatDestinationLabel(destination) {
  return proceedsDestinationOptions.find((option) => option.value === destination)?.label ?? destination;
}

function formatExpenseFundingSummary(expenseFunding = {}) {
  const parts = [
    ['Income', expenseFunding.income ?? 0],
    ['Cash reserves', expenseFunding.cash ?? 0],
    ['Brokerage draw', expenseFunding.brokerage ?? 0],
    ['IRA draw', expenseFunding.ira ?? 0],
    ['401(k) draw', expenseFunding['401k'] ?? 0],
    ['Roth IRA draw', expenseFunding.rothIra ?? 0]
  ]
    .filter(([, amount]) => amount > 0)
    .map(([label, amount]) => `${label} ${formatCurrencyCompact(amount)}`);

  return parts.length > 0 ? parts.join(' • ') : 'None';
}

function formatWithdrawalOrder(order = []) {
  return order
    .map((account) => {
      if (account === '401k') {
        return '401(k)';
      }

      if (account === 'rothIra') {
        return 'Roth IRA';
      }

      if (account === 'ira') {
        return 'IRA';
      }

      return account.charAt(0).toUpperCase() + account.slice(1);
    })
    .join(' → ');
}

function summarizeSaleEvents(saleEvents = []) {
  return saleEvents
    .map(
      (event) =>
        `${event.propertyName ?? event.propertyId}: ${formatCurrency(event.netProceeds)} to ${formatDestinationLabel(event.destinationAccount)}`
    )
    .join(' | ');
}

function getScenarioInfoCopy(label, confidenceLevel) {
  const runsAtOrAbove = Math.round(confidenceLevel * 1000);
  const runsWorse = 1000 - runsAtOrAbove;

  if (confidenceLevel >= 0.9) {
    return `${label} is the conservative stress case. In 1,000 Monte Carlo runs, about ${runsAtOrAbove} runs ended at or above this outcome, and about ${runsWorse} runs ended worse. It is not saying there is a 90% chance markets will be well below average. It is showing a floor-like result you would expect to beat most of the time.`;
  }

  if (confidenceLevel >= 0.75) {
    return `${label} is a cautious but less severe path. In 1,000 Monte Carlo runs, about ${runsAtOrAbove} runs ended at or above this outcome, and about ${runsWorse} runs ended worse. It represents a below-average market result rather than the deepest stress case.`;
  }

  return `${label} is the midpoint path. In 1,000 Monte Carlo runs, about ${runsAtOrAbove} runs ended at or above this outcome, and about ${runsWorse} runs ended worse. This is the median-style scenario, not an optimistic best case.`;
}

function getFriendlyErrorMessage(message) {
  if (!message) {
    return 'Something went wrong while updating the plan.';
  }

  return message
    .replace('cannot be after life expectancy', 'must be on or before life expectancy')
    .replace('must be greater than purchase age', 'must be later than the purchase age');
}

export default App;
