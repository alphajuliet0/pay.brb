/* pay.brb calculation engine. Pure functions, no DOM. All amounts are annual GBP unless stated.
   Rates live in RATES only: next April, edit that object and re-run test.js. */
(function (root) {
  'use strict';

  var RATES = {
    year: '2026/27',
    checked: '1 October 2026',
    region: 'England (and Wales/NI: same bands)',
    pa: 12570, taperStart: 100000,
    basicBand: 37700, additionalAt: 125140,          // taxable income (after PA)
    rate: { basic: 0.20, higher: 0.40, additional: 0.45 },
    div: { allowance: 500, basic: 0.1075, higher: 0.3575, additional: 0.3935 },
    ni: { pt: 12570, uel: 50270, main: 0.08, upper: 0.02, st: 5000, employer: 0.15,
          class4Lower: 12570, class4Upper: 50270, class4Main: 0.06, class4Upper2: 0.02, class2Spt: 7105, class2Week: 3.65 },
    ct: { small: 0.19, main: 0.25, lower: 50000, upper: 250000, fraction: 3 / 200 },
    sl: { '1': 26900, '2': 29385, '4': 33795, '5': 25000, pg: 21000, rate: 0.09, pgRate: 0.06 },
    pension: { annualAllowance: 60000, rasBasic: 0.20 },
    vat: { standard: 0.20, limitedCost: 0.165, threshold: 150000 },
    frs: [
      ['Computer and IT consultancy or data processing', 14.5],
      ['Business services not listed elsewhere', 12],
      ['Management consultancy', 14],
      ['Accountancy or book-keeping', 14.5],
      ['Advertising', 11],
      ['Architect, civil and structural engineer or surveyor', 14.5],
      ['Any other activity not listed elsewhere', 12],
      ['Limited cost business (goods under 2% of turnover or £1,000)', 16.5]
    ],
    bankHolidays: 8, hoursPerDay: 7.5
  };

  function r2(x) { return Math.round(x * 100) / 100; }
  function pos(x) { return x > 0 ? x : 0; }

  /* ---- National Insurance ---- */
  function class1(pay) {
    var n = RATES.ni;
    return n.main * pos(Math.min(pay, n.uel) - n.pt) + n.upper * pos(pay - n.uel);
  }
  function employerNI(pay) { return RATES.ni.employer * pos(pay - RATES.ni.st); }
  function class4(profit) {
    var n = RATES.ni;
    return n.class4Main * pos(Math.min(profit, n.class4Upper) - n.class4Lower) + n.class4Upper2 * pos(profit - n.class4Upper);
  }

  /* ---- Corporation tax with marginal relief (no associated companies) ---- */
  function corpTax(profit) {
    var c = RATES.ct;
    if (profit <= 0) return 0;
    if (profit <= c.lower) return profit * c.small;
    if (profit >= c.upper) return profit * c.main;
    return profit * c.main - c.fraction * (c.upper - profit);   // augmented profits = taxable profits here
  }

  /* ---- Student loans (annual, on income) ---- */
  function studentLoan(income, plan, pg) {
    var s = RATES.sl, t = 0;
    if (plan && plan !== 'none' && s[plan] != null) t += s.rate * pos(income - s[plan]);
    if (pg) t += s.pgRate * pos(income - s.pg);
    return t;
  }

  /* ---- Income tax ----
     nonSav: employment/trading income after any net-pay or sacrifice deduction.
     div: dividends. ras: GROSS relief-at-source pension contribution (extends bands, lowers adjusted net income). */
  function incomeTax(nonSav, div, ras) {
    ras = ras || 0; div = div || 0;
    var ani = nonSav + div - ras;
    var pa = pos(RATES.pa - pos(ani - RATES.taperStart) / 2);
    var tn = pos(nonSav - pa);
    var paLeft = pos(pa - nonSav);
    var td = pos(div - paLeft);
    var bb = RATES.basicBand + ras, al = RATES.additionalAt + ras;
    var out = { pa: pa, basic: 0, higher: 0, additional: 0, divBasic: 0, divHigher: 0, divAdditional: 0 };
    out.basic = Math.min(tn, bb) * RATES.rate.basic;
    out.higher = pos(Math.min(tn, al) - bb) * RATES.rate.higher;
    out.additional = pos(tn - al) * RATES.rate.additional;
    var p = tn, rem = td, nil = Math.min(RATES.div.allowance, td);
    p += nil; rem -= nil;
    var take = Math.min(rem, pos(bb - p)); out.divBasic = take * RATES.div.basic; p += take; rem -= take;
    take = Math.min(rem, pos(al - p)); out.divHigher = take * RATES.div.higher; p += take; rem -= take;
    out.divAdditional = rem * RATES.div.additional;
    out.incomeTax = out.basic + out.higher + out.additional;
    out.dividendTax = out.divBasic + out.divHigher + out.divAdditional;
    out.total = out.incomeTax + out.dividendTax;
    out.ani = ani;
    return out;
  }

  /* ---- Working pattern and unit conversion ---- */
  function workdays(p) {
    var dpw = p.dpw != null ? p.dpw : 5;
    var d = Math.round(dpw * 52) - (p.holidayDays != null ? p.holidayDays : 25)
      - (p.bankHols != null ? p.bankHols : RATES.bankHolidays) - (p.sickDays || 0);
    return Math.max(1, d);
  }
  function hpd(p) { return p.hoursPerDay != null ? p.hoursPerDay : RATES.hoursPerDay; }
  function toAnnual(amount, unit, p) {
    var dpw = p.dpw != null ? p.dpw : 5;
    if (p.mode === 'perm') {
      var hpw = dpw * hpd(p);
      return { hour: amount * hpw * 52, day: amount * dpw * 52, week: amount * 52, month: amount * 12, year: amount }[unit];
    }
    var wd = workdays(p);
    return { hour: amount * hpd(p) * wd, day: amount * wd, week: amount * wd / dpw, month: amount * 12, year: amount }[unit];
  }
  function periods(annual, p) {
    var dpw = p.dpw != null ? p.dpw : 5;
    if (p.mode === 'perm') {
      return { hour: annual / (dpw * hpd(p) * 52), day: annual / (dpw * 52), week: annual / 52, month: annual / 12, year: annual };
    }
    var wd = workdays(p);
    return { hour: annual / (hpd(p) * wd), day: annual / wd, week: annual / 52, month: annual / 12, year: annual };
  }

  /* ---- Pension helpers ---- */
  function pensionAmount(v, mode, base) { v = v || 0; return mode === 'pct' ? base * v / 100 : v; }

  /* ---- VAT surplus under flat rate ---- */
  function vatSurplus(p, T) {
    if (!p.vatRegistered || !p.vatFlat) return 0;
    var rate = (p.frsRate != null ? p.frsRate : 14.5) / 100;
    return RATES.vat.standard * T - rate * (1 + RATES.vat.standard) * T;
  }

  /* ---- Per-mode calculators. Each returns lines + net ---- */
  function calcPerm(p, G) {
    var L = [], er = pensionAmount(p.employerPension, p.pensionUnit, G);
    var e = pensionAmount(p.pension, p.pensionUnit, G), m = p.pensionMethod || 'net';
    if (e > G) e = G;
    var taxable = G, niPay = G, ras = 0;
    if (m === 'net') { taxable = G - e; }
    else if (m === 'sacrifice') { taxable = G - e; niPay = G - e; }
    else if (m === 'ras') { ras = e / (1 - RATES.pension.rasBasic); }
    var t = incomeTax(taxable, 0, ras), ni = class1(niPay);
    var slBase = m === 'sacrifice' ? G - e : G;
    var sl = studentLoan(slBase, p.studentLoan, p.pg);
    var net = G - e - t.incomeTax - ni - sl;
    L.push(['Gross salary', G, 'info']);
    if (e) L.push([{ net: 'Pension (net pay)', sacrifice: 'Pension (salary sacrifice)', ras: 'Pension (relief at source, you pay)' }[m], -e, 'deduct']);
    L.push(['Income tax', -t.incomeTax, 'deduct'], ['National Insurance', -ni, 'deduct']);
    if (sl) L.push(['Student loan', -sl, 'deduct']);
    return { net: net, tax: t.incomeTax, ni: ni, sl: sl, divTax: 0, ct: 0, pensionPersonal: e, pensionGross: (m === 'ras' ? ras : e) + er,
      employerPension: er, lines: L, tinfo: t, base: G, employerCost: G + employerNI(niPay) + er,
      extra: { employerNI: employerNI(niPay) } };
  }

  function calcSole(p, T) {
    var L = [], exp = p.expenses || 0, vs = vatSurplus(p, T);
    var profit = T + vs - exp;
    var e = pensionAmount(p.pension, p.pensionUnit, profit);
    var ras = e / (1 - RATES.pension.rasBasic);
    var t = incomeTax(pos(profit), 0, ras), c4 = class4(pos(profit));
    var sl = studentLoan(pos(profit), p.studentLoan, p.pg);
    var net = profit - t.incomeTax - c4 - sl - e;
    L.push(['Turnover (excl. VAT)', T, 'info']);
    if (vs) L.push(['VAT flat rate surplus kept', vs, 'info']);
    if (exp) L.push(['Business expenses', -exp, 'deduct']);
    L.push(['Profit', profit, 'info']);
    if (e) L.push(['Pension (relief at source, you pay)', -e, 'deduct']);
    L.push(['Income tax', -t.incomeTax, 'deduct'], ['Class 4 National Insurance', -c4, 'deduct']);
    if (sl) L.push(['Student loan', -sl, 'deduct']);
    return { net: net, tax: t.incomeTax, ni: c4, sl: sl, divTax: 0, ct: 0, pensionPersonal: e, pensionGross: ras, employerPension: 0,
      lines: L, tinfo: t, base: T, employerCost: 0, extra: { profit: profit } };
  }

  function ltdAt(p, T, S) {
    var exp = p.expenses || 0, vs = vatSurplus(p, T);
    var pe = Math.min(pensionAmount(p.employerPension, p.pensionUnit, T), RATES.pension.annualAllowance);
    var ernic = employerNI(S);
    var profit = T + vs - exp - pe - S - ernic;
    var ct = corpTax(profit);
    var div = pos(profit - ct);
    var e = pensionAmount(p.pension, p.pensionUnit, S + div);
    var ras = e / (1 - RATES.pension.rasBasic);
    var t = incomeTax(S, div, ras), ni = class1(S);
    var sl = studentLoan(S + div, p.studentLoan, p.pg);
    var net = S + div - t.total - ni - sl - e;
    var L = [['Contract income (excl. VAT)', T, 'info']];
    if (vs) L.push(['VAT flat rate surplus kept', vs, 'info']);
    if (exp) L.push(['Company expenses', -exp, 'deduct']);
    if (pe) L.push(['Employer pension from company', -pe, 'deduct']);
    L.push(['Director salary', -S, 'deduct']);
    if (ernic) L.push(['Employer National Insurance', -ernic, 'deduct']);
    L.push(['Company profit before tax', profit, 'info'], ['Corporation tax', -ct, 'deduct'], ['Dividends paid out', div, 'info']);
    L.push(['Income tax on salary', -t.incomeTax, 'deduct']);
    L.push(['Dividend tax', -t.dividendTax, 'deduct']);
    if (ni) L.push(['Employee National Insurance', -ni, 'deduct']);
    if (e) L.push(['Pension (relief at source, you pay)', -e, 'deduct']);
    if (sl) L.push(['Student loan', -sl, 'deduct']);
    return { net: net, tax: t.incomeTax, ni: ni + ernic, sl: sl, divTax: t.dividendTax, ct: ct, pensionPersonal: e, pensionGross: ras + pe,
      employerPension: pe, lines: L, tinfo: t, base: T, employerCost: 0, extra: { salary: S, dividends: div, profit: profit, employerNI: ernic } };
  }
  function calcLtd(p, T) {
    var mode = p.salaryMode || 'optimise', best = null, cands;
    if (mode === '5000') cands = [5000];
    else if (mode === '12570') cands = [12570];
    else if (mode === 'custom') cands = [pos(p.salaryCustom || 0)];
    else cands = [5000, 12570];
    cands.forEach(function (S) { var r = ltdAt(p, T, S); if (!best || r.net > best.net) best = r; });
    return best;
  }

  function calcInside(p, T) {
    // Public sector / medium and large client: fee-payer applies the deemed direct payment (ESM9070).
    var pe = 0;                              // company pension contributions give no relief against the deemed payment
    var chain = T;                           // chain payment net of VAT
    var expAllow = p.expenses || 0;          // optional step 3: only costs an employee could claim under s.336 ITEPA
    var base = chain - expAllow, ddp, er, inclusive = p.erInclusive !== false;
    if (inclusive) {
      // client budget is the invoice: employer NI (15% above £5,000) is taken out of it
      if (base <= RATES.ni.st) { ddp = pos(base); er = 0; }
      else { ddp = (base + RATES.ni.employer * RATES.ni.st) / (1 + RATES.ni.employer); er = employerNI(ddp); }
    } else { ddp = pos(base); er = employerNI(ddp); }   // employer NI paid by the client on top
    var e = pensionAmount(p.pension, p.pensionUnit, ddp);
    var ras = e / (1 - RATES.pension.rasBasic);
    var t = incomeTax(ddp, 0, ras), ni = class1(ddp);
    var sl = studentLoan(ddp, p.studentLoan, p.pg);
    var net = ddp - t.incomeTax - ni - sl - e;
    var L = [['Invoice (excl. VAT)', T, 'info']];
    if (pe) L.push(['Employer pension from company', -pe, 'deduct']);
    if (expAllow) L.push(['Allowable employee-type expenses', -expAllow, 'deduct']);
    if (inclusive && er) L.push(['Employer National Insurance (from the fee)', -er, 'deduct']);
    L.push(['Deemed payment (taxed as employment)', ddp, 'info'], ['Income tax (PAYE)', -t.incomeTax, 'deduct'], ['Employee National Insurance', -ni, 'deduct']);
    if (e) L.push(['Pension (relief at source, you pay)', -e, 'deduct']);
    if (sl) L.push(['Student loan', -sl, 'deduct']);
    return { net: net, tax: t.incomeTax, ni: ni + (inclusive ? er : 0), sl: sl, divTax: 0, ct: 0, pensionPersonal: e, pensionGross: ras + pe,
      employerPension: pe, lines: L, tinfo: t, base: T, employerCost: T + (inclusive ? 0 : er), extra: { ddp: ddp, employerNI: er } };
  }

  function calcAt(p, annual) {
    if (p.mode === 'perm') return calcPerm(p, annual);
    if (p.mode === 'sole') return calcSole(p, annual);
    if (p.mode === 'ltd') return calcLtd(p, annual);
    return calcInside(p, annual);
  }

  function calc(p) {
    var annual = toAnnual(p.amount || 0, p.unit || 'year', p);
    var r = calcAt(p, annual);
    var d = 1000, up = calcAt(p, annual + d);
    r.marginal = Math.min(1, Math.max(0, 1 - (up.net - r.net) / d));
    r.annualGross = annual;
    var deductions = annual - r.net;
    if (p.mode === 'ltd' || p.mode === 'sole' || p.mode === 'inside') deductions = annual - (p.expenses || 0) * (p.mode === 'inside' ? 0 : 1) - r.net;
    r.totalTax = r.tax + r.ni + r.sl + r.divTax + r.ct;
    r.effective = annual > 0 ? r.totalTax / annual : 0;
    r.perPeriod = periods(r.net, p);
    r.grossPeriods = periods(annual, p);
    r.workdays = p.mode === 'perm' ? null : workdays(p);
    var ani = r.tinfo.ani;
    r.flags = [];
    if (ani > RATES.taperStart && ani < RATES.additionalAt) r.flags.push('Your income is in the £100,000 to £125,140 band where the personal allowance is withdrawn, an effective marginal rate near 60%. A pension contribution here can recover a lot of it.');
    if (r.pensionGross > RATES.pension.annualAllowance) r.flags.push('Total pension contributions are above the £60,000 annual allowance (carry forward may apply).');
    if ((p.mode === 'ltd' || p.mode === 'sole') && p.vatRegistered === false && annual > RATES.vat.threshold) r.flags.push('Turnover is above the £150,000 VAT registration threshold.');
    return r;
  }

  /* Gross (annual) needed to reach a target annual take-home, by bisection. */
  function solveForNet(p, targetNet) {
    var lo = 0, hi = 3000000, i;
    for (i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (calcAt(p, mid).net < targetNet) lo = mid; else hi = mid;
    }
    return hi;
  }

  function household(people) {
    var rs = people.map(calc), net = 0, tot = 0, gross = 0;
    rs.forEach(function (r) { net += r.net; tot += r.totalTax; gross += r.annualGross; });
    return { people: rs, net: net, totalTax: tot, gross: gross, effective: gross ? tot / gross : 0 };
  }

  /* Planning statement, not a payroll calculator. Split rounded annual cash flows
     across a full tax year; penny remainders land in the final period. */
  function statement(p, frequency) {
    var r = calc(p), count = {month:12, week:52, fourweek:13}[frequency] || 12;
    var er = (p.mode === 'ltd' || (p.mode === 'inside' && p.erInclusive !== false)) ? r.extra.employerNI : 0;
    var employeeNI = (p.mode === 'ltd' || p.mode === 'inside') ? r.ni - er : r.ni;
    var flows = [[p.mode === 'perm' ? 'Gross salary' : 'Income / invoice (excl. VAT)', r.annualGross]];
    var surplus = vatSurplus(p, r.annualGross);
    if ((p.mode === 'sole' || p.mode === 'ltd') && surplus) flows.push(['VAT flat rate surplus', surplus]);
    if (p.expenses && p.mode !== 'perm') flows.push([p.mode === 'inside' ? 'Allowable expenses removed' : 'Business / company expenses', -p.expenses]);
    if (p.mode === 'ltd' && r.employerPension) flows.push(['Company pension', -r.employerPension]);
    if (er) flows.push(['Employer NI from income', -er]);
    if (p.mode === 'ltd') flows.push(['Corporation tax reserve', -r.ct]);
    flows.push([p.mode === 'sole' || p.mode === 'ltd' ? 'Income tax reserve' : 'Income tax estimate', -r.tax]);
    if (p.mode === 'ltd') flows.push(['Dividend tax reserve', -r.divTax]);
    flows.push([p.mode === 'sole' ? 'Class 4 NI reserve' : 'Employee NI estimate', -employeeNI]);
    flows.push(['Personal pension contribution', -r.pensionPersonal], ['Student / postgraduate loan', -r.sl]);
    var totals = flows.map(function(x){return Math.round(x[1]*100);});
    function allocated(c, n) {var part=Math.trunc(c/count); return n===count ? c-part*(count-1) : part;}
    var ytd=totals.map(function(){return 0;}), periods=[];
    for(var n=1;n<=count;n++){
      var net=0, cumulative=0;
      var lines=flows.map(function(x,i){var cents=allocated(totals[i],n);ytd[i]+=cents;net+=cents;cumulative+=ytd[i];return {label:x[0],amount:cents/100,ytd:ytd[i]/100};});
      periods.push({number:n,lines:lines,net:net/100,ytdNet:cumulative/100});
    }
    return {frequency:frequency,count:count,periods:periods,annualNet:totals.reduce(function(a,b){return a+b;},0)/100,result:r};
  }

  var api = { RATES: RATES, statement: statement, calc: calc, calcAt: calcAt, household: household, solveForNet: solveForNet, incomeTax: incomeTax,
    class1: class1, class4: class4, employerNI: employerNI, corpTax: corpTax, studentLoan: studentLoan, toAnnual: toAnnual,
    periods: periods, workdays: workdays, r2: r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BRBPAY = api;
})(typeof window !== 'undefined' ? window : this);
