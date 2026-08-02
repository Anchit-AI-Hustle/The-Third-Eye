import type { Calculator } from "./types";

// Every calculator on the site is one object in this array.
//
// To add a calculator:
//   1. Add an object here.
//   2. Add a matching function to src/assets/formulas.js under the same `formula` key.
//   3. npm run build
//
// Nothing else. No routing, no config, no registration.
//
// Deliberate design note: every formula below is pure arithmetic. Nothing here
// depends on a tax slab, a government rule, or a rate that changes each year —
// so these pages never go stale and never need maintenance. That is what makes
// this a durable traffic asset instead of a chore.

export const calculators: Calculator[] = [
  // ─────────────────────────────────────────────────────── INVESTING ──
  {
    slug: 'sip-calculator',
    category: 'Investing',
    h1: 'SIP Calculator',
    metaTitle: 'SIP Calculator — Work Out What Your Monthly Investment Becomes',
    metaDescription:
      'Free SIP calculator. Enter your monthly amount, expected return and time period to see the maturity value, how much you invested and how much the market added.',
    keywords: ['sip calculator', 'mutual fund sip calculator', 'monthly investment calculator', 'sip returns'],
    formula: 'sip',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'monthly', label: 'Monthly investment', type: 'currency', default: 10000, min: 500, max: 500000, step: 500 },
      { id: 'rate', label: 'Expected return (per year)', type: 'percent', default: 12, min: 1, max: 30, step: 0.5 },
      { id: 'years', label: 'Time period', type: 'years', default: 15, min: 1, max: 40, step: 1 },
    ],
    outputs: [
      { id: 'total', label: 'Maturity value', kind: 'currency', hero: true },
      { id: 'invested', label: 'You invested', kind: 'currency' },
      { id: 'returns', label: 'Market added', kind: 'currency', accent: true },
    ],
    intro: `A SIP — Systematic Investment Plan — is just a standing instruction: the same amount leaves your bank on the same date every month and buys units of a mutual fund. The reason it works isn't clever timing. It's that you keep buying while prices are low, which is exactly when nobody feels like buying.

This calculator shows you the number that actually matters: what a fixed monthly habit turns into after compounding has had years to work on it. Move the time period slider and watch what happens between year 10 and year 20 — the gap is far wider than most people expect, and that gap is the entire argument for starting now rather than starting bigger.`,
    howItWorks: [
      'Each monthly instalment is treated as its own investment that compounds until the end date — so your first instalment grows for the full period, and your last one grows for a month.',
      'The standard future-value-of-an-annuity formula does this in one step: FV = P × ((1+i)ⁿ − 1) ÷ i × (1+i), where P is your monthly amount, i is the monthly return, and n is the number of instalments.',
      '"Market added" is simply maturity value minus everything you put in. In a long SIP this number usually ends up larger than your own contributions — that crossover is the whole point.',
    ],
    faqs: [
      {
        q: 'What return should I actually enter?',
        a: 'For a diversified equity index fund, 10–12% is a defensible long-run assumption. For hybrid funds, 8–10%. For debt funds, 6–7%. Whatever you pick, it is an assumption, not a promise — run the numbers again at a lower rate and make sure the plan still works if markets underperform.',
      },
      {
        q: 'Is it better to invest ₹5,000 for 20 years or ₹10,000 for 10 years?',
        a: 'You pay in the same ₹12 lakh either way, but at 12% the 20-year SIP finishes roughly twice as large. Time in the market does more heavy lifting than the size of the cheque. Try both in the calculator above — the comparison is worth seeing once.',
      },
      {
        q: 'Can I stop or pause a SIP?',
        a: 'Yes. SIPs have no lock-in unless you specifically chose an ELSS tax-saving fund, which locks each instalment for three years. You can pause, reduce or cancel any other SIP online, usually with a few days notice.',
      },
      {
        q: 'Does this account for tax?',
        a: 'No — it shows the pre-tax maturity value. Gains are taxed when you actually redeem, and the rate depends on the fund type and how long you held it. Treat the result as your gross number and check the current rules before you sell.',
      },
      {
        q: 'What is a step-up SIP?',
        a: 'One where you raise the instalment every year, usually in line with your salary. It is the single highest-leverage change most people can make: increasing a SIP 10% a year often beats chasing a 2% better return, and it costs you nothing today.',
      },
    ],
    related: ['goal-sip-calculator', 'lumpsum-calculator', 'compound-interest-calculator', 'retirement-calculator'],
  },

  {
    slug: 'lumpsum-calculator',
    category: 'Investing',
    h1: 'Lumpsum Investment Calculator',
    metaTitle: 'Lumpsum Calculator — What a One-Time Investment Grows Into',
    metaDescription:
      'Invest once, leave it alone. See what a one-time lumpsum grows to at any return rate and time period, and how much of the final figure is pure compounding.',
    keywords: ['lumpsum calculator', 'one time investment calculator', 'lump sum returns'],
    formula: 'lumpsum',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'principal', label: 'Amount invested', type: 'currency', default: 500000, min: 1000, max: 100000000, step: 10000 },
      { id: 'rate', label: 'Expected return (per year)', type: 'percent', default: 12, min: 1, max: 30, step: 0.5 },
      { id: 'years', label: 'Time period', type: 'years', default: 10, min: 1, max: 40, step: 1 },
    ],
    outputs: [
      { id: 'total', label: 'Maturity value', kind: 'currency', hero: true },
      { id: 'invested', label: 'You invested', kind: 'currency' },
      { id: 'returns', label: 'Market added', kind: 'currency', accent: true },
    ],
    intro: `A lumpsum is a single investment left to compound. A bonus, a maturing deposit, proceeds from a sale — money that arrives all at once and doesn't need to be touched.

The maths is the friendliest in all of personal finance: one amount, one rate, one time period. What surprises people is the shape of the curve. It barely moves for the first few years, then bends sharply upward. Nearly all of the growth arrives in the back half, which is why the most common lumpsum mistake isn't picking the wrong fund — it's withdrawing during the flat part.`,
    howItWorks: [
      'The compound interest formula does all the work: FV = P × (1 + r)ⁿ, with P your amount, r the annual return, and n the number of years.',
      'Every year\'s gain is added to the balance and earns its own return the following year. That reinvestment is the difference between compound and simple interest, and over long periods it is enormous.',
      'The chart plots your original amount as a flat line against the growing balance. The widening gap between them is compounding made visible.',
    ],
    faqs: [
      {
        q: 'Lumpsum or SIP — which is better?',
        a: 'Mathematically, lumpsum wins when markets rise, because your full amount is exposed from day one. Practically, SIP wins for most people, because it removes the question of whether today is a good day to invest. If you have a large sum and it makes you nervous, splitting it across 6–12 months is a reasonable middle path.',
      },
      {
        q: 'How long should I stay invested?',
        a: 'For equity, five years is a sensible floor and ten-plus is where the odds turn strongly in your favour. Shorter than three years, a bad stretch has no time to recover — that money belongs in a deposit or a liquid fund, not in equity.',
      },
      {
        q: 'Why does the chart look flat at the start?',
        a: 'Because it is. At 12%, the first year adds 12% of a small number. By year fifteen it adds 12% of a much bigger number. Same rate, wildly different absolute gain — that is exponential growth, and it is why patience is the actual skill.',
      },
      {
        q: 'Does inflation affect this result?',
        a: 'Yes, and the calculator shows nominal rupees. If the figure is ₹50 lakh in 20 years, its buying power at 6% inflation is closer to ₹15 lakh today. Use the inflation calculator to convert any future number into money you can actually reason about.',
      },
    ],
    related: ['sip-calculator', 'compound-interest-calculator', 'cagr-calculator', 'inflation-calculator'],
  },

  {
    slug: 'compound-interest-calculator',
    category: 'Investing',
    h1: 'Compound Interest Calculator',
    metaTitle: 'Compound Interest Calculator — Daily, Monthly, Quarterly or Yearly',
    metaDescription:
      'Calculate compound interest with any compounding frequency, with or without regular top-ups. See the year-by-year balance and exactly how much the interest earned.',
    keywords: ['compound interest calculator', 'compounding calculator', 'interest calculator'],
    formula: 'compound',
    chart: 'growth',
    offerTags: ['investing', 'savings'],
    inputs: [
      { id: 'principal', label: 'Starting amount', type: 'currency', default: 100000, min: 0, max: 100000000, step: 10000 },
      { id: 'contribution', label: 'Added every month', type: 'currency', default: 5000, min: 0, max: 1000000, step: 500 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 10, min: 0.1, max: 30, step: 0.1 },
      { id: 'years', label: 'Time period', type: 'years', default: 10, min: 1, max: 50, step: 1 },
      {
        id: 'frequency',
        label: 'Compounded',
        type: 'select',
        default: 12,
        options: [
          { value: 1, label: 'Yearly' },
          { value: 2, label: 'Half-yearly' },
          { value: 4, label: 'Quarterly' },
          { value: 12, label: 'Monthly' },
          { value: 365, label: 'Daily' },
        ],
      },
    ],
    outputs: [
      { id: 'total', label: 'Final balance', kind: 'currency', hero: true },
      { id: 'invested', label: 'You put in', kind: 'currency' },
      { id: 'returns', label: 'Interest earned', kind: 'currency', accent: true },
    ],
    intro: `Compound interest is interest that earns interest. Simple interest pays you on your original amount forever; compound interest pays you on your original amount plus every bit of interest already credited. Over a year the difference is trivial. Over thirty years it is the difference between a modest sum and a life-changing one.

This is the most flexible calculator on the site: set any compounding frequency, and add a monthly top-up if you're saving as you go. Switch frequency from Yearly to Daily on the same inputs and you'll see the effect is real but small — frequency is a rounding detail next to rate and time.`,
    howItWorks: [
      'The base formula is A = P × (1 + r/n)^(n×t) — where n is how many times a year interest is credited. More frequent crediting means slightly more interest.',
      'Monthly top-ups are compounded separately as an annuity and added on, so the result reflects both your starting amount and everything you added along the way.',
      '"Interest earned" strips out every rupee you contributed, leaving only what the interest itself generated.',
    ],
    faqs: [
      {
        q: 'What is the Rule of 72?',
        a: 'Divide 72 by your annual return to get roughly the number of years for money to double. At 8% that is 9 years; at 12%, 6 years. It is accurate enough for mental maths and it makes the cost of a low return immediately obvious.',
      },
      {
        q: 'How much does compounding frequency really matter?',
        a: '₹1,00,000 at 10% for a year gives ₹10,000 compounded yearly and about ₹10,516 compounded daily. Real, but tiny. Chasing daily compounding while accepting a lower rate is a bad trade — rate and time dominate everything else.',
      },
      {
        q: 'Does compound interest work against me too?',
        a: 'Yes, and far faster. Credit card debt compounds monthly at 36–48% a year. The same force that builds wealth over decades destroys it over months. If you carry a card balance, clearing it is mathematically the best investment available to you.',
      },
      {
        q: 'What counts as "putting money in"?',
        a: 'Your starting amount plus every monthly top-up across the whole period. Everything above that line is interest — it is the part you earned without working.',
      },
    ],
    related: ['sip-calculator', 'lumpsum-calculator', 'fd-calculator', 'credit-card-payoff-calculator'],
  },

  {
    slug: 'cagr-calculator',
    category: 'Investing',
    h1: 'CAGR Calculator',
    metaTitle: 'CAGR Calculator — Your Real Annual Return, Not the Headline Number',
    metaDescription:
      'Work out the compound annual growth rate between any two values. The honest way to compare investments held for different lengths of time.',
    keywords: ['cagr calculator', 'compound annual growth rate', 'annualised return calculator'],
    formula: 'cagr',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'initial', label: 'Value at the start', type: 'currency', default: 100000, min: 1, max: 100000000, step: 10000 },
      { id: 'final', label: 'Value at the end', type: 'currency', default: 250000, min: 1, max: 1000000000, step: 10000 },
      { id: 'years', label: 'Years held', type: 'years', default: 5, min: 0.5, max: 50, step: 0.5 },
    ],
    outputs: [
      { id: 'cagr', label: 'CAGR', kind: 'percent', hero: true },
      { id: 'absolute', label: 'Total gain', kind: 'percent' },
      { id: 'profit', label: 'Profit', kind: 'currency', accent: true },
    ],
    intro: `"It went up 150%" tells you nothing until you know how long it took. Over three years that's excellent. Over twenty it's poor — worse than a fixed deposit.

CAGR fixes this. It converts any total gain into the smooth annual rate that would have produced it, so you can compare a stock held for 4 years against a fund held for 11 on the same scale. It's the only return figure worth quoting, and the one people quietly avoid when the honest answer is unflattering.`,
    howItWorks: [
      'CAGR = (Ending ÷ Beginning)^(1 ÷ years) − 1. It answers: what constant yearly rate would take me from here to there?',
      'The rate is smoothed by design. A fund that returned +50%, −30%, +40% has a CAGR that hides all that turbulence — useful for comparison, useless as a description of the ride.',
      '"Total gain" is the raw percentage change with no adjustment for time — shown alongside so you can see how differently the same investment reads on the two measures.',
    ],
    faqs: [
      {
        q: 'CAGR or absolute return — which should I use?',
        a: 'CAGR, whenever holding periods differ, which is almost always. Absolute return is only meaningful when you are comparing two things held for exactly the same period.',
      },
      {
        q: 'What is a good CAGR?',
        a: 'Context decides. Beating inflation by a few points is a genuine win. Long-run broad equity indices have historically landed near 10–12% before tax. Anyone promising a guaranteed 30% CAGR is selling something you should walk away from.',
      },
      {
        q: 'Can CAGR be negative?',
        a: 'Yes — if the ending value is lower than the starting value. A negative CAGR is simply the annualised rate at which the investment lost ground.',
      },
      {
        q: 'Why does CAGR not match my actual experience?',
        a: 'Because it assumes one investment at the start and no additions. If you invested in instalments, CAGR overstates or understates what you actually earned — for that case you need XIRR, which weights each cash flow by when it happened.',
      },
    ],
    related: ['lumpsum-calculator', 'compound-interest-calculator', 'inflation-calculator', 'sip-calculator'],
  },

  // ────────────────────────────────────────────────────────── LOANS ──
  {
    slug: 'emi-calculator',
    category: 'Loans',
    h1: 'EMI Calculator',
    metaTitle: 'EMI Calculator — Monthly Payment, Total Interest and Full Schedule',
    metaDescription:
      'Calculate the EMI on any home, car or personal loan. See the monthly payment, the total interest you will pay, and a year-by-year breakdown of principal versus interest.',
    keywords: ['emi calculator', 'loan emi calculator', 'home loan emi', 'car loan calculator'],
    formula: 'emi',
    chart: 'donut',
    table: 'amortization',
    offerTags: ['loans', 'homeloan'],
    inputs: [
      { id: 'principal', label: 'Loan amount', type: 'currency', default: 3000000, min: 10000, max: 100000000, step: 50000 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 9, min: 1, max: 36, step: 0.05 },
      { id: 'years', label: 'Loan tenure', type: 'years', default: 20, min: 1, max: 30, step: 1 },
    ],
    outputs: [
      { id: 'emi', label: 'Monthly EMI', kind: 'currency', hero: true },
      { id: 'interest', label: 'Total interest', kind: 'currency', accent: true },
      { id: 'total', label: 'Total repayment', kind: 'currency' },
    ],
    intro: `Your EMI is fixed, but what it's doing changes every single month. Early on, most of the payment is interest and barely any touches the loan. Late on, it's almost all principal. That imbalance is why a 20-year home loan can cost you more in interest than the amount you borrowed.

Enter your numbers and look at two things: the EMI, and the total interest. Then drop the tenure by five years and look again. The EMI rises a little; the interest falls a lot. That single comparison is worth more than any advice anyone will give you about loans.`,
    howItWorks: [
      'EMI = P × r × (1+r)ⁿ ÷ ((1+r)ⁿ − 1), where P is the loan amount, r the monthly rate, and n the number of months.',
      'Every month, interest is charged on the balance still outstanding. Whatever is left of your EMI after that goes to reducing the loan — which is why the split shifts steadily in your favour.',
      'The schedule below shows exactly what happens each year: how much went to interest, how much cleared the loan, and what you still owe.',
    ],
    faqs: [
      {
        q: 'Should I choose a longer tenure for a lower EMI?',
        a: 'Only if the shorter EMI genuinely does not fit your budget. On a ₹30 lakh loan at 9%, going from 15 years to 25 saves about ₹4,000 a month and costs you roughly ₹14 lakh in extra interest. Take the longest tenure you can safely afford, then prepay aggressively — that gives you the low required payment and the low total cost.',
      },
      {
        q: 'Fixed or floating rate?',
        a: 'Floating is usually cheaper over the life of a long loan and lets you prepay without penalty, which is a right regulators protect for floating-rate retail borrowers. Fixed buys certainty at a price. For a home loan most borrowers are better off floating.',
      },
      {
        q: 'What is a good EMI-to-income ratio?',
        a: 'Keep all EMIs together under 40% of take-home pay, and a home loan alone under 30%. Lenders will happily approve more. Their downside is a recovery process; yours is your life.',
      },
      {
        q: 'Why is my bank\'s EMI slightly different?',
        a: 'Rounding, processing fees folded into the principal, insurance bundled with the loan, or a part-month at the start. The difference should be small — if it is not, ask for the amortisation schedule in writing.',
      },
      {
        q: 'Does paying one extra EMI a year help?',
        a: 'Dramatically. One extra EMI annually on a 20-year loan typically clears it about four years early and saves several lakh in interest. Use the prepayment calculator to see your exact numbers.',
      },
    ],
    related: ['loan-prepayment-calculator', 'rent-vs-buy-calculator', 'credit-card-payoff-calculator', 'compound-interest-calculator'],
  },

  {
    slug: 'loan-prepayment-calculator',
    category: 'Loans',
    h1: 'Loan Prepayment Calculator',
    metaTitle: 'Loan Prepayment Calculator — How Much Interest You Save',
    metaDescription:
      'See exactly how much interest you save and how many years you cut off your loan by paying a little extra each month or a lump sum today.',
    keywords: ['loan prepayment calculator', 'part payment calculator', 'home loan prepayment savings'],
    formula: 'prepayment',
    chart: 'compare',
    offerTags: ['loans', 'homeloan'],
    inputs: [
      { id: 'principal', label: 'Outstanding loan', type: 'currency', default: 3000000, min: 10000, max: 100000000, step: 50000 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 9, min: 1, max: 36, step: 0.05 },
      { id: 'years', label: 'Years remaining', type: 'years', default: 20, min: 1, max: 30, step: 1 },
      { id: 'extraMonthly', label: 'Extra paid each month', type: 'currency', default: 5000, min: 0, max: 500000, step: 1000 },
      { id: 'lumpSum', label: 'One-time lump sum today', type: 'currency', default: 0, min: 0, max: 50000000, step: 25000 },
    ],
    outputs: [
      { id: 'interestSaved', label: 'Interest saved', kind: 'currency', hero: true },
      { id: 'monthsSaved', label: 'Loan ends earlier by', kind: 'duration', accent: true },
      { id: 'newInterest', label: 'Interest you will still pay', kind: 'currency' },
    ],
    intro: `Prepayment is the highest guaranteed return available to an ordinary person. Clearing a 9% loan is a risk-free, tax-free 9% — no fund manager on earth offers that with certainty.

The reason it works so well is that extra money goes straight to principal, skipping the interest queue entirely. Every rupee you prepay early kills all the future interest that rupee would have generated. Put in a modest extra amount and watch what comes off the total — it is usually several times the amount you actually paid.`,
    howItWorks: [
      'The calculator runs your loan twice, month by month: once as scheduled, once with your extra payments applied directly to principal.',
      'Your EMI stays the same. The extra is added on top and reduces the balance faster, so each following month is charged interest on a smaller number.',
      'The difference between the two runs is your saving — in money, and in months of your life not spent making payments.',
    ],
    faqs: [
      {
        q: 'Prepay the loan or invest the money instead?',
        a: 'Compare after-tax numbers. Prepaying a 9% loan is a guaranteed 9%. Equity might return 12% but might return −20% next year. If the loan rate is above roughly 9%, prepaying usually wins on a risk-adjusted basis. Below that, and with a long horizon, investing has the edge. There is no wrong answer — but clear high-interest debt first, always.',
      },
      {
        q: 'When is the best time to prepay?',
        a: 'As early as possible. In the first years almost your entire EMI is interest, so principal barely moves — that is exactly when extra money does the most damage to the loan. The same prepayment in year fifteen saves a fraction of what it saves in year two.',
      },
      {
        q: 'Will my bank charge a prepayment penalty?',
        a: 'On floating-rate home loans to individuals, no — regulators have removed that charge. Fixed-rate loans and some business loans can still carry one, typically 2–4%. Check your sanction letter before you transfer anything.',
      },
      {
        q: 'Should I reduce the EMI or the tenure?',
        a: 'Tenure, almost always. Keeping the EMI and shortening the loan saves far more interest. Reducing the EMI only helps if your monthly cash flow is genuinely under strain.',
      },
    ],
    related: ['emi-calculator', 'credit-card-payoff-calculator', 'rent-vs-buy-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'credit-card-payoff-calculator',
    category: 'Debt',
    h1: 'Credit Card Payoff Calculator',
    metaTitle: 'Credit Card Payoff Calculator — How Long, and What It Really Costs',
    metaDescription:
      'Find out how long your credit card balance takes to clear and how much interest you pay. See what happens when you pay more than the minimum.',
    keywords: ['credit card payoff calculator', 'credit card interest calculator', 'minimum payment trap'],
    formula: 'creditCard',
    chart: 'compare',
    offerTags: ['debt', 'creditcard'],
    inputs: [
      { id: 'balance', label: 'Balance owed', type: 'currency', default: 100000, min: 1000, max: 5000000, step: 5000 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 42, min: 6, max: 60, step: 0.5 },
      { id: 'payment', label: 'You pay each month', type: 'currency', default: 10000, min: 100, max: 1000000, step: 1000 },
    ],
    outputs: [
      { id: 'months', label: 'Time to clear', kind: 'duration', hero: true },
      { id: 'interest', label: 'Interest you pay', kind: 'currency', accent: true },
      { id: 'total', label: 'Total paid', kind: 'currency' },
    ],
    intro: `Credit cards advertise a monthly rate — "just 3.5%" — because the annual figure, 42%, would stop people cold. That is the highest rate almost anyone will ever pay on anything.

The minimum payment is engineered against you. It's set at roughly 5% of the balance, which barely covers the interest, so the debt shrinks at a crawl while the card keeps charging. Enter your real numbers below. Then raise the monthly payment and watch the "time to clear" collapse — the responsiveness is the point. On a card, small increases in payment produce huge reductions in cost.`,
    howItWorks: [
      'Interest is applied to the outstanding balance each month, then your payment is subtracted. Whatever survives carries into the next month and gets charged again.',
      'If your payment does not exceed the monthly interest, the balance never falls. The calculator tells you outright when that happens rather than silently producing nonsense.',
      'The comparison shows your current plan against a faster one, so the cost of taking longer is visible instead of theoretical.',
    ],
    faqs: [
      {
        q: 'What actually happens if I only pay the minimum?',
        a: '₹1,00,000 at 42% with a 5% minimum takes well over a decade to clear and costs more in interest than the original balance. The minimum payment exists to keep the account performing, not to get you out of debt.',
      },
      {
        q: 'Is a balance transfer worth doing?',
        a: 'Often yes. Moving to a 0% or low-rate promotional window redirects your entire payment at the principal. It only works if you clear the balance before the promotional period ends and you stop spending on the old card — otherwise you have refinanced the problem, not solved it.',
      },
      {
        q: 'Should I take a personal loan to clear my card?',
        a: 'A personal loan at 12–16% against a card at 42% is straightforwardly better maths, and the fixed EMI gives you a real end date. The trap is treating the cleared card as available credit again. Convert the debt, then put the card away.',
      },
      {
        q: 'Avalanche or snowball?',
        a: 'Avalanche — highest rate first — costs the least. Snowball — smallest balance first — is easier to stick with because you get visible wins early. The best method is the one you will still be following in six months.',
      },
      {
        q: 'Does carrying a balance improve my credit score?',
        a: 'No. That is a persistent myth. Using your card and paying it in full each month builds a strong score. Carrying a balance just costs you interest and pushes up your utilisation ratio, which hurts the score.',
      },
    ],
    related: ['loan-prepayment-calculator', 'emi-calculator', 'emergency-fund-calculator', 'compound-interest-calculator'],
  },

  // ────────────────────────────────────────────────────── PLANNING ──
  {
    slug: 'goal-sip-calculator',
    category: 'Planning',
    h1: 'Goal SIP Calculator',
    metaTitle: 'Goal SIP Calculator — How Much to Invest Monthly for a Target',
    metaDescription:
      'Name your target and your deadline. This calculator works backwards to the exact monthly investment you need, adjusted for inflation if you want.',
    keywords: ['goal sip calculator', 'target amount sip', 'how much to invest monthly'],
    formula: 'goalSip',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'target', label: 'Amount you need', type: 'currency', default: 5000000, min: 10000, max: 500000000, step: 100000 },
      { id: 'years', label: 'Years to get there', type: 'years', default: 10, min: 1, max: 40, step: 1 },
      { id: 'rate', label: 'Expected return (per year)', type: 'percent', default: 12, min: 1, max: 30, step: 0.5 },
      { id: 'existing', label: 'Already saved', type: 'currency', default: 0, min: 0, max: 500000000, step: 50000 },
    ],
    outputs: [
      { id: 'monthly', label: 'Invest every month', kind: 'currency', hero: true },
      { id: 'invested', label: 'Total you will invest', kind: 'currency' },
      { id: 'returns', label: 'Market covers', kind: 'currency', accent: true },
    ],
    intro: `Most calculators start with what you can spare and tell you where you'll end up. This one runs the other way: you name the number and the deadline, and it tells you what the habit has to be.

That reversal changes the conversation. "Save more" is advice nobody acts on. "₹18,400 a month for eleven years" is an instruction you can either follow or renegotiate — by extending the deadline, lowering the target, or accepting more risk. Anything already saved is counted first, because it keeps compounding while you add to it.`,
    howItWorks: [
      'Your existing savings are grown forward to the deadline first. Whatever gap is left is what the monthly SIP has to close.',
      'The annuity formula is inverted to solve for the payment: P = FV × i ÷ ((1+i)ⁿ − 1) ÷ (1+i).',
      '"Market covers" is the part of your target that compounding contributes rather than you — the longer the runway, the larger that share gets.',
    ],
    faqs: [
      {
        q: 'The monthly number is more than I can afford. Now what?',
        a: 'You have exactly four levers: extend the deadline, cut the target, raise the assumed return by taking more risk, or increase income. Extending the deadline is usually the cheapest and safest — add three years and watch the requirement drop sharply.',
      },
      {
        q: 'Should I adjust the target for inflation?',
        a: 'For anything beyond five years, yes. A goal that costs ₹20 lakh today will cost around ₹36 lakh in ten years at 6% inflation. Run your target through the inflation calculator first, then bring the future figure back here.',
      },
      {
        q: 'What return is safe to assume for a short goal?',
        a: 'For under three years, assume 6–7% and use debt funds or deposits. Equity returns are only dependable over long stretches; a goal you need in eighteen months should not depend on the market cooperating.',
      },
      {
        q: 'Can I raise the SIP each year instead of paying the full amount now?',
        a: 'Yes, and it is often the realistic path. A step-up SIP that starts lower and rises 10% a year reaches most targets while matching how incomes actually grow.',
      },
    ],
    related: ['sip-calculator', 'retirement-calculator', 'inflation-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'retirement-calculator',
    category: 'Planning',
    h1: 'Retirement Calculator',
    metaTitle: 'Retirement Calculator — The Corpus You Need and the SIP to Get There',
    metaDescription:
      'Work out how large a retirement corpus you need to fund your expenses, adjusted for inflation, and the monthly investment required to build it.',
    keywords: ['retirement calculator', 'retirement corpus calculator', 'how much to retire'],
    formula: 'retirement',
    chart: 'growth',
    offerTags: ['investing', 'insurance'],
    inputs: [
      { id: 'currentAge', label: 'Your age now', type: 'number', default: 30, min: 18, max: 70, step: 1 },
      { id: 'retireAge', label: 'Retirement age', type: 'number', default: 60, min: 35, max: 80, step: 1 },
      { id: 'lifeExpectancy', label: 'Plan until age', type: 'number', default: 85, min: 60, max: 100, step: 1 },
      { id: 'monthlyExpense', label: 'Monthly expenses today', type: 'currency', default: 50000, min: 5000, max: 5000000, step: 5000 },
      { id: 'inflation', label: 'Inflation', type: 'percent', default: 6, min: 1, max: 15, step: 0.5 },
      { id: 'preReturn', label: 'Return before retirement', type: 'percent', default: 12, min: 1, max: 25, step: 0.5 },
      { id: 'postReturn', label: 'Return after retirement', type: 'percent', default: 7, min: 1, max: 20, step: 0.5 },
      { id: 'existing', label: 'Already saved for retirement', type: 'currency', default: 0, min: 0, max: 500000000, step: 100000 },
    ],
    outputs: [
      { id: 'corpus', label: 'Corpus needed at retirement', kind: 'currency', hero: true },
      { id: 'monthlySip', label: 'Invest every month from now', kind: 'currency', accent: true },
      { id: 'futureExpense', label: 'Monthly expenses at retirement', kind: 'currency' },
    ],
    intro: `Retirement planning fails on one number that people get wrong by a factor of three: what your current lifestyle will cost decades from now. ₹50,000 a month today is roughly ₹2.9 lakh a month in thirty years at 6% inflation. Plan for today's figure and you run out of money in your seventies.

This calculator handles it properly. It inflates your expenses to your retirement date, works out the corpus needed to fund those expenses for the rest of your life while the remaining balance keeps earning, then tells you the monthly investment required to build it. The corpus number will look alarming. It is supposed to — and it shrinks fast for every year you start earlier.`,
    howItWorks: [
      'Your current monthly expense is inflated forward to your retirement age to find what the same lifestyle will actually cost.',
      'The corpus is calculated as an inflation-adjusted annuity: enough to pay rising expenses for your full retirement while the unspent balance continues earning the post-retirement return.',
      'Anything you have already saved is grown to retirement and subtracted. The rest becomes the monthly SIP you need starting now.',
    ],
    faqs: [
      {
        q: 'Why is the corpus so much bigger than I expected?',
        a: 'Because it funds two or three decades without a salary, against expenses that keep rising the whole time. A 25-year retirement at ₹2.9 lakh a month is a very large number. This is the single most under-planned goal in personal finance.',
      },
      {
        q: 'What about EPF, NPS and gratuity?',
        a: 'They count. Put their expected value at retirement into "already saved" — a rough projection is far better than ignoring them, which will overstate what you still need to invest.',
      },
      {
        q: 'Why use a lower return after retirement?',
        a: 'Because your portfolio should get more conservative as you approach and enter retirement. You cannot ride out a 40% drawdown when you are drawing an income from the same pot. 6–8% post-retirement is a realistic mixed-asset assumption.',
      },
      {
        q: 'What is the 4% rule?',
        a: 'A rule of thumb that says you can withdraw 4% of your corpus in year one and adjust for inflation thereafter, with a good chance of lasting 30 years. It is US-derived; in higher-inflation markets, 3–3.5% is the safer number. This calculator models the cash flows directly rather than relying on the shortcut.',
      },
      {
        q: 'I am starting late. Is it hopeless?',
        a: 'No, but the levers change. Later starts depend more on how much you invest and how long you keep working than on returns. Retiring at 62 instead of 58 does two things at once — four more years of contributions, four fewer years to fund.',
      },
    ],
    related: ['goal-sip-calculator', 'sip-calculator', 'inflation-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'inflation-calculator',
    category: 'Planning',
    h1: 'Inflation Calculator',
    metaTitle: 'Inflation Calculator — What Your Money Will Actually Be Worth',
    metaDescription:
      'See what a sum of money will be worth in the future after inflation, and what a future amount is worth in today\'s terms. The reality check for every long-term plan.',
    keywords: ['inflation calculator', 'future value of money', 'purchasing power calculator'],
    formula: 'inflation',
    chart: 'growth',
    offerTags: ['investing', 'savings'],
    inputs: [
      { id: 'amount', label: 'Amount today', type: 'currency', default: 100000, min: 100, max: 1000000000, step: 10000 },
      { id: 'rate', label: 'Inflation rate', type: 'percent', default: 6, min: 0.5, max: 20, step: 0.25 },
      { id: 'years', label: 'Years from now', type: 'years', default: 20, min: 1, max: 50, step: 1 },
    ],
    outputs: [
      { id: 'futureCost', label: 'Will cost you', kind: 'currency', hero: true },
      { id: 'futureWorth', label: 'Today\'s money will buy', kind: 'currency', accent: true },
      { id: 'lost', label: 'Purchasing power lost', kind: 'percent' },
    ],
    intro: `Inflation is the quiet tax. Nobody sends you a bill, but every year the same money buys a little less, and over decades "a little less" compounds into most of it.

This calculator works in both directions. It tells you what something costing ₹1 lakh today will cost in twenty years, and what ₹1 lakh sitting in a drawer for twenty years will actually be worth when you take it out. The second number is the one that should change your behaviour: money kept in a savings account earning 3% while inflation runs at 6% isn't safe. It is losing 3% a year with total reliability.`,
    howItWorks: [
      'Future cost = Amount × (1 + inflation)^years — the same compounding that grows investments, working against you.',
      'Today\'s buying power = Amount ÷ (1 + inflation)^years — what a future sum is really worth in money you understand.',
      'The gap between them is why "beating inflation" is the actual minimum bar for any investment, not an ambitious target.',
    ],
    faqs: [
      {
        q: 'What inflation rate should I use?',
        a: 'India\'s long-run consumer inflation has averaged roughly 5–6%. But your personal rate depends on what you buy — education and healthcare have run closer to 8–10% for years. If you are planning school fees or medical costs, use the higher figure.',
      },
      {
        q: 'Does this mean savings accounts are pointless?',
        a: 'Not pointless — just the wrong tool for long-term money. A savings account is for your emergency fund and near-term spending, where instant access matters more than returns. Money you will not need for five years should not be sitting there.',
      },
      {
        q: 'What is a real return?',
        a: 'Your return minus inflation. Earning 7% while inflation runs at 6% is a 1% real return — you are barely staying still. Real return is the only figure that tells you whether you are actually getting wealthier.',
      },
      {
        q: 'How do I plan a goal that is 15 years away?',
        a: 'Take today\'s cost, run it through this calculator to get the future cost, then use that inflated figure as your target in the goal SIP calculator. Skipping this step is the most common reason long-term plans fall short.',
      },
    ],
    related: ['retirement-calculator', 'goal-sip-calculator', 'compound-interest-calculator', 'fd-calculator'],
  },

  {
    slug: 'emergency-fund-calculator',
    category: 'Planning',
    h1: 'Emergency Fund Calculator',
    metaTitle: 'Emergency Fund Calculator — How Much Cash You Should Keep',
    metaDescription:
      'Work out the right emergency fund for your situation based on real monthly commitments, job stability and dependants — and how long it takes to build.',
    keywords: ['emergency fund calculator', 'how much emergency fund', 'contingency fund'],
    formula: 'emergencyFund',
    chart: 'donut',
    offerTags: ['savings', 'insurance'],
    inputs: [
      { id: 'expenses', label: 'Essential monthly expenses', type: 'currency', default: 40000, min: 5000, max: 2000000, step: 2500 },
      { id: 'emis', label: 'Monthly EMIs', type: 'currency', default: 15000, min: 0, max: 2000000, step: 2500 },
      {
        id: 'stability',
        label: 'Income stability',
        type: 'select',
        default: 6,
        options: [
          { value: 4, label: 'Very stable — government or tenured' },
          { value: 6, label: 'Stable — salaried, in-demand skills' },
          { value: 9, label: 'Variable — commission, contract, startup' },
          { value: 12, label: 'Unpredictable — freelance, business, single income' },
        ],
      },
      { id: 'currentSaved', label: 'Already set aside', type: 'currency', default: 50000, min: 0, max: 50000000, step: 10000 },
      { id: 'monthlySaving', label: 'Can save each month', type: 'currency', default: 15000, min: 500, max: 1000000, step: 2500 },
    ],
    outputs: [
      { id: 'target', label: 'Your emergency fund target', kind: 'currency', hero: true },
      { id: 'gap', label: 'Still to save', kind: 'currency', accent: true },
      { id: 'monthsToBuild', label: 'Time to fully funded', kind: 'duration' },
    ],
    intro: `An emergency fund is not an investment. It is the thing that stops an emergency from becoming a 42% credit card balance or a broken SIP. It has one job — being available instantly, in full, on the worst day of your year.

The usual advice, "keep six months of expenses", is too blunt. A government employee with no dependants and a freelancer supporting a family need very different buffers. This calculator sizes yours from what you actually must pay each month — essentials plus EMIs, because EMIs do not pause when income does — scaled by how reliable your income really is.`,
    howItWorks: [
      'Your monthly commitment is essential expenses plus EMIs. Discretionary spending is excluded — in a real emergency it stops.',
      'That figure is multiplied by the number of months your income stability warrants, from 4 for the most secure to 12 for the least.',
      'Existing savings are subtracted, and the gap is divided by what you can save monthly to give a realistic completion date.',
    ],
    faqs: [
      {
        q: 'Where should the money actually sit?',
        a: 'Split it. Keep one month in a plain savings account for instant access, and the rest in a liquid fund or a sweep-in FD earning a bit more with same-day or next-day withdrawal. Never in equity, never locked in.',
      },
      {
        q: 'Should I build this before investing?',
        a: 'Build at least three months of cover first, then run both together. Investing with no buffer means the first unexpected expense forces you to sell at whatever price the market offers that day — usually a bad one.',
      },
      {
        q: 'What actually counts as an emergency?',
        a: 'Job loss, a medical event, an urgent home or vehicle repair, an unavoidable family crisis. Not a holiday, not a sale, not a phone upgrade. If you can see it coming, it is a planned expense and belongs in a separate savings goal.',
      },
      {
        q: 'Should EMIs really be included?',
        a: 'Yes, and this is where most people under-save. Your lender does not care that you lost your job. Missed EMIs damage your credit score for years and can trigger recovery action — they are the least flexible payment you have.',
      },
      {
        q: 'I used some of it. What now?',
        a: 'Refill it before resuming any other goal. Treat it as the first bill you pay each month until it is whole again. It did exactly what it was built to do — the system worked.',
      },
    ],
    related: ['credit-card-payoff-calculator', 'fd-calculator', 'retirement-calculator', 'freelance-rate-calculator'],
  },

  // ─────────────────────────────────────────────────────── SAVINGS ──
  {
    slug: 'fd-calculator',
    category: 'Savings',
    h1: 'FD Calculator',
    metaTitle: 'FD Calculator — Fixed Deposit Maturity Value and Interest',
    metaDescription:
      'Calculate the maturity amount and interest on a fixed deposit at any rate, tenure and compounding frequency. Includes the real return after inflation.',
    keywords: ['fd calculator', 'fixed deposit calculator', 'fd maturity calculator', 'fd interest'],
    formula: 'fd',
    chart: 'donut',
    offerTags: ['savings', 'banking'],
    inputs: [
      { id: 'principal', label: 'Deposit amount', type: 'currency', default: 500000, min: 1000, max: 100000000, step: 25000 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 7, min: 1, max: 15, step: 0.05 },
      { id: 'years', label: 'Tenure', type: 'years', default: 5, min: 0.25, max: 20, step: 0.25 },
      {
        id: 'frequency',
        label: 'Compounded',
        type: 'select',
        default: 4,
        options: [
          { value: 1, label: 'Yearly' },
          { value: 2, label: 'Half-yearly' },
          { value: 4, label: 'Quarterly (most banks)' },
          { value: 12, label: 'Monthly' },
        ],
      },
      { id: 'inflation', label: 'Inflation (for real return)', type: 'percent', default: 6, min: 0, max: 20, step: 0.5 },
    ],
    outputs: [
      { id: 'maturity', label: 'Maturity amount', kind: 'currency', hero: true },
      { id: 'interest', label: 'Interest earned', kind: 'currency', accent: true },
      { id: 'realValue', label: 'Worth in today\'s money', kind: 'currency' },
    ],
    intro: `A fixed deposit does one thing well: it returns your money with a known amount of interest on a known date. No surprises. For an emergency fund or money you need in two years, that certainty is worth more than a higher expected return.

What FDs do badly is grow wealth. This calculator shows you both sides — the maturity amount your bank advertises, and what that amount is actually worth after inflation has taken its share. When the FD rate is 7% and inflation is 6%, the honest real return is about 1%, and that is before tax. Useful to know before locking money away for five years.`,
    howItWorks: [
      'Maturity = P × (1 + r/n)^(n×t), with n set by your bank\'s compounding frequency — quarterly for most Indian banks.',
      'Interest earned is simply maturity minus your deposit.',
      '"Worth in today\'s money" discounts the maturity amount by inflation over the same period, showing the real purchasing power you end up with.',
    ],
    faqs: [
      {
        q: 'Is FD interest taxable?',
        a: 'Yes. It is added to your income and taxed at your slab rate, and banks deduct TDS once interest crosses the annual threshold. That makes the after-tax return meaningfully lower than the headline rate, especially in higher slabs.',
      },
      {
        q: 'What happens if I break an FD early?',
        a: 'You get a reduced rate — usually the rate applicable for the period actually completed, minus a penalty of around 0.5–1%. Splitting a large deposit into several smaller FDs avoids this: you break only the one you need.',
      },
      {
        q: 'FD or debt mutual fund?',
        a: 'FDs give certainty and deposit insurance up to ₹5 lakh per bank. Debt funds often yield a little more and let you withdraw any day without penalty, but the value can move. For an emergency fund, an FD or liquid fund is the right call.',
      },
      {
        q: 'Do senior citizens get better rates?',
        a: 'Yes, typically 0.25–0.75% above the standard rate at most banks, and small finance banks often offer more. If a parent qualifies, it is worth comparing before you commit.',
      },
    ],
    related: ['compound-interest-calculator', 'inflation-calculator', 'emergency-fund-calculator', 'lumpsum-calculator'],
  },

  // ───────────────────────────────────────────────────────── OTHER ──
  {
    slug: 'rent-vs-buy-calculator',
    category: 'Property',
    h1: 'Rent vs Buy Calculator',
    metaTitle: 'Rent vs Buy Calculator — Which One Actually Leaves You Richer',
    metaDescription:
      'Compare renting and investing the difference against buying with a home loan. Accounts for interest, maintenance, appreciation and rent increases.',
    keywords: ['rent vs buy calculator', 'should i buy a house', 'renting vs buying'],
    formula: 'rentVsBuy',
    chart: 'compare',
    offerTags: ['homeloan', 'loans', 'investing'],
    inputs: [
      { id: 'homePrice', label: 'Property price', type: 'currency', default: 8000000, min: 500000, max: 200000000, step: 250000 },
      { id: 'downPayment', label: 'Down payment', type: 'currency', default: 1600000, min: 0, max: 100000000, step: 100000 },
      { id: 'loanRate', label: 'Home loan rate', type: 'percent', default: 9, min: 1, max: 20, step: 0.05 },
      { id: 'loanYears', label: 'Loan tenure', type: 'years', default: 20, min: 5, max: 30, step: 1 },
      { id: 'monthlyRent', label: 'Monthly rent for a similar place', type: 'currency', default: 25000, min: 1000, max: 2000000, step: 1000 },
      { id: 'rentIncrease', label: 'Rent rises per year', type: 'percent', default: 7, min: 0, max: 20, step: 0.5 },
      { id: 'appreciation', label: 'Property appreciates per year', type: 'percent', default: 6, min: 0, max: 20, step: 0.5 },
      { id: 'investReturn', label: 'Return if you invest instead', type: 'percent', default: 12, min: 1, max: 25, step: 0.5 },
      { id: 'horizon', label: 'Compare over', type: 'years', default: 10, min: 1, max: 30, step: 1 },
    ],
    outputs: [
      { id: 'verdict', label: 'Better option', kind: 'text', hero: true },
      { id: 'buyNetWorth', label: 'Net worth if you buy', kind: 'currency' },
      { id: 'rentNetWorth', label: 'Net worth if you rent + invest', kind: 'currency', accent: true },
    ],
    intro: `"Rent is money down the drain" is the most expensive piece of folk wisdom in personal finance. In the early years of a home loan, most of your EMI is interest — which is also money down the drain, usually a larger amount than the rent would have been.

The honest comparison is not rent versus EMI. It is: where does each path leave your net worth after N years? Buying gives you an appreciating asset minus the loan and everything spent on interest, taxes and maintenance. Renting gives you a portfolio built from the down payment plus every month the rent came in below the true cost of owning. This calculator runs both, month by month, and tells you which one wins on your numbers.`,
    howItWorks: [
      'The buying path tracks property value appreciating, loan balance falling, and the running cost of interest, maintenance and property tax — roughly 1.5% of value per year.',
      'The renting path invests the down payment immediately, then invests the monthly difference whenever ownership costs more than rent. Rent rises each year at the rate you set.',
      'The verdict compares final net worth: property value minus outstanding loan on one side, portfolio value on the other.',
    ],
    faqs: [
      {
        q: 'Why does renting often win over shorter periods?',
        a: 'Because buying front-loads its costs — stamp duty, registration, brokerage and years of interest-heavy EMIs — while appreciation compounds slowly. Under roughly seven years, renting usually wins on the numbers. Beyond ten, buying pulls ahead as the loan shrinks and the asset grows.',
      },
      {
        q: 'Does this include stamp duty and registration?',
        a: 'Not separately — they are one-off costs of 6–8% of the property price in most Indian states. Fold them into the price, or treat the buying result as slightly optimistic.',
      },
      {
        q: 'What about the security of owning?',
        a: 'Real, and not in the model. Owning means no landlord, no forced relocation, and a place you can modify. Those are worth paying for — this calculator just tells you how much you are paying, so it is a choice rather than an assumption.',
      },
      {
        q: 'The result flips when I change appreciation. Which figure is right?',
        a: 'That sensitivity is the honest answer: the outcome hinges on a number nobody can predict. Run it at 4%, 6% and 8% and see whether your decision changes. If buying only wins at 10% appreciation, you are betting, not planning.',
      },
      {
        q: 'Does renting mean I am wasting money?',
        a: 'Only if you spend the difference. Renting wins in the model because the money not spent on ownership goes into the market. Rent cheaply and spend the surplus, and buying would have been better — a forced-savings mechanism beats an unused one.',
      },
    ],
    related: ['emi-calculator', 'loan-prepayment-calculator', 'sip-calculator', 'inflation-calculator'],
  },

  {
    slug: 'freelance-rate-calculator',
    category: 'Income',
    h1: 'Freelance Rate Calculator',
    metaTitle: 'Freelance Rate Calculator — What to Charge Per Hour and Per Day',
    metaDescription:
      'Work out the hourly rate you need to charge as a freelancer once you account for unpaid time, holidays, expenses, tax and the benefits you no longer get.',
    keywords: ['freelance rate calculator', 'hourly rate calculator', 'what should i charge freelance', 'consultant rate'],
    formula: 'freelanceRate',
    chart: 'donut',
    offerTags: ['freelance', 'business'],
    inputs: [
      { id: 'targetIncome', label: 'Income you want (per year)', type: 'currency', default: 1500000, min: 100000, max: 100000000, step: 100000 },
      { id: 'expenses', label: 'Business expenses (per year)', type: 'currency', default: 150000, min: 0, max: 50000000, step: 25000 },
      { id: 'taxRate', label: 'Effective tax rate', type: 'percent', default: 20, min: 0, max: 50, step: 1 },
      { id: 'weeksOff', label: 'Weeks off per year', type: 'number', default: 6, min: 0, max: 30, step: 1 },
      { id: 'hoursPerWeek', label: 'Working hours per week', type: 'number', default: 40, min: 5, max: 80, step: 1 },
      { id: 'billablePercent', label: 'Share of time that is billable', type: 'percent', default: 60, min: 10, max: 100, step: 5 },
    ],
    outputs: [
      { id: 'hourlyRate', label: 'Charge per hour', kind: 'currency', hero: true },
      { id: 'dayRate', label: 'Day rate', kind: 'currency', accent: true },
      { id: 'billableHours', label: 'Billable hours a year', kind: 'number' },
    ],
    intro: `The classic freelance mistake is dividing a target salary by 2,080 hours and quoting that. It bankrupts people slowly, because it assumes every working hour is billable, that you never take leave, that you have no expenses, and that nobody is deducting tax.

Reality: most freelancers bill 50–65% of their time. The rest is pitching, invoicing, revisions, admin and the work you do to win the next project. That unbillable time still has to be paid for — by the billable hours. This calculator starts from what you actually want to keep, adds back tax and expenses, then divides by the hours you can genuinely sell. The number is usually higher than people expect. That is the point.`,
    howItWorks: [
      'Your target take-home is grossed up for tax, then business expenses are added, giving the revenue you must actually invoice.',
      'Billable hours are computed from working weeks (52 minus your leave) × hours per week × your billable share.',
      'Revenue needed ÷ billable hours = your true hourly rate. The day rate assumes eight billable hours.',
    ],
    faqs: [
      {
        q: 'My rate looks too high to be competitive. Is it wrong?',
        a: 'Probably not — it is what the maths requires. A ₹15 lakh take-home target is not a ₹720/hour job; it is closer to ₹1,800/hour once tax, expenses and unbillable time are honest. If the market will not pay it, the fix is a narrower specialisation or fixed-price work, not undercharging.',
      },
      {
        q: 'Should I charge hourly or per project?',
        a: 'Per project, wherever you can. Hourly caps your income at hours available and quietly punishes you for getting faster. Use this hourly figure as your internal floor for pricing a project, not as the number on the invoice.',
      },
      {
        q: 'What billable percentage is realistic?',
        a: 'Starting out, 40–50% while you are building a pipeline. Established with repeat clients, 60–70%. Above 75% is rare and usually means you are neglecting business development — which shows up as a gap three months later.',
      },
      {
        q: 'What should I count as a business expense?',
        a: 'Software, hardware, internet, coworking or a home-office share, professional insurance, accounting fees, courses, and your own health insurance — the thing employment used to cover. Freelancers routinely forget that last one.',
      },
      {
        q: 'How do I raise rates with existing clients?',
        a: 'Give notice — 30 to 60 days — apply it to new work rather than work in progress, and state it as a fact rather than a request. Losing your lowest-paying client to a rate rise is usually a net gain in both money and time.',
      },
    ],
    related: ['emergency-fund-calculator', 'goal-sip-calculator', 'sip-calculator', 'credit-card-payoff-calculator'],
  },

  // ═══════════════════════════════════════════════ NEW CALCULATORS ══
  {
    slug: 'rd-calculator',
    category: 'Savings',
    h1: 'RD Calculator',
    metaTitle: 'RD Calculator — Recurring Deposit Maturity and Interest',
    metaDescription:
      'Calculate the maturity value and interest on a recurring deposit. Enter your monthly deposit, interest rate and tenure to see what your RD grows into.',
    keywords: ['rd calculator', 'recurring deposit calculator', 'rd maturity calculator', 'rd interest'],
    formula: 'rd',
    chart: 'growth',
    offerTags: ['savings', 'banking'],
    inputs: [
      { id: 'monthly', label: 'Monthly deposit', type: 'currency', default: 5000, min: 500, max: 100000, step: 500 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 7, min: 1, max: 12, step: 0.1 },
      { id: 'years', label: 'Tenure', type: 'years', default: 5, min: 1, max: 20, step: 1 },
    ],
    outputs: [
      { id: 'maturity', label: 'Maturity value', kind: 'currency', hero: true },
      { id: 'invested', label: 'You deposited', kind: 'currency' },
      { id: 'interest', label: 'Interest earned', kind: 'currency', accent: true },
    ],
    intro: `A recurring deposit is a fixed deposit you build one month at a time: the same amount leaves your account every month for a set tenure, each instalment earning interest until maturity. It suits money you can spare monthly but want protected from market swings.

Because your early instalments compound for longer than your later ones, the interest is more than "rate × total deposited". This calculator uses quarterly compounding — the norm at Indian banks — to show the maturity value and exactly how much of it is interest.`,
    howItWorks: [
      'Each monthly deposit compounds from the month you pay it until maturity, so earlier instalments earn more.',
      'Interest is compounded quarterly, converted to an effective monthly rate to value the stream of deposits accurately.',
      '"Interest earned" is the maturity value minus everything you deposited.',
    ],
    faqs: [
      {
        q: 'RD or SIP — which should I pick?',
        a: 'An RD gives a guaranteed, known maturity value; a SIP in equity has higher expected returns but can fall in any given year. For money you need within 2–3 years, an RD or debt fund is safer. For long-term wealth, a SIP usually wins.',
      },
      {
        q: 'Is RD interest taxable?',
        a: 'Yes — RD interest is added to your income and taxed at your slab rate, and banks deduct TDS once it crosses the annual threshold. The after-tax return is lower than the headline rate.',
      },
      {
        q: 'Can I miss an RD instalment?',
        a: 'Banks allow it with a small penalty, but repeated misses can lead to the RD being closed early at a reduced rate. Automate the transfer so it never depends on you remembering.',
      },
    ],
    related: ['fd-calculator', 'sip-calculator', 'compound-interest-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'swp-calculator',
    category: 'Planning',
    h1: 'SWP Calculator',
    metaTitle: 'SWP Calculator — How Long Your Corpus Lasts With Monthly Withdrawals',
    metaDescription:
      'Systematic Withdrawal Plan calculator. See how long an investment corpus lasts when you withdraw a fixed amount every month while the balance keeps earning.',
    keywords: ['swp calculator', 'systematic withdrawal plan', 'retirement withdrawal calculator', 'how long will my money last'],
    formula: 'swp',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'corpus', label: 'Starting corpus', type: 'currency', default: 5000000, min: 100000, max: 500000000, step: 100000 },
      { id: 'withdrawal', label: 'Withdraw every month', type: 'currency', default: 30000, min: 1000, max: 5000000, step: 1000 },
      { id: 'rate', label: 'Return on remaining balance', type: 'percent', default: 8, min: 1, max: 20, step: 0.5 },
      { id: 'years', label: 'Plan over', type: 'years', default: 25, min: 1, max: 40, step: 1 },
    ],
    outputs: [
      { id: 'finalBalance', label: 'Balance at the end', kind: 'currency', hero: true },
      { id: 'totalWithdrawn', label: 'Total withdrawn', kind: 'currency' },
      { id: 'monthsLasted', label: 'Corpus lasts', kind: 'duration', accent: true },
    ],
    intro: `A Systematic Withdrawal Plan is the reverse of a SIP: instead of adding a fixed amount each month, you take one out, while the balance you haven't touched keeps earning. It's how a retirement corpus turns into a monthly income.

The question that matters is whether the corpus outlives you or you outlive it. This calculator runs the numbers month by month — growing the balance at your assumed return, subtracting each withdrawal — and tells you how long it lasts.`,
    howItWorks: [
      'Each month the balance earns one month of return, then your withdrawal is taken out.',
      'If withdrawals plus the shrinking balance can no longer cover a full withdrawal, the calculator reports the month it runs dry.',
      'A withdrawal below the monthly return means the corpus grows instead of depleting — the ideal, sustainable case.',
    ],
    faqs: [
      {
        q: 'What withdrawal rate is safe?',
        a: 'A common rule of thumb is 4% of the corpus per year, adjusted for inflation. In higher-inflation markets, 3–3.5% is safer. Keep the annual withdrawal below your expected return and the corpus can last indefinitely.',
      },
      {
        q: 'Does this account for inflation?',
        a: 'It assumes a fixed monthly withdrawal. In reality your expenses rise, so a corpus that lasts on today\'s withdrawal may fall short later — plan for a withdrawal that can grow, or a larger buffer.',
      },
    ],
    related: ['retirement-calculator', 'sip-calculator', 'inflation-calculator', 'goal-sip-calculator'],
  },

  {
    slug: 'step-up-sip-calculator',
    category: 'Investing',
    h1: 'Step-up SIP Calculator',
    metaTitle: 'Step-up SIP Calculator — Raise Your SIP Every Year',
    metaDescription:
      'See how much more you build by increasing your SIP a fixed percentage every year. A step-up SIP grows with your income and often beats chasing higher returns.',
    keywords: ['step up sip calculator', 'top up sip calculator', 'increasing sip calculator'],
    formula: 'stepUpSip',
    chart: 'growth',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'monthly', label: 'Starting monthly investment', type: 'currency', default: 10000, min: 500, max: 500000, step: 500 },
      { id: 'rate', label: 'Expected return (per year)', type: 'percent', default: 12, min: 1, max: 30, step: 0.5 },
      { id: 'years', label: 'Time period', type: 'years', default: 15, min: 1, max: 40, step: 1 },
      { id: 'stepUp', label: 'Increase SIP each year', type: 'percent', default: 10, min: 0, max: 25, step: 1 },
    ],
    outputs: [
      { id: 'total', label: 'Maturity value', kind: 'currency', hero: true },
      { id: 'invested', label: 'You invested', kind: 'currency' },
      { id: 'returns', label: 'Market added', kind: 'currency', accent: true },
    ],
    intro: `A step-up SIP raises your monthly investment by a fixed percentage every year — usually in line with your salary. It's the single highest-leverage change most investors can make, because it puts more money to work exactly as your capacity to invest grows.

Increasing a SIP 10% a year often does more for your final corpus than squeezing out a 2% better return, and it costs you nothing today. Compare this against a flat SIP and the gap over 15–20 years is striking.`,
    howItWorks: [
      'Your SIP runs for a year at the current amount, then steps up by your chosen percentage for the next year.',
      'Every instalment compounds at the expected monthly return from the month it is invested.',
      '"Market added" is the maturity value minus everything you contributed across all the rising instalments.',
    ],
    faqs: [
      {
        q: 'Is a step-up SIP better than a regular SIP?',
        a: 'For the same starting amount, yes — you invest more over time, so you end with more. The honest comparison is against a flat SIP set at a higher amount; a step-up matches how incomes actually grow, which makes it easier to sustain.',
      },
      {
        q: 'What step-up percentage should I use?',
        a: 'Tie it to your expected annual salary growth — 8–10% is realistic for most. The point is that the increase should feel automatic and painless, not a stretch.',
      },
    ],
    related: ['sip-calculator', 'goal-sip-calculator', 'retirement-calculator', 'compound-interest-calculator'],
  },

  {
    slug: 'simple-interest-calculator',
    category: 'Savings',
    h1: 'Simple Interest Calculator',
    metaTitle: 'Simple Interest Calculator — Interest and Total Repayment',
    metaDescription:
      'Calculate simple interest on any principal, rate and time period. See the interest and the total, and how it differs from compound interest.',
    keywords: ['simple interest calculator', 'si calculator', 'interest calculator'],
    formula: 'simpleInterest',
    chart: 'growth',
    offerTags: ['savings', 'banking'],
    inputs: [
      { id: 'principal', label: 'Principal', type: 'currency', default: 100000, min: 1000, max: 100000000, step: 5000 },
      { id: 'rate', label: 'Interest rate (per year)', type: 'percent', default: 8, min: 0.5, max: 24, step: 0.25 },
      { id: 'years', label: 'Time period', type: 'years', default: 5, min: 1, max: 30, step: 1 },
    ],
    outputs: [
      { id: 'total', label: 'Total amount', kind: 'currency', hero: true },
      { id: 'interest', label: 'Interest', kind: 'currency', accent: true },
      { id: 'principal', label: 'Principal', kind: 'currency' },
    ],
    intro: `Simple interest is charged only on the original principal — never on interest already earned. It's the maths behind many short-term loans, some deposits and most mental-arithmetic estimates.

The formula is deliberately plain: interest = principal × rate × time ÷ 100. Useful to know exactly, and useful as a baseline for seeing how much extra compound interest adds over the same period.`,
    howItWorks: [
      'Interest = Principal × Rate × Time ÷ 100 — a straight line, the same amount added every year.',
      'The total is simply principal plus interest.',
      'The chart is a straight ramp, unlike compound interest which curves upward as interest earns interest.',
    ],
    faqs: [
      {
        q: 'Simple or compound interest — which is better for me?',
        a: 'As a saver, you want compound. As a borrower, simple interest costs you less because it never charges interest on interest. Always check which one applies before you sign.',
      },
      {
        q: 'When is simple interest actually used?',
        a: 'Many car and personal loans, some government schemes, and short bridging loans. Longer-term deposits and credit cards almost always compound.',
      },
    ],
    related: ['compound-interest-calculator', 'fd-calculator', 'emi-calculator', 'inflation-calculator'],
  },

  {
    slug: 'roi-calculator',
    category: 'Investing',
    h1: 'ROI Calculator',
    metaTitle: 'ROI Calculator — Return on Investment, Total and Annualised',
    metaDescription:
      'Work out your return on investment as both a total percentage and an annualised rate, so you can compare investments held for different lengths of time.',
    keywords: ['roi calculator', 'return on investment calculator', 'annualised return calculator'],
    formula: 'roi',
    chart: 'compare',
    offerTags: ['investing', 'business'],
    inputs: [
      { id: 'invested', label: 'Amount invested', type: 'currency', default: 100000, min: 1000, max: 100000000, step: 10000 },
      { id: 'returned', label: 'Amount returned', type: 'currency', default: 150000, min: 0, max: 1000000000, step: 10000 },
      { id: 'years', label: 'Years held', type: 'years', default: 3, min: 1, max: 40, step: 1 },
    ],
    outputs: [
      { id: 'roi', label: 'Total ROI', kind: 'percent', hero: true },
      { id: 'annualised', label: 'Annualised (CAGR)', kind: 'percent', accent: true },
      { id: 'profit', label: 'Profit', kind: 'currency' },
    ],
    intro: `Return on investment tells you what you made relative to what you put in. But a raw ROI figure hides time: 50% over two years is excellent; 50% over fifteen is poor.

This calculator shows both — the total ROI, and the annualised rate that lets you compare it fairly against any other investment held for a different period.`,
    howItWorks: [
      'Total ROI = (returned − invested) ÷ invested × 100.',
      'Annualised return smooths that total into a per-year rate: (returned ÷ invested)^(1 ÷ years) − 1.',
      'For anything held longer than a year, the annualised figure is the honest one to quote.',
    ],
    faqs: [
      {
        q: 'ROI or annualised return — which matters more?',
        a: 'Annualised, whenever holding periods differ. Total ROI only compares fairly between two things held for exactly the same time.',
      },
      {
        q: 'Can ROI be negative?',
        a: 'Yes — if you got back less than you put in. Both the total and annualised figures then show the rate of loss.',
      },
    ],
    related: ['cagr-calculator', 'lumpsum-calculator', 'sip-calculator', 'inflation-calculator'],
  },

  {
    slug: 'net-worth-calculator',
    category: 'Planning',
    h1: 'Net Worth Calculator',
    metaTitle: 'Net Worth Calculator — What You Own Minus What You Owe',
    metaDescription:
      'Add up your assets and subtract your debts to find your net worth. The single number that tracks whether you are actually getting wealthier.',
    keywords: ['net worth calculator', 'net worth', 'assets minus liabilities calculator'],
    formula: 'netWorth',
    chart: 'donut',
    offerTags: ['investing', 'savings'],
    inputs: [
      { id: 'cash', label: 'Cash & bank balances', type: 'currency', default: 200000, min: 0, max: 100000000, step: 10000 },
      { id: 'investments', label: 'Investments (stocks, funds, PF)', type: 'currency', default: 1000000, min: 0, max: 1000000000, step: 10000 },
      { id: 'property', label: 'Property & real estate', type: 'currency', default: 5000000, min: 0, max: 1000000000, step: 50000 },
      { id: 'otherAssets', label: 'Other assets (gold, vehicles)', type: 'currency', default: 200000, min: 0, max: 100000000, step: 10000 },
      { id: 'loans', label: 'Loans outstanding', type: 'currency', default: 2000000, min: 0, max: 500000000, step: 50000 },
      { id: 'cardDebt', label: 'Credit card & other debt', type: 'currency', default: 50000, min: 0, max: 5000000, step: 5000 },
    ],
    outputs: [
      { id: 'net', label: 'Net worth', kind: 'currency', hero: true },
      { id: 'assets', label: 'Total assets', kind: 'currency' },
      { id: 'liabilities', label: 'Total liabilities', kind: 'currency', accent: true },
    ],
    intro: `Net worth is the one number that cuts through everything: what you own minus what you owe. Income tells you what flows in; net worth tells you what's actually accumulating.

Tracked once or twice a year, it's the clearest signal of financial progress — a rising net worth means you're building, regardless of what any single account is doing.`,
    howItWorks: [
      'Assets are everything you own that has value — cash, investments, property, gold, vehicles.',
      'Liabilities are everything you owe — home loan, car loan, credit card and other debt.',
      'Net worth is assets minus liabilities. The donut shows how your assets are distributed.',
    ],
    faqs: [
      {
        q: 'Should I include my home?',
        a: 'Include its current market value as an asset and the outstanding loan as a liability. The net (equity) is what actually belongs to you.',
      },
      {
        q: 'My net worth is negative. Is that bad?',
        a: 'Common early in life with student or home loans, and not a crisis by itself. Track the trend — as long as it climbs over time, you are moving the right way. Clearing high-interest debt is the fastest lever.',
      },
    ],
    related: ['emergency-fund-calculator', 'retirement-calculator', 'credit-card-payoff-calculator', 'savings-rate-calculator'],
  },

  {
    slug: 'home-affordability-calculator',
    category: 'Property',
    h1: 'Home Affordability Calculator',
    metaTitle: 'Home Affordability Calculator — How Much House You Can Afford',
    metaDescription:
      'Find the home price you can realistically afford based on your income, existing EMIs, loan rate, tenure and down payment — without overstretching.',
    keywords: ['home affordability calculator', 'how much house can i afford', 'home loan eligibility calculator'],
    formula: 'homeAffordability',
    chart: 'donut',
    offerTags: ['homeloan', 'loans'],
    inputs: [
      { id: 'income', label: 'Annual income', type: 'currency', default: 1800000, min: 100000, max: 100000000, step: 50000 },
      { id: 'otherEmis', label: 'Existing monthly EMIs', type: 'currency', default: 10000, min: 0, max: 2000000, step: 1000 },
      { id: 'rate', label: 'Home loan rate', type: 'percent', default: 9, min: 1, max: 20, step: 0.05 },
      { id: 'years', label: 'Loan tenure', type: 'years', default: 20, min: 5, max: 30, step: 1 },
      { id: 'downPayment', label: 'Down payment you have', type: 'currency', default: 1500000, min: 0, max: 100000000, step: 50000 },
    ],
    outputs: [
      { id: 'budget', label: 'Home budget', kind: 'currency', hero: true },
      { id: 'loan', label: 'Loan you can service', kind: 'currency' },
      { id: 'emi', label: 'Comfortable EMI', kind: 'currency', accent: true },
    ],
    intro: `Lenders will approve the biggest loan your income technically supports. That is not the same as the loan you can comfortably live with — the gap between the two is where housing stress comes from.

This calculator works from a safer rule: keep all your EMIs together within about half your monthly income. It backs out the loan that fits, adds your down payment, and gives you a realistic home budget.`,
    howItWorks: [
      'Total EMIs are capped at ~50% of monthly income; your existing EMIs are subtracted to find what a home loan can use.',
      'That comfortable EMI is converted into a loan amount at your rate and tenure using the EMI formula in reverse.',
      'Your budget is that loan plus the down payment you already have.',
    ],
    faqs: [
      {
        q: 'Why 50% and not what the bank offers?',
        a: 'Banks often approve EMIs up to 55–60% of income. That leaves little room for the rest of life or any shock. Staying near 40–50% keeps the loan safe when income dips or rates rise.',
      },
      {
        q: 'Does this include registration and stamp duty?',
        a: 'No — budget another 6–8% of the property price for stamp duty, registration and brokerage. Treat the figure here as the property price you can target, with those costs on top.',
      },
    ],
    related: ['emi-calculator', 'rent-vs-buy-calculator', 'loan-prepayment-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'savings-rate-calculator',
    category: 'Planning',
    h1: 'Savings Rate & FIRE Calculator',
    metaTitle: 'Savings Rate Calculator — Your Rate and Years to Financial Independence',
    metaDescription:
      'Find your savings rate and how many years it takes to reach financial independence (25× your annual expenses) at your current pace.',
    keywords: ['savings rate calculator', 'fire calculator', 'financial independence calculator', 'years to retire'],
    formula: 'savingsRateFire',
    chart: 'donut',
    offerTags: ['investing', 'savings'],
    inputs: [
      { id: 'income', label: 'Monthly take-home income', type: 'currency', default: 120000, min: 10000, max: 10000000, step: 5000 },
      { id: 'expenses', label: 'Monthly expenses', type: 'currency', default: 60000, min: 5000, max: 10000000, step: 2500 },
      { id: 'currentSavings', label: 'Already invested', type: 'currency', default: 500000, min: 0, max: 500000000, step: 50000 },
      { id: 'returnRate', label: 'Expected return', type: 'percent', default: 10, min: 1, max: 20, step: 0.5 },
    ],
    outputs: [
      { id: 'savingsRate', label: 'Savings rate', kind: 'percent', hero: true },
      { id: 'yearsToFi', label: 'Years to financial independence', kind: 'number', accent: true },
      { id: 'fireTarget', label: 'FIRE target (25× expenses)', kind: 'currency' },
    ],
    intro: `Your savings rate — the share of income you keep and invest — is the strongest predictor of how soon you can stop needing a salary. It matters far more than which fund you pick.

This calculator shows your rate, sets a financial-independence target of 25 times your annual expenses (the 4% rule), and estimates how many years of investing at your current pace it takes to get there.`,
    howItWorks: [
      'Savings rate = (income − expenses) ÷ income. The donut shows the split between what you spend and what you save.',
      'The FIRE target is 25× your annual expenses — the corpus a 4% withdrawal could sustain.',
      'The calculator grows your current savings plus each month\'s contribution at your expected return until it reaches the target.',
    ],
    faqs: [
      {
        q: 'Why 25 times expenses?',
        a: 'It comes from the 4% rule: withdrawing 4% of a corpus a year has historically lasted about 30 years. 25× is simply 1 ÷ 4%. In higher-inflation markets a larger multiple (28–33×) is safer.',
      },
      {
        q: 'What raises the savings rate fastest?',
        a: 'Cutting a large recurring expense beats trimming many small ones, and raising income while holding expenses flat is the strongest lever of all — every extra rupee earned but not spent goes straight to the rate.',
      },
    ],
    related: ['retirement-calculator', 'net-worth-calculator', 'emergency-fund-calculator', 'goal-sip-calculator'],
  },

  {
    slug: 'doubling-time-calculator',
    category: 'Investing',
    h1: 'Money Doubling Calculator (Rule of 72)',
    metaTitle: 'Rule of 72 Calculator — How Long to Double Your Money',
    metaDescription:
      'See how many years it takes to double your money at any return rate, using both the Rule of 72 shortcut and the exact figure.',
    keywords: ['rule of 72 calculator', 'doubling time calculator', 'how long to double money'],
    formula: 'doublingTime',
    offerTags: ['investing', 'demat'],
    inputs: [
      { id: 'amount', label: 'Amount', type: 'currency', default: 100000, min: 1000, max: 100000000, step: 10000 },
      { id: 'rate', label: 'Annual return', type: 'percent', default: 10, min: 1, max: 30, step: 0.5 },
    ],
    outputs: [
      { id: 'exact', label: 'Years to double (exact)', kind: 'number', hero: true },
      { id: 'rule72', label: 'Rule of 72 estimate', kind: 'number' },
      { id: 'doubled', label: 'Doubles to', kind: 'currency', accent: true },
    ],
    intro: `The Rule of 72 is the most useful piece of mental maths in investing: divide 72 by your annual return and you get, roughly, the number of years for your money to double. At 12%, that's about six years; at 8%, about nine.

This calculator shows both the shortcut and the exact figure, so you can see how good the rule really is — and how brutally a lower return stretches the wait.`,
    howItWorks: [
      'Rule of 72: years to double ≈ 72 ÷ annual return. Fast, and accurate enough for typical rates.',
      'The exact figure uses logarithms: ln(2) ÷ ln(1 + rate). The two barely differ between about 6% and 15%.',
      'The gap between rates is stark — halving your return more than doubles the wait.',
    ],
    faqs: [
      {
        q: 'How accurate is the Rule of 72?',
        a: 'Very, for returns between roughly 6% and 15% — usually within a few months of the exact answer. For very high or very low rates it drifts, which is why the exact figure is shown alongside.',
      },
      {
        q: 'Does it work for inflation and debt too?',
        a: 'Yes. At 6% inflation, prices double in about 12 years. On a 36% credit card, the debt doubles in two — the same rule, working against you.',
      },
    ],
    related: ['compound-interest-calculator', 'cagr-calculator', 'inflation-calculator', 'lumpsum-calculator'],
  },

  {
    slug: 'nps-calculator',
    category: 'Planning',
    h1: 'NPS Calculator',
    metaTitle: 'NPS Calculator — Retirement Corpus and Monthly Pension',
    metaDescription:
      'Estimate your National Pension System corpus at retirement, the tax-free lump sum, and the monthly pension your annuity could pay.',
    keywords: ['nps calculator', 'national pension system calculator', 'nps pension calculator', 'nps maturity'],
    formula: 'nps',
    chart: 'donut',
    offerTags: ['investing', 'insurance'],
    inputs: [
      { id: 'currentAge', label: 'Your age now', type: 'number', default: 30, min: 18, max: 60, step: 1 },
      { id: 'retireAge', label: 'Retirement age', type: 'number', default: 60, min: 40, max: 70, step: 1 },
      { id: 'monthly', label: 'Monthly contribution', type: 'currency', default: 5000, min: 500, max: 500000, step: 500 },
      { id: 'rate', label: 'Expected return', type: 'percent', default: 10, min: 1, max: 15, step: 0.5 },
      { id: 'annuityShare', label: 'Share used for annuity', type: 'percent', default: 40, min: 40, max: 100, step: 5 },
      { id: 'annuityReturn', label: 'Annuity rate', type: 'percent', default: 6, min: 3, max: 10, step: 0.5 },
    ],
    outputs: [
      { id: 'corpus', label: 'Corpus at retirement', kind: 'currency', hero: true },
      { id: 'monthlyPension', label: 'Monthly pension', kind: 'currency', accent: true },
      { id: 'lumpSum', label: 'Tax-free lump sum', kind: 'currency' },
    ],
    intro: `The National Pension System builds a retirement corpus from small regular contributions, then converts part of it into a lifelong monthly pension. At retirement you can take up to 60% as a tax-free lump sum; the rest must buy an annuity.

This calculator projects the corpus your contributions grow into, splits it by the share you annuitise, and estimates the monthly pension that annuity pays.`,
    howItWorks: [
      'Your monthly contributions compound at the expected return until your retirement age.',
      'At retirement, the share you choose to annuitise (minimum 40%) buys a pension; the rest is a tax-free lump sum.',
      'The monthly pension is the annuity corpus times the annuity rate, divided by twelve.',
    ],
    faqs: [
      {
        q: 'How much of the NPS corpus is tax-free?',
        a: 'Up to 60% can be withdrawn tax-free at retirement. At least 40% must be used to buy an annuity, whose pension is taxed as income when received.',
      },
      {
        q: 'What return should I assume?',
        a: 'NPS lets you weight equity, corporate bonds and government securities. A moderate equity allocation has historically returned around 9–11% over long periods; use a lower figure as you near retirement.',
      },
    ],
    related: ['retirement-calculator', 'sip-calculator', 'goal-sip-calculator', 'inflation-calculator'],
  },

  {
    slug: 'gratuity-calculator',
    category: 'Income',
    h1: 'Gratuity Calculator',
    metaTitle: 'Gratuity Calculator — What You Get for Your Years of Service',
    metaDescription:
      'Calculate the gratuity payable when you leave a job, based on your last drawn salary and years of service, using the statutory 15/26 formula.',
    keywords: ['gratuity calculator', 'gratuity formula', 'gratuity calculation', 'end of service gratuity'],
    formula: 'gratuity',
    offerTags: ['insurance', 'savings'],
    inputs: [
      { id: 'lastSalary', label: 'Last drawn monthly salary (basic + DA)', type: 'currency', default: 50000, min: 10000, max: 5000000, step: 5000 },
      { id: 'years', label: 'Years of service', type: 'years', default: 10, min: 5, max: 40, step: 1 },
    ],
    outputs: [
      { id: 'gratuity', label: 'Gratuity payable', kind: 'currency', hero: true },
      { id: 'perYear', label: 'Roughly per year', kind: 'currency' },
      { id: 'uncapped', label: 'Before the ₹20L cap', kind: 'currency', accent: true },
    ],
    intro: `Gratuity is a lump sum your employer pays for long service, payable once you complete five continuous years. It's calculated from your last drawn basic salary (plus dearness allowance) and how long you stayed.

The statutory formula is fixed: 15 days' wages for every completed year, worked out on a 26-day month. The tax-free amount is capped at ₹20 lakh.`,
    howItWorks: [
      'Gratuity = last salary × 15 ÷ 26 × years of service.',
      'The 26 reflects a standard working month; the 15 is a fortnight of pay per year served.',
      'Anything above the ₹20 lakh statutory cap is tax-free only up to the cap; the excess is at employer discretion and taxable.',
    ],
    faqs: [
      {
        q: 'When am I eligible for gratuity?',
        a: 'After five years of continuous service with the same employer. Some exceptions apply for death or disablement, where the five-year requirement is waived.',
      },
      {
        q: 'Is gratuity taxable?',
        a: 'For employees covered by the Payment of Gratuity Act, it is tax-free up to ₹20 lakh across your career. Amounts beyond that are added to income and taxed.',
      },
    ],
    related: ['retirement-calculator', 'nps-calculator', 'freelance-rate-calculator', 'emergency-fund-calculator'],
  },

  {
    slug: 'apy-calculator',
    category: 'Savings',
    h1: 'Effective Interest Rate (APY) Calculator',
    metaTitle: 'APY Calculator — Effective Annual Yield From a Nominal Rate',
    metaDescription:
      'Convert a nominal interest rate into its effective annual yield (APY) for any compounding frequency, and see exactly how much compounding adds.',
    keywords: ['apy calculator', 'effective annual rate calculator', 'effective interest rate', 'nominal vs effective rate'],
    formula: 'apy',
    offerTags: ['savings', 'banking'],
    inputs: [
      { id: 'rate', label: 'Nominal interest rate (per year)', type: 'percent', default: 8, min: 0.1, max: 24, step: 0.1 },
      {
        id: 'frequency',
        label: 'Compounded',
        type: 'select',
        default: 12,
        options: [
          { value: 1, label: 'Yearly' },
          { value: 2, label: 'Half-yearly' },
          { value: 4, label: 'Quarterly' },
          { value: 12, label: 'Monthly' },
          { value: 365, label: 'Daily' },
        ],
      },
    ],
    outputs: [
      { id: 'apy', label: 'Effective annual yield', kind: 'percent', hero: true },
      { id: 'nominal', label: 'Nominal rate', kind: 'percent' },
      { id: 'gain', label: 'Added by compounding', kind: 'percent', accent: true },
    ],
    intro: `Two deposits can advertise the same "8%" and pay different amounts, because how often interest compounds changes what you actually earn. The effective annual yield (APY) is the honest, comparable number.

This calculator converts any nominal rate into its effective yield for your compounding frequency, so you can compare products on a level footing and see exactly how much the compounding adds.`,
    howItWorks: [
      'APY = (1 + nominal ÷ n)^n − 1, where n is how many times a year interest is credited.',
      'More frequent compounding raises the effective yield — but the effect is small next to the rate itself.',
      '"Added by compounding" is the gap between the effective yield and the nominal rate.',
    ],
    faqs: [
      {
        q: 'Nominal or effective rate — which should I compare?',
        a: 'Always the effective rate (APY). It folds in compounding frequency, so two products are directly comparable. Nominal rates can mislead when frequencies differ.',
      },
      {
        q: 'How much does daily vs yearly compounding matter?',
        a: 'Less than most people think. At 8%, yearly compounding yields 8.00% and daily about 8.33% — real, but far smaller than the difference a higher rate makes.',
      },
    ],
    related: ['compound-interest-calculator', 'fd-calculator', 'rd-calculator', 'simple-interest-calculator'],
  },
];

export const categories: string[] = [...new Set(calculators.map((c) => c.category))];

export const bySlug: Record<string, Calculator> = Object.fromEntries(
  calculators.map((c) => [c.slug, c] as [string, Calculator]),
);
