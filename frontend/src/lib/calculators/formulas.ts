import type { FormulaFn } from "./types";

// All calculator maths. Runs in the browser — nothing here touches a server,
// which is why every page is instant and why there is no backend to pay for.
//
// Each function takes the input values (keyed by the input `id` in
// src/data/calculators.js) and returns:
//
//   values  — { outputId: number | string }  the figures shown in the result cards
//   series  — [{ x, a, b }]                  for the "growth" chart
//   donut   — [{ label, value }]             for the "donut" chart
//   compare — [{ label, value, sub }]        for the "compare" chart
//   table   — { head, rows }                 optional detail table
//   note    — string                         optional warning shown above results
//
// Contract: never return NaN or Infinity. Guard the edges (zero rate, payment
// too small to ever clear a balance) and say so in `note` instead.

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

/** Future value of a series of end-of-month payments, paid at the start of each month. */
function annuityFV(payment: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return payment * months;
  return payment * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
}

/** The standard EMI formula. */
function emiFor(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return principal;
  if (monthlyRate === 0) return principal / months;
  const f = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * f) / (f - 1);
}

/** Walk a loan month by month. Returns totals plus a yearly roll-up. */
function amortise(principal: number, annualRate: number, emi: number, extraMonthly = 0, maxMonths = 1200) {
  const r = annualRate / 100 / 12;
  let balance = principal;
  let totalInterest = 0;
  let months = 0;
  const yearly = [];
  let yearInterest = 0;
  let yearPrincipal = 0;

  while (balance > 0.5 && months < maxMonths) {
    const interest = balance * r;
    const payment = Math.min(emi + extraMonthly, balance + interest);
    const principalPaid = payment - interest;

    if (principalPaid <= 0) return { impossible: true, totalInterest: Infinity, months: Infinity, yearly: [] };

    balance -= principalPaid;
    totalInterest += interest;
    yearInterest += interest;
    yearPrincipal += principalPaid;
    months++;

    if (months % 12 === 0 || balance <= 0.5) {
      yearly.push({
        year: Math.ceil(months / 12),
        interest: yearInterest,
        principal: yearPrincipal,
        balance: Math.max(balance, 0),
      });
      yearInterest = 0;
      yearPrincipal = 0;
    }
  }

  return { impossible: false, totalInterest, months, yearly, balance: Math.max(balance, 0) };
}

export const FORMULAS: Record<string, FormulaFn> = {
  // ─────────────────────────────────────────────────────── INVESTING ──
  sip({ monthly, rate, years }) {
    const r = rate / 100 / 12;
    const n = years * 12;
    const total = annuityFV(monthly, r, n);
    const invested = monthly * n;

    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: monthly * y * 12, b: annuityFV(monthly, r, y * 12) });
    }

    return {
      values: { total, invested, returns: total - invested },
      series,
      donut: [
        { label: 'You invested', value: invested },
        { label: 'Market added', value: total - invested },
      ],
    };
  },

  lumpsum({ principal, rate, years }) {
    const total = principal * Math.pow(1 + rate / 100, years);
    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: principal, b: principal * Math.pow(1 + rate / 100, y) });
    }
    return {
      values: { total, invested: principal, returns: total - principal },
      series,
      donut: [
        { label: 'You invested', value: principal },
        { label: 'Market added', value: total - principal },
      ],
    };
  },

  compound({ principal, contribution, rate, years, frequency }) {
    const n = Number(frequency) || 1;
    const r = rate / 100;
    const at = (t: number) => {
      const grown = principal * Math.pow(1 + r / n, n * t);
      // Effective monthly rate implied by the chosen compounding frequency.
      const monthly = Math.pow(1 + r / n, n / 12) - 1;
      return grown + annuityFV(contribution, monthly, t * 12);
    };

    const total = at(years);
    const invested = principal + contribution * years * 12;

    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: principal + contribution * y * 12, b: at(y) });
    }

    return {
      values: { total, invested, returns: total - invested },
      series,
      donut: [
        { label: 'You put in', value: invested },
        { label: 'Interest earned', value: total - invested },
      ],
    };
  },

  cagr({ initial, final, years }) {
    if (initial <= 0 || years <= 0) {
      return { values: { cagr: 0, absolute: 0, profit: 0 }, note: 'Enter a starting value above zero.' };
    }
    const cagr = (Math.pow(final / initial, 1 / years) - 1) * 100;
    const absolute = (final / initial - 1) * 100;

    const series = [];
    const steps = Math.max(Math.round(years), 1);
    for (let y = 0; y <= steps; y++) {
      series.push({ x: `Y${y}`, a: initial, b: initial * Math.pow(final / initial, y / years) });
    }

    return {
      values: { cagr: safe(cagr), absolute: safe(absolute), profit: final - initial },
      series,
      note: cagr < 0 ? 'This investment lost value — the CAGR shown is the annualised rate of loss.' : '',
    };
  },

  // ────────────────────────────────────────────────────────── LOANS ──
  emi({ principal, rate, years }) {
    const r = rate / 100 / 12;
    const n = years * 12;
    const emi = emiFor(principal, r, n);
    const total = emi * n;
    const interest = total - principal;
    const { yearly } = amortise(principal, rate, emi);

    return {
      values: { emi, interest, total },
      donut: [
        { label: 'Principal', value: principal },
        { label: 'Interest', value: interest },
      ],
      table: {
        head: ['Year', 'Principal paid', 'Interest paid', 'Balance left'],
        rows: yearly.map((y) => [`Year ${y.year}`, y.principal, y.interest, y.balance]),
        format: ['text', 'currency', 'currency', 'currency'],
      },
    };
  },

  prepayment({ principal, rate, years, extraMonthly, lumpSum }) {
    const r = rate / 100 / 12;
    const n = years * 12;
    const emi = emiFor(principal, r, n);

    const base = amortise(principal, rate, emi);
    const reducedPrincipal = Math.max(principal - lumpSum, 0);

    if (reducedPrincipal <= 0) {
      return {
        values: { interestSaved: base.totalInterest, monthsSaved: base.months, newInterest: 0 },
        compare: [
          { label: 'Interest without prepaying', value: base.totalInterest },
          { label: 'Interest after prepaying', value: 0 },
        ],
        note: 'Your lump sum clears the entire loan today.',
      };
    }

    const fast = amortise(reducedPrincipal, rate, emi, extraMonthly);

    if (fast.impossible) {
      return {
        values: { interestSaved: 0, monthsSaved: 0, newInterest: base.totalInterest },
        note: 'Check your inputs — that EMI does not cover the monthly interest on this loan.',
      };
    }

    return {
      values: {
        interestSaved: base.totalInterest - fast.totalInterest,
        monthsSaved: base.months - fast.months,
        newInterest: fast.totalInterest,
      },
      compare: [
        { label: 'Sticking to the schedule', value: base.totalInterest, sub: `${Math.round(base.months / 12)} yr ${base.months % 12} mo` },
        { label: 'With your prepayments', value: fast.totalInterest, sub: `${Math.round(fast.months / 12)} yr ${fast.months % 12} mo` },
      ],
      table: {
        head: ['Year', 'Principal paid', 'Interest paid', 'Balance left'],
        rows: fast.yearly.map((y) => [`Year ${y.year}`, y.principal, y.interest, y.balance]),
        format: ['text', 'currency', 'currency', 'currency'],
      },
    };
  },

  creditCard({ balance, rate, payment }) {
    const r = rate / 100 / 12;
    const monthlyInterest = balance * r;

    if (payment <= monthlyInterest) {
      return {
        values: { months: 0, interest: 0, total: 0 },
        note: `At this rate your balance grows by about ${Math.round(monthlyInterest).toLocaleString()} a month in interest alone. A payment of ${Math.round(monthlyInterest).toLocaleString()} or less will never clear it — you need to pay more than the interest before any of it touches the balance.`,
      };
    }

    const run = amortise(balance, rate, payment);
    const faster = amortise(balance, rate, payment * 1.5);

    return {
      values: { months: run.months, interest: run.totalInterest, total: balance + run.totalInterest },
      compare: [
        { label: 'Paying what you pay now', value: run.totalInterest, sub: `${run.months} months` },
        { label: 'Paying 50% more each month', value: faster.totalInterest, sub: `${faster.months} months` },
      ],
      note:
        run.months > 60
          ? 'Over five years to clear. A balance transfer or a personal loan at a lower rate would almost certainly cost you less — see the FAQ below.'
          : '',
    };
  },

  // ────────────────────────────────────────────────────── PLANNING ──
  goalSip({ target, years, rate, existing }) {
    const r = rate / 100 / 12;
    const n = years * 12;
    const existingGrown = existing * Math.pow(1 + rate / 100, years);
    const gap = Math.max(target - existingGrown, 0);

    let monthly = 0;
    if (gap > 0) {
      monthly = r === 0 ? gap / n : (gap * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
    }

    const invested = monthly * n + existing;

    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({
        x: `Y${y}`,
        a: existing + monthly * y * 12,
        b: existing * Math.pow(1 + rate / 100, y) + annuityFV(monthly, r, y * 12),
      });
    }

    return {
      values: { monthly, invested, returns: Math.max(target - invested, 0) },
      series,
      note: gap === 0 ? 'What you have already saved will reach this target on its own — no new investment needed.' : '',
    };
  },

  retirement({
    currentAge,
    retireAge,
    lifeExpectancy,
    monthlyExpense,
    inflation,
    preReturn,
    postReturn,
    existing,
  }) {
    const yearsToRetire = retireAge - currentAge;
    const yearsInRetirement = lifeExpectancy - retireAge;

    if (yearsToRetire <= 0 || yearsInRetirement <= 0) {
      return {
        values: { corpus: 0, monthlySip: 0, futureExpense: 0 },
        note: 'Retirement age must be after your current age, and the plan-until age must be after retirement.',
      };
    }

    const inf = inflation / 100;
    const futureExpense = monthlyExpense * Math.pow(1 + inf, yearsToRetire);
    const annualAtRetirement = futureExpense * 12;

    // Corpus for an inflation-adjusted withdrawal stream: the real (inflation-
    // adjusted) return is what determines how long the pot lasts.
    const realReturn = (1 + postReturn / 100) / (1 + inf) - 1;
    const corpus =
      Math.abs(realReturn) < 0.0001
        ? annualAtRetirement * yearsInRetirement
        : annualAtRetirement * ((1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn) * (1 + realReturn);

    const existingGrown = existing * Math.pow(1 + preReturn / 100, yearsToRetire);
    const gap = Math.max(corpus - existingGrown, 0);

    const r = preReturn / 100 / 12;
    const n = yearsToRetire * 12;
    const monthlySip = gap === 0 ? 0 : r === 0 ? gap / n : (gap * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));

    const series = [];
    for (let y = 0; y <= yearsToRetire; y++) {
      series.push({
        x: `Y${y}`,
        a: existing + monthlySip * y * 12,
        b: existing * Math.pow(1 + preReturn / 100, y) + annuityFV(monthlySip, r, y * 12),
      });
    }

    return {
      values: { corpus, monthlySip, futureExpense },
      series,
      note:
        gap === 0
          ? 'You are already on track — what you have saved should grow into the corpus you need.'
          : `Planning for ${yearsInRetirement} years of retirement, with expenses rising ${inflation}% a year throughout.`,
    };
  },

  inflation({ amount, rate, years }) {
    const factor = Math.pow(1 + rate / 100, years);
    const futureCost = amount * factor;
    const futureWorth = amount / factor;

    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: amount, b: amount * Math.pow(1 + rate / 100, y) });
    }

    return {
      values: { futureCost, futureWorth, lost: (1 - 1 / factor) * 100 },
      series,
    };
  },

  emergencyFund({ expenses, emis, stability, currentSaved, monthlySaving }) {
    const monthlyCommitment = expenses + emis;
    const months = Number(stability) || 6;
    const target = monthlyCommitment * months;
    const gap = Math.max(target - currentSaved, 0);
    const monthsToBuild = gap === 0 ? 0 : Math.ceil(gap / Math.max(monthlySaving, 1));

    return {
      values: { target, gap, monthsToBuild },
      donut: [
        { label: 'Already saved', value: Math.min(currentSaved, target) },
        { label: 'Still to save', value: gap },
      ],
      note:
        gap === 0
          ? 'Your emergency fund is fully funded. Keep it in a savings account or liquid fund and leave it alone.'
          : `Covers ${months} months of essential expenses plus EMIs — sized for your income stability.`,
    };
  },

  // ─────────────────────────────────────────────────────── SAVINGS ──
  fd({ principal, rate, years, frequency, inflation }) {
    const n = Number(frequency) || 4;
    const maturity = principal * Math.pow(1 + rate / 100 / n, n * years);
    const realValue = maturity / Math.pow(1 + inflation / 100, years);

    return {
      values: { maturity, interest: maturity - principal, realValue },
      donut: [
        { label: 'Your deposit', value: principal },
        { label: 'Interest earned', value: maturity - principal },
      ],
      note:
        rate <= inflation
          ? 'At this rate the deposit loses purchasing power — inflation is running at or above your interest rate.'
          : '',
    };
  },

  // ───────────────────────────────────────────────────────── OTHER ──
  rentVsBuy({
    homePrice,
    downPayment,
    loanRate,
    loanYears,
    monthlyRent,
    rentIncrease,
    appreciation,
    investReturn,
    horizon,
  }) {
    const loanAmount = Math.max(homePrice - downPayment, 0);
    const r = loanRate / 100 / 12;
    const emi = emiFor(loanAmount, r, loanYears * 12);
    const investMonthly = investReturn / 100 / 12;

    let balance = loanAmount;
    let portfolio = downPayment; // The renter invests the down payment on day one.
    let rent = monthlyRent;
    const months = horizon * 12;
    const seriesBuy = [];
    const seriesRent = [];

    for (let m = 1; m <= months; m++) {
      // Buying: pay the EMI, plus upkeep and property tax (~1.5% of value a year).
      if (balance > 0) {
        const interest = balance * r;
        balance = Math.max(balance - (emi - interest), 0);
      }
      const propertyValue = homePrice * Math.pow(1 + appreciation / 100, m / 12);
      const upkeep = (propertyValue * 0.015) / 12;
      const ownCost = (balance > 0 ? emi : 0) + upkeep;

      // Renting: invest whatever ownership would have cost above the rent.
      portfolio *= 1 + investMonthly;
      portfolio += Math.max(ownCost - rent, 0);

      if (m % 12 === 0) {
        rent *= 1 + rentIncrease / 100;
        seriesBuy.push({ x: `Y${m / 12}`, a: 0, b: propertyValue - balance });
        seriesRent.push({ x: `Y${m / 12}`, a: 0, b: portfolio });
      }
    }

    const finalPropertyValue = homePrice * Math.pow(1 + appreciation / 100, horizon);
    const buyNetWorth = finalPropertyValue - balance;
    const rentNetWorth = portfolio;
    const diff = Math.abs(buyNetWorth - rentNetWorth);
    const closeCall = diff / Math.max(buyNetWorth, rentNetWorth) < 0.05;

    return {
      values: {
        verdict: closeCall ? 'Too close to call' : buyNetWorth > rentNetWorth ? 'Buying' : 'Renting + investing',
        buyNetWorth,
        rentNetWorth,
      },
      compare: [
        { label: 'Buy', value: buyNetWorth, sub: `Property ${Math.round(finalPropertyValue).toLocaleString()} − loan left` },
        { label: 'Rent + invest', value: rentNetWorth, sub: `Portfolio after ${horizon} years` },
      ],
      note: closeCall
        ? 'The two paths land within 5% of each other on these numbers — at that margin, pick on lifestyle rather than spreadsheet.'
        : `Over ${horizon} years, ${buyNetWorth > rentNetWorth ? 'buying' : 'renting and investing the difference'} leaves you roughly ${Math.round(diff).toLocaleString()} better off. Change the appreciation rate to see how sensitive that is.`,
    };
  },

  freelanceRate({ targetIncome, expenses, taxRate, weeksOff, hoursPerWeek, billablePercent }) {
    const workingWeeks = Math.max(52 - weeksOff, 1);
    const billableHours = workingWeeks * hoursPerWeek * (clamp(billablePercent, 1, 100) / 100);
    const grossNeeded = targetIncome / (1 - clamp(taxRate, 0, 49) / 100) + expenses;
    const hourlyRate = grossNeeded / Math.max(billableHours, 1);

    return {
      values: { hourlyRate, dayRate: hourlyRate * 8, billableHours: Math.round(billableHours) },
      donut: [
        { label: 'Your take-home', value: targetIncome },
        { label: 'Tax', value: grossNeeded - expenses - targetIncome },
        { label: 'Business expenses', value: expenses },
      ],
      note: `You need to invoice about ${Math.round(grossNeeded).toLocaleString()} a year to take home ${Math.round(targetIncome).toLocaleString()}, across ${Math.round(billableHours)} billable hours.`,
    };
  },

  // ═══════════════════════════════════════════════ NEW CALCULATORS ══
  rd({ monthly, rate, years }) {
    const months = years * 12;
    // RD compounds quarterly in India; convert to an effective monthly rate.
    const effMonthly = Math.pow(1 + rate / 100 / 4, 4 / 12) - 1;
    const maturity = annuityFV(monthly, effMonthly, months);
    const invested = monthly * months;
    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: monthly * y * 12, b: annuityFV(monthly, effMonthly, y * 12) });
    }
    return {
      values: { maturity, invested, interest: maturity - invested },
      series,
      donut: [
        { label: "You deposited", value: invested },
        { label: "Interest earned", value: maturity - invested },
      ],
    };
  },

  swp({ corpus, withdrawal, rate, years }) {
    const r = rate / 100 / 12;
    const months = years * 12;
    let balance = corpus;
    let withdrawn = 0;
    let lastedMonths = months;
    const series = [];
    for (let m = 1; m <= months; m++) {
      const grown = balance * (1 + r);
      const take = Math.min(withdrawal, grown);
      balance = grown - take;
      withdrawn += take;
      if (m % 12 === 0) series.push({ x: `Y${m / 12}`, a: 0, b: Math.max(balance, 0) });
      if (balance <= 0.5) {
        lastedMonths = m;
        balance = 0;
        break;
      }
    }
    const depleted = lastedMonths < months;
    return {
      values: { finalBalance: balance, totalWithdrawn: withdrawn, monthsLasted: depleted ? lastedMonths : months },
      series,
      note: depleted
        ? `At this withdrawal the corpus runs dry in about ${Math.floor(lastedMonths / 12)} yr ${lastedMonths % 12} mo — lower the monthly withdrawal or raise the return to make it last.`
        : `The corpus outlasts the ${years}-year window, ending with ${Math.round(balance).toLocaleString()} still invested.`,
    };
  },

  stepUpSip({ monthly, rate, years, stepUp }) {
    const r = rate / 100 / 12;
    let total = 0;
    let invested = 0;
    let current = monthly;
    const series = [{ x: "Y0", a: 0, b: 0 }];
    for (let y = 1; y <= years; y++) {
      for (let m = 0; m < 12; m++) {
        total = total * (1 + r) + current;
        invested += current;
      }
      series.push({ x: `Y${y}`, a: invested, b: total });
      current = current * (1 + stepUp / 100);
    }
    return {
      values: { total, invested, returns: total - invested },
      series,
      donut: [
        { label: "You invested", value: invested },
        { label: "Market added", value: total - invested },
      ],
    };
  },

  simpleInterest({ principal, rate, years }) {
    const interest = (principal * rate * years) / 100;
    const total = principal + interest;
    const series = [];
    for (let y = 0; y <= years; y++) {
      series.push({ x: `Y${y}`, a: principal, b: principal + (principal * rate * y) / 100 });
    }
    return {
      values: { total, interest, principal },
      series,
      donut: [
        { label: "Principal", value: principal },
        { label: "Interest", value: interest },
      ],
    };
  },

  roi({ invested, returned, years }) {
    const profit = returned - invested;
    const roiPct = invested > 0 ? (profit / invested) * 100 : 0;
    const annualised = invested > 0 && years > 0 ? (Math.pow(returned / invested, 1 / years) - 1) * 100 : 0;
    return {
      values: { roi: safe(roiPct), annualised: safe(annualised), profit },
      compare: [
        { label: "You invested", value: invested },
        { label: "You got back", value: returned },
      ],
      note:
        profit < 0
          ? "This is a loss — the return is below what you put in, so both ROI and the annualised figure are negative."
          : "",
    };
  },

  netWorth({ cash, investments, property, otherAssets, loans, cardDebt }) {
    const assets = cash + investments + property + otherAssets;
    const liabilities = loans + cardDebt;
    const net = assets - liabilities;
    return {
      values: { net, assets, liabilities },
      donut: [
        { label: "Cash", value: cash },
        { label: "Investments", value: investments },
        { label: "Property", value: property },
        { label: "Other", value: otherAssets },
      ],
      note:
        liabilities > assets
          ? "Your liabilities exceed your assets — a negative net worth. Clearing high-interest debt is the fastest way to turn this positive."
          : "",
    };
  },

  homeAffordability({ income, otherEmis, rate, years, downPayment }) {
    const monthlyIncome = income / 12;
    // Lenders cap total EMIs near ~50% of monthly income.
    const availableEmi = Math.max(monthlyIncome * 0.5 - otherEmis, 0);
    const r = rate / 100 / 12;
    const n = years * 12;
    const f = Math.pow(1 + r, n);
    const loan = r === 0 ? availableEmi * n : (availableEmi * (f - 1)) / (r * f);
    const budget = loan + downPayment;
    return {
      values: { budget, loan, emi: availableEmi },
      donut: [
        { label: "Loan you can service", value: loan },
        { label: "Your down payment", value: downPayment },
      ],
      note: `Assuming total EMIs stay within 50% of your monthly income, your home budget is about ${Math.round(budget).toLocaleString()} with a ${Math.round(availableEmi).toLocaleString()} monthly EMI.`,
    };
  },

  savingsRateFire({ income, expenses, currentSavings, returnRate }) {
    const monthlySaving = Math.max(income - expenses, 0);
    const savingsRate = income > 0 ? (monthlySaving / income) * 100 : 0;
    const fireTarget = expenses * 12 * 25; // the 4% rule → 25× annual expenses
    const r = returnRate / 100 / 12;
    let balance = currentSavings;
    let months = 0;
    while (balance < fireTarget && months < 1200 && monthlySaving > 0) {
      balance = balance * (1 + r) + monthlySaving;
      months++;
    }
    const reached = balance >= fireTarget;
    return {
      values: { savingsRate: safe(savingsRate), fireTarget, yearsToFi: reached ? Math.round((months / 12) * 10) / 10 : 0 },
      donut: [
        { label: "You spend", value: expenses * 12 },
        { label: "You save", value: monthlySaving * 12 },
      ],
      note:
        monthlySaving <= 0
          ? "Your expenses meet or exceed your income — there is nothing to invest. Financial independence starts with a positive savings rate."
          : reached
            ? `Saving ${Math.round(monthlySaving).toLocaleString()} a month at ${returnRate}%, you reach 25× annual expenses (${Math.round(fireTarget).toLocaleString()}) in about ${(months / 12).toFixed(1)} years.`
            : "At this rate you don't reach financial independence within 100 years — raise your savings rate or your return.",
    };
  },

  doublingTime({ amount, rate }) {
    const rule72 = rate > 0 ? 72 / rate : 0;
    const exact = rate > 0 ? Math.log(2) / Math.log(1 + rate / 100) : 0;
    const doubled = amount * 2;
    return {
      values: { exact: safe(Math.round(exact * 10) / 10), rule72: Math.round(rule72 * 10) / 10, doubled },
      note:
        rate <= 0
          ? "Enter a positive return to see how long money takes to double."
          : `At ${rate}% a year, ${Math.round(amount).toLocaleString()} becomes ${Math.round(doubled).toLocaleString()} in about ${exact.toFixed(1)} years. The Rule of 72 estimates ${rule72.toFixed(1)} — close enough for mental maths.`,
    };
  },

  nps({ currentAge, retireAge, monthly, rate, annuityShare, annuityReturn }) {
    const r = rate / 100 / 12;
    const n = Math.max(retireAge - currentAge, 0) * 12;
    const corpus = annuityFV(monthly, r, n);
    const invested = monthly * n;
    const annuityCorpus = corpus * (annuityShare / 100);
    const lumpSum = corpus - annuityCorpus;
    const monthlyPension = (annuityCorpus * (annuityReturn / 100)) / 12;
    return {
      values: { corpus, monthlyPension, lumpSum },
      donut: [
        { label: "You invested", value: invested },
        { label: "Growth", value: Math.max(corpus - invested, 0) },
      ],
      note: `At retirement you'd have about ${Math.round(corpus).toLocaleString()}. Annuitising ${annuityShare}% at ${annuityReturn}% gives roughly ${Math.round(monthlyPension).toLocaleString()}/month pension, leaving ${Math.round(lumpSum).toLocaleString()} as a tax-free lump sum.`,
    };
  },

  gratuity({ lastSalary, years }) {
    // Statutory formula: 15 days' wages per completed year, on a 26-day month.
    const raw = (lastSalary * 15 * years) / 26;
    const capped = Math.min(raw, 2000000); // ₹20L statutory tax-free cap
    return {
      values: { gratuity: capped, perYear: capped / Math.max(years, 1), uncapped: raw },
      note:
        raw > 2000000
          ? "The statutory tax-free gratuity is capped at ₹20,00,000 — the figure shown is capped. Anything above is at employer discretion and taxable."
          : "Based on 15 days' pay per completed year on a 26-day month. Payable after 5 years of continuous service.",
    };
  },

  apy({ rate, frequency }) {
    const n = Number(frequency) || 1;
    const apyPct = (Math.pow(1 + rate / 100 / n, n) - 1) * 100;
    const gain = apyPct - rate;
    const label = n === 1 ? "yearly" : n === 2 ? "half-yearly" : n === 4 ? "quarterly" : n === 12 ? "monthly" : n === 365 ? "daily" : `${n}×/yr`;
    return {
      values: { apy: apyPct, nominal: rate, gain },
      note: `A nominal ${rate}% compounded ${label} yields an effective ${apyPct.toFixed(2)}% a year — compounding adds ${gain.toFixed(2)} points.`,
    };
  },
};
