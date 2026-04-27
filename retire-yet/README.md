# Retire Yet

Retire Yet is a retirement-planning app for modeling how income, expenses, investments, housing, and real-estate events interact over time.

It has:

- a React + Vite frontend in `client/`
- an Express API in `server/`
- backend financial logic in `server/src/services/`
- Postgres storage for multi-user local testing, with JSON-file fallback

The app is meant to answer practical questions such as:

- Am I on track to retire at my target age?
- How much can I safely spend while still working?
- How much could I spend in retirement?
- What happens if I sell a house, rent for a period, or buy another home?
- How does clergy compensation change take-home pay?
- How does the plan look under average, below-average, and well-below-average markets?

## How The App Works

In simple terms, the app works like this:

1. You enter your plan.
2. The backend simulates your finances month by month from your current age to life expectancy.
3. It groups those monthly results into yearly summaries for charts and tables.
4. It runs 1,000 market simulations to estimate probability of success and conservative market paths.

The plan is built from seven main inputs:

- Personal timeline: current age, retirement age, life expectancy
- Incomes: salary phases and other income streams
- Assets: cash, brokerage, 401(k), IRA, Roth IRA
- Housing: owned homes and rentals, with sale and purchase timing
- Expenses: current and retirement non-housing spending
- Retirement income: Social Security and pension
- Assumptions: inflation, cash yield, investment return, volatility, safe withdrawal rate

## What You See In The UI

- Steps 1-7 collect the plan inputs
- `Retirement Summary` shows the full dashboard once required steps are completed
- Charts show net worth, income vs expenses, retirement readiness, market scenarios, and asset breakdown
- The withdrawal ledger shows year-by-year income, expenses, asset balances, and where spending is funded from
- Budget warnings flag periods where modeled spending exceeds estimated take-home pay

## Projection Philosophy

The engine is designed to be readable and planner-friendly rather than tax-law perfect.

Current design choices:

- It uses a fixed federal income-tax assumption of `22%`
- Clergy compensation uses a fixed SECA assumption of `15.3%`
- Cash can grow at a separate `cashYield`
- Brokerage and retirement accounts grow at the investment return assumption
- Expenses inflate over time using the inflation assumption
- Housing is modeled monthly so moves, sales, and overlapping housing periods can be reflected more precisely

This makes the model useful for planning and comparison, but it is not a substitute for tax, legal, or fiduciary advice.

## How Projections Are Calculated

### High-Level Flow

For each month from now through life expectancy, the backend:

1. Determines the user’s age for that month
2. Determines which income sources are active
3. Calculates taxes and net income
4. Applies employee and employer retirement contributions
5. Applies current or retirement non-housing expenses, adjusted for inflation
6. Applies housing costs for any active owned homes or rentals
7. Processes real-estate events such as purchases, mortgage payments, and sales
8. Covers any cash shortfall using the withdrawal order
9. Applies monthly growth to cash and invested assets
10. Rolls those monthly results into a yearly summary

The main projection logic lives in:

- `server/src/services/projectionService.js`
- `server/src/services/realEstateService.js`
- `server/src/services/taxService.js`

### Simple Scenario: One Job, No Real Estate

The simplest case is:

- one salary
- one retirement age
- basic expenses
- assets that grow each month

In that case the engine does this:

- annual income is converted into monthly income
- taxes are estimated
- retirement contributions are subtracted
- monthly expenses are subtracted
- leftover cash stays in cash
- cash grows at `cashYield`
- brokerage and retirement accounts grow at the investment-return assumption

At the end of each year, the app records:

- age
- income
- expenses
- net worth
- retirement balance

### More Realistic Income Modeling

The app supports multiple salary phases and multiple non-salary income streams.

Examples:

- a higher-paying tech job from ages 49-52
- a clergy role from ages 52-60
- passive rental income from ages 55-70

For each age, the engine selects the active income entries whose start and end ages include that year.

#### Salary Phases

Each salary phase can include:

- job title
- start age and end age
- annual salary
- retirement contribution percent
- employer match
- standard or clergy tax treatment

#### Other Income Streams

Other income can be modeled separately from salary, for example:

- passive rental income
- consulting income
- business distributions

Each non-salary stream has:

- annual amount
- start age and end age
- taxable percent

## Tax Treatment

### Standard Salary

For standard salary phases, the model assumes:

- total income = salary
- taxable income = salary
- income tax = taxable income × `22%`
- net income = salary - income tax

### Clergy Housing Allowance

For clergy phases, the app treats `baseSalary` as total annual compensation for that phase.

If a salary phase has:

- `baseSalary = 120,000`
- `housingAllowance = 50`

then the model interprets that as:

- `60,000` designated as housing allowance
- `60,000` as the non-housing portion of salary

Federal taxable income is reduced by the exempt portion of that housing allowance.

The formulas are:

```text
housingAllowanceAmount = baseSalary × housingAllowancePercent
taxableIncome = baseSalary - (housingAllowanceAmount × exemptPercent)
incomeTax = taxableIncome × 22%
secaTax = totalIncome × 15.3%    // clergy only
netIncome = totalIncome - incomeTax - secaTax
```

Important: this is a simplified planner assumption, not full clergy tax preparation.

## Retirement Contributions

While a salary phase is active, the engine can add:

- employee retirement contributions
- employer match

The formulas are:

```text
employeeContribution = earnedIncome × contributionPercent
employerContribution = earnedIncome × employerMatchPercent
```

Employee contributions reduce spendable cashflow in the model.
Employer contributions increase the retirement account balance but do not reduce take-home pay.

If a later career phase has `0%` contribution, contributions stop for that phase.

## Expenses

The app separates:

- non-housing expenses entered in the `Expenses` step
- housing costs derived from the `Housing` step

That is intentional. The model wants housing to come from the housing timeline rather than being mixed into the user’s generic spending entries.

### Current vs Retirement Expenses

The app keeps two non-housing expense states:

- current monthly expenses
- retirement monthly expenses

The engine applies:

- current expenses while working
- retirement expenses after retirement

Both inflate over time:

```text
inflatedMonthlyExpense = baseMonthlyExpense × (1 + inflationRate)^(yearsFromStart)
```

## Housing And Real Estate

Housing is modeled monthly, not just by age. That allows:

- selling one home and renting later in the same year
- buying a new home after a sale
- overlapping ownership and rental periods during a move

### Rentals

Rentals are active between their start month/year and optional end month/year.

If a rental is active in a given month:

- its monthly rent is included in housing cost

### Owned Homes

For each property, the engine can model:

- current home value
- current mortgage balance
- mortgage rate
- monthly mortgage payment
- monthly taxes and insurance
- purchase timing
- sale timing
- expected sale price override
- selling costs
- destination account for sale proceeds

If taxes and insurance are not entered, the engine estimates them using:

- property tax default: `1.2%` of home value annually
- insurance default: `0.5%` of home value annually

### Mortgage Modeling

Each month the model:

1. calculates interest on the remaining balance
2. uses the scheduled monthly payment
3. applies the principal portion to reduce the balance

If the user gave a monthly mortgage payment instead of a remaining term, the engine can derive remaining months from the current balance, rate, and payment.

### Real-Estate Sale Logic

When a property reaches its sale month:

1. The app determines the sale price
2. It calculates selling costs
3. It subtracts the remaining mortgage
4. It sends net proceeds to the selected account

Sale price is:

```text
expectedSalePrice                 // if provided
or
purchasePrice × (1 + appreciationRate)^(time held)
```

Net proceeds are:

```text
netProceeds = salePrice - remainingMortgage - sellingCosts
```

Selling costs default to `6%` unless overridden.

Current rule:

- proceeds can go only to `cash` or `brokerage`

That restriction prevents unrealistic routing of home-sale proceeds directly into retirement accounts.

### Retirement Snapshot

At retirement age, the app records a snapshot of:

- total net worth
- cash
- brokerage
- 401(k)
- IRA
- Roth IRA
- real-estate equity

If all properties are sold before retirement, real-estate equity at retirement can correctly be `0`.

## Withdrawal Logic

If monthly cash goes negative, the model funds the shortfall from assets.

The current order is:

- while working: cash first, then brokerage, then 401(k), then IRA, then Roth IRA
- in retirement displays and ledger language: cash first, then brokerage, then IRA, then 401(k), then Roth IRA

The ledger reports both:

- spending funded by current income
- additional draws funded by assets

This is important because a person can still be working and still need to draw from cash if spending exceeds take-home pay.

## Recommended Spend Calculations

### Recommended Working Spend

The app estimates how much monthly spending is affordable while still working by comparing:

- current estimated net income
- current retirement contributions
- projected current-year expenses

In the current implementation:

```text
recommendedWorkingSpend =
max(0, monthlyNetIncome - monthlyModeledExpenses - monthlyEmployeeContribution)
```

This is a conservative estimate of extra monthly spending capacity, not a full lifestyle recommendation.

### Recommended Retirement Spend

The app also estimates retirement spending capacity using the safe withdrawal rate:

```text
recommendedRetirementSpend =
(portfolioAtRetirement × safeWithdrawalRate) / 12
```

If the safe withdrawal rate is `4%`, the app is using the classic 4% rule.

## Market Scenarios And Monte Carlo

The app runs `1,000` Monte Carlo simulations.

For each simulation:

- it samples one annual investment return for each projected year
- sampled returns come from the configured mean and standard deviation
- the sampled annual return is converted into a monthly growth rate
- the full projection is rerun using that return path

The annual return sampling is approximately:

```text
sampledReturn = mean + stdDev × randomNormal()
```

Returns are floored at `-99%` so the portfolio cannot go below zero from a single annual return draw.

### Probability Of Success

A simulation run counts as successful when the investable portfolio does not run out before the end of the plan.

The app reports:

```text
successProbability = successfulRuns / 1000
```

### Why The App Shows Three Market Labels

The UI shows:

- `Well Below Average`
- `Below Average`
- `Average`

These are not three fixed return assumptions. They are three selected paths taken from the 1,000 Monte Carlo runs.

Current mapping:

- `Well Below Average` = about the 10th percentile retirement outcome
- `Below Average` = about the 25th percentile retirement outcome
- `Average` = about the 50th percentile retirement outcome

That means:

- `Well Below Average` is a conservative stress case
- `Below Average` is a cautious but less severe case
- `Average` is the midpoint-style case

The app then reruns the exact selected return path for each scenario and uses those yearly results for the scenario charts.

## From Simple To Complex: Example Planning Cases

### Case 1: Basic Saver

Inputs:

- one salary
- one set of expenses
- cash and 401(k)

Model behavior:

- salary funds expenses
- retirement contributions grow the 401(k)
- remaining cash compounds slowly
- invested assets grow at the mean return

### Case 2: Career Change

Inputs:

- high-paying job now
- lower-paying job later
- contributions stop in the second job

Model behavior:

- income drops when the second phase starts
- contributions stop if the later phase contribution rate is `0`
- warnings can appear if spending remains at the earlier-job lifestyle level

### Case 3: Clergy Transition

Inputs:

- clergy salary phase
- housing allowance percent
- exempt percent

Model behavior:

- taxable income is reduced by the exempt housing portion
- SECA is still applied to clergy compensation
- take-home pay can be higher or lower than a standard-salary phase depending on the mix

### Case 4: Sell Two Homes And Rent

Inputs:

- sale dates for two homes
- monthly rent starting later
- proceeds sent to cash

Model behavior:

- sale proceeds appear as cash impact in the sale year
- housing cost shifts from ownership costs to rent
- the withdrawal ledger and retirement snapshot reflect the resulting cash and brokerage balances

### Case 5: Sell And Buy Another Home

Inputs:

- one home sale
- down payment on a new home
- financed remaining balance

Model behavior:

- proceeds increase cash
- the new purchase reduces cash
- monthly mortgage plus taxes and insurance are included in spending
- home equity is tracked as part of real-estate equity

### Case 6: Full Retirement Plan Stress Test

Inputs:

- multiple incomes
- clergy phase
- real-estate sales
- rentals
- retirement income
- variable markets

Model behavior:

- the deterministic path shows one clean average-return projection
- Monte Carlo shows the range of market outcomes
- conservative scenario views show what retirement may look like under weaker markets
- the probability of success estimates how often the plan avoids portfolio depletion

## Storage And Multi-User Support

The backend storage layer is isolated behind a repository so the app can use:

- local Postgres in Docker
- hosted Postgres such as Railway, Render, or Neon
- local JSON fallback

The API is already structured around `userId`, which makes it easier to add authentication later without rewriting the projection engine.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   npm run install:all
   ```

2. Copy environment files:

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

3. Start local Postgres:

   ```bash
   npm run db:start
   ```

4. If you want to migrate the demo JSON plan into Postgres:

   ```bash
   npm run migrate:json-to-postgres --prefix server
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:3001`.

## Starting And Shutting Down

### Fastest Startup

If dependencies and `.env` files are already in place, this is the shortest path:

1. Start Postgres:

   ```bash
   npm run db:start
   ```

2. Start the frontend and backend together:

   ```bash
   npm run dev
   ```

3. Open the app:

   ```text
   http://localhost:5173
   ```

The API will be available at `http://localhost:3001`.

### Start Only One Part

If you only want one side running:

- frontend only:

  ```bash
  npm run dev:client
  ```

- backend only:

  ```bash
  npm run dev:server
  ```

### Shutdown

To fully stop the app locally:

1. Stop the dev servers started by `npm run dev`, `npm run dev:client`, or `npm run dev:server`
   by pressing `Ctrl+C` in the terminal where they are running.

2. Stop the local Postgres container:

   ```bash
   npm run db:stop
   ```

### Typical Local Session

Start:

```bash
npm run db:start
npm run dev
```

Stop:

```bash
# press Ctrl+C to stop the dev server(s)
npm run db:stop
```

## Local Multi-User Testing

The sidebar includes a `Planner ID` field.

- Enter an ID such as `alice` or `couple-plan-1`
- Click `Load planner`
- The backend will load that planner if it exists
- If it does not exist, the backend creates a fresh default planner

There is still no authentication layer yet. This is for local testing and architecture validation.

## Environment Variables

### Server

`server/.env`

```bash
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/retire_yet
PGSSLMODE=disable
USER_DATA_FILE_PATH=./data/userData.json
```

Notes:

- If `DATABASE_URL` is set, the backend uses Postgres.
- If `DATABASE_URL` is omitted, it falls back to JSON-file storage.
- `PGSSLMODE=disable` is appropriate for local Docker Postgres.
- Hosted Postgres providers usually require SSL.

### Client

`client/.env`

```bash
VITE_API_BASE_URL=http://localhost:3001/api
VITE_DEFAULT_USER_ID=demo-user
```

## Useful Scripts

### Root

- `npm run dev` starts client and server together
- `npm run dev:client` starts only the Vite frontend
- `npm run dev:server` starts only the Express backend
- `npm run db:start` starts the local Postgres container
- `npm run db:stop` stops the local Postgres container

### Server

- `npm run dev --prefix server` starts the API with nodemon
- `npm run start --prefix server` starts the API normally
- `npm run migrate:json-to-postgres --prefix server` imports `server/data/userData.json` into Postgres

## Project Structure

```text
.
├── client
│   ├── .env.example
│   ├── package.json
│   └── src
├── server
│   ├── .env.example
│   ├── data
│   │   └── userData.json
│   ├── package.json
│   ├── scripts
│   │   └── migrate-json-to-postgres.js
│   └── src
│       ├── db
│       ├── repositories
│       ├── routes
│       ├── services
│       └── validators
├── docker-compose.yml
├── package.json
└── README.md
```

## Current Limitations

- Tax logic is intentionally simplified
- No authentication yet
- No account-specific tax drag for brokerage
- No RMD logic yet
- No detailed Social Security optimization logic yet
- No estate-planning or legacy modeling yet

Those would be reasonable next improvements if the app moves from planner prototype toward production advice tooling.
