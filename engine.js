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
          class4Lower: 12570, class4Upper: 50270, class4Main: 0.06, class4Upper2: 0.02, class2Spt: 7105, class2Week: 3.65, ust: 50270 },
    scot: { top: [3967, 16956, 31092, 62430, 125140], rate: [0.19, 0.20, 0.21, 0.42, 0.45, 0.48],
            names: ['Starter', 'Basic', 'Intermediate', 'Higher', 'Advanced', 'Top'] },
    ma: { amount: 1260, credit: 252 },
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
    umbrella: { margin: 39.5, levy: 0.005, stWeek: 96, ptWeek: 242, uelWeek: 967 },
    property: { checked: '5 October 2026', allowance: 1000, reducerRate: 0.20,
      y2728: { basic: 0.22, higher: 0.42, additional: 0.47, reducerRate: 0.22, year: '2027/28' }, regSA: 2500 },
    bankHolidays: 8, hoursPerDay: 7.5
  };

  function r2(x) { return Math.round(x * 100) / 100; }
  function pos(x) { return x > 0 ? x : 0; }

  /* ---- Per-person settings that change the tax and NI rules. Set once per calculation by calcAt. ---- */
  var CTX = { scot: false, code: null, ma: 'none', ni: 'A' };
  /* Employee NI by category letter: [rate between PT and UEL, rate above UEL]. Employer: rate applies above the
     secondary threshold (ST) for A/B/C/J, or only above the upper secondary threshold (UST) for H/M/V/Z.
     Source: gov.uk rates and thresholds for employers 2026 to 2027. */
  var NI_LETTERS = {
    A: { label: 'A (standard)', ee: [0.08, 0.02], upst: false },
    B: { label: 'B (married women, reduced)', ee: [0.0185, 0.02], upst: false },
    C: { label: 'C (State Pension age)', ee: [0, 0], upst: false },
    H: { label: 'H (apprentice under 25)', ee: [0.08, 0.02], upst: true },
    J: { label: 'J (deferment)', ee: [0.02, 0.02], upst: false },
    M: { label: 'M (under 21)', ee: [0.08, 0.02], upst: true },
    V: { label: 'V (veteran)', ee: [0.08, 0.02], upst: true },
    Z: { label: 'Z (under 21, deferred)', ee: [0.02, 0.02], upst: true }
  };
  function niL() { return NI_LETTERS[CTX.ni] || NI_LETTERS.A; }
  function erThreshold() { return niL().upst ? RATES.ni.ust : RATES.ni.st; }
  /* Tax codes: 1257L style numbers give tax-free pay of number x 10 (+9 on payslips); K codes subtract; 0T no allowance;
     BR/D0/D1 tax all pay at 20/40/45%; NT no tax. An S or C prefix is accepted and ignored. */
  function parseCode(str) {
    var c = String(str == null ? '' : str).replace(/\s+/g, '').toUpperCase().replace(/^[SC](?=[0-9KBDN])/, '');
    var m;
    if (!c) return null;
    if (c === 'NT') return { nt: true, text: c };
    if (c === 'BR') return { flat: 0.20, text: c };
    if (c === 'D0') return { flat: 0.40, text: c };
    if (c === 'D1') return { flat: 0.45, text: c };
    if (c === '0T') return { n: 0, text: c };
    if ((m = /^K([0-9]{1,4})$/.exec(c))) return { k: +m[1], text: c };
    if ((m = /^([0-9]{1,4})[LMNPTY]$/.exec(c))) return { n: +m[1], text: c };
    return { bad: true, text: c };
  }
  function setCtx(p) {
    var paye = p.mode === 'perm' || p.mode === 'inside', code = paye ? parseCode(p.taxCode) : null;
    CTX = { scot: p.region === 'scot', code: code && !code.bad ? code : null, ma: p.ma || 'none',
            ni: (p.mode === 'sole' ? 'A' : (NI_LETTERS[p.niLetter] ? p.niLetter : 'A')) };
  }

  /* ---- National Insurance ---- */
  function class1(pay) {
    var n = RATES.ni, r = niL().ee;
    return r[0] * pos(Math.min(pay, n.uel) - n.pt) + r[1] * pos(pay - n.uel);
  }
  function employerNI(pay) { return RATES.ni.employer * pos(pay - erThreshold()); }
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
  function incomeTax(nonSav, div, ras, paye) {
    ras = ras || 0; div = div || 0;
    var ani = nonSav + div - ras, code = CTX.code, flat = null;
    var pa = pos(RATES.pa - pos(ani - RATES.taperStart) / 2);
    /* Payslip basis: HMRC payroll tables give tax-free pay of code x 10 + 9 (1257L = 12,579). Year-end liability uses the exact allowance. */
    if (paye && pa >= 10) pa = Math.floor(pa / 10) * 10 + 9;
    if (code) {
      if (code.nt) { pa = nonSav + div; }
      else if (code.flat != null) { pa = 0; flat = code.flat; }
      else if (code.k != null) { pa = -(code.k * 10 + (paye ? 9 : 0)); }
      else { pa = code.n * 10 + (paye ? 9 : 0); }
    }
    var out = { pa: pa, basic: 0, higher: 0, additional: 0, divBasic: 0, divHigher: 0, divAdditional: 0, bands: [], code: code ? code.text : null };
    if (CTX.ma === 'give' && !code) {
      if (nonSav + div <= RATES.pa) { pa = pos(pa - RATES.ma.amount); out.pa = pa; out.maGive = RATES.ma.amount; } else out.maIneligible = 'give';
    }
    var tn = pos(nonSav - pa);
    var paLeft = pos(pa - nonSav);
    var td = pos(div - paLeft);
    var bb = RATES.basicBand + ras, al = RATES.additionalAt + ras;
    var bands = [];
    if (code && code.nt) { tn = 0; }
    else if (flat != null) { bands.push([flat, tn * flat]); }
    else {
      var th, rt;
      if (CTX.scot) { th = RATES.scot.top.map(function (x) { return x + ras; }); rt = RATES.scot.rate; }
      else { th = [bb, al]; rt = [RATES.rate.basic, RATES.rate.higher, RATES.rate.additional]; }
      var prev = 0;
      for (var i = 0; i <= th.length; i++) {
        var top = i < th.length ? th[i] : Infinity, amt = pos(Math.min(tn, top) - prev);
        bands.push([rt[i], amt * rt[i]]);
        if (i < th.length) prev = Math.max(prev, top);
      }
    }
    out.bands = bands.filter(function (x) { return x[1] > 0.0000001; });
    if (CTX.scot) {
      out.basic = bands[0][1] + bands[1][1] + bands[2][1]; out.higher = bands[3][1]; out.additional = bands[4][1] + bands[5][1];
    } else if (flat != null) { out.basic = bands[0][1]; }
    else if (bands.length) { out.basic = bands[0][1]; out.higher = bands[1][1]; out.additional = bands[2][1]; }
    var p = tn, rem = td, nil = Math.min(RATES.div.allowance, td);
    p += nil; rem -= nil;
    var take = Math.min(rem, pos(bb - p)); out.divBasic = take * RATES.div.basic; p += take; rem -= take;
    take = Math.min(rem, pos(al - p)); out.divHigher = take * RATES.div.higher; p += take; rem -= take;
    out.divAdditional = rem * RATES.div.additional;
    out.incomeTax = out.basic + out.higher + out.additional;
    if (CTX.ma === 'get' && !code) {
      var cap = (CTX.scot ? RATES.scot.top[2] : RATES.basicBand) + ras;
      if (tn <= cap) { var cr = Math.min(RATES.ma.credit, out.incomeTax); if (cr > 0) { out.maCredit = cr; out.incomeTax -= cr; } }
      else out.maIneligible = 'get';
    }
    out.dividendTax = out.divBasic + out.divHigher + out.divAdditional;
    out.total = out.incomeTax + out.dividendTax;
    out.ani = ani;
    return out;
  }

  /* ---- Income tax from April 2027 (2027/28): property income has its own rates and is taxed after
     other income but before dividends. Allowances are set against non-property income first.
     np: income that is not property, savings or dividends. prop: property profit. div: dividends. ras as above.
     Source: gov.uk technical note on property, savings and dividend rates (26 Nov 2025). */
  function incomeTaxP(np, prop, div, ras) {
    ras = ras || 0; div = div || 0; prop = prop || 0;
    var ani = np + prop + div - ras;
    var pa = pos(RATES.pa - pos(ani - RATES.taperStart) / 2);
    var npT = pos(np - pa), paLeft = pos(pa - np);
    var prT = pos(prop - paLeft), paLeft2 = pos(paLeft - prop);
    var td = pos(div - paLeft2);
    var bb = RATES.basicBand + ras, al = RATES.additionalAt + ras, pos0 = 0;
    var P = RATES.property.y2728;
    function stack(amt, r) {
      var b = Math.min(amt, pos(bb - pos0)), h = Math.min(amt - b, pos(al - pos0 - b)), a = amt - b - h;
      pos0 += amt; return b * r[0] + h * r[1] + a * r[2];
    }
    var out = { pa: pa, ani: ani };
    out.npTax = stack(npT, [RATES.rate.basic, RATES.rate.higher, RATES.rate.additional]);
    out.propTax = stack(prT, [P.basic, P.higher, P.additional]);
    var nil = Math.min(RATES.div.allowance, td); pos0 += nil;
    out.dividendTax = stack(td - nil, [RATES.div.basic, RATES.div.higher, RATES.div.additional]);
    out.incomeTax = out.npTax + out.propTax;
    out.total = out.incomeTax + out.dividendTax;
    return out;
  }

  /* ---- Residential finance costs tax reduction (HMRC, Section 24) ----
     Reduction = rate x the LOWEST of: finance costs (this year plus brought forward), property profits,
     and adjusted total income above the personal allowance. Any unused finance costs carry forward. */
  function financeReducer(fin, bf, profit, ati, rate) {
    var avail = pos(fin) + pos(bf), base = Math.min(avail, pos(profit), pos(ati));
    return { reduction: base * rate, used: base, carry: avail - base, available: avail };
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
    var t = incomeTax(taxable, 0, ras, p.taxBasis === 'payslip'), ni = class1(niPay);
    var slBase = m === 'sacrifice' ? G - e : G;
    var sl = studentLoan(slBase, p.studentLoan, p.pg);
    var net = G - e - t.incomeTax - ni - sl;
    L.push(['Gross salary', G, 'info']);
    if (e) L.push([{ net: 'Pension (net pay)', sacrifice: 'Pension (salary sacrifice)', ras: 'Pension (relief at source, you pay)' }[m], -e, 'deduct']);
    L.push(['Income tax', -t.incomeTax, 'deduct'], ['National Insurance', -ni, 'deduct']);
    if (sl) L.push(['Student loan', -sl, 'deduct']);
    return { net: net, tax: t.incomeTax, ni: ni, sl: sl, divTax: 0, ct: 0, pensionPersonal: e, pensionGross: (m === 'ras' ? ras : e) + er,
      employerPension: er, lines: L, tinfo: t, tin: { np: taxable, div: 0, ras: ras }, base: G, employerCost: G + employerNI(niPay) + er,
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
      lines: L, tinfo: t, tin: { np: pos(profit), div: 0, ras: ras }, base: T, employerCost: 0, extra: { profit: profit } };
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
      employerPension: pe, lines: L, tinfo: t, tin: { np: S, div: div, ras: ras }, base: T, employerCost: 0, extra: { salary: S, dividends: div, profit: profit, employerNI: ernic } };
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
      if (base <= erThreshold()) { ddp = pos(base); er = 0; }
      else { ddp = (base + RATES.ni.employer * erThreshold()) / (1 + RATES.ni.employer); er = employerNI(ddp); }
    } else { ddp = pos(base); er = employerNI(ddp); }   // employer NI paid by the client on top
    var e = pensionAmount(p.pension, p.pensionUnit, ddp);
    var ras = e / (1 - RATES.pension.rasBasic);
    var t = incomeTax(ddp, 0, ras, p.taxBasis === 'payslip'), ni = class1(ddp);
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
      employerPension: pe, lines: L, tinfo: t, tin: { np: ddp, div: 0, ras: ras }, base: T, employerCost: T + (inclusive ? 0 : er), extra: { ddp: ddp, employerNI: er } };
  }


  /* ---- Pay summary table: [label, annual amount, kind]. kind: 'info' | 'sub' (band line) | 'deduct' | 'tot' | 'memo' ---- */
  function summaryRows(p, r, annual) {
    var t = r.tinfo, np = r.tin.np, pa = t.pa, taxable = pos(np - pa), rows = [], x = r.extra || {};
    function band(label, v) { if (v > 0.005) rows.push([label, v, 'sub']); }
    function bands() {
      (t.bands || []).forEach(function (b) { band('Tax at ' + Math.round(b[0] * 100) + '%', b[1]); });
      if (t.maCredit) rows.push(['Marriage allowance (in tax)', t.maCredit, 'memo']);
      if (t.maGive) rows.push(['Allowance given away', t.maGive, 'memo']);
    }
    if (p.mode === 'perm') {
      rows.push(['Gross pay', annual, 'info'], ['Tax-free allowance', pa, 'info'], ['Total taxable', taxable, 'info']);
      rows.push(['Income tax', r.tax, 'deduct']); bands();
      rows.push(['National Insurance', r.ni, 'deduct']);
      if (r.pensionPersonal) rows.push(['Pension (you)', r.pensionPersonal, 'deduct']);
      if (r.sl) rows.push(['Student loan', r.sl, 'deduct']);
      rows.push(['Total deductions', annual - r.net, 'tot'], ['Net pay', r.net, 'tot']);
      rows.push(['Employer NI', x.employerNI || 0, 'memo']);
    } else if (p.mode === 'inside') {
      rows.push(['Invoice (excl. VAT)', annual, 'info']);
      if (r.employerCost !== annual || (p.erInclusive !== false && x.employerNI)) { if (p.erInclusive !== false && x.employerNI) rows.push(['Employer NI taken from fee', x.employerNI, 'deduct']); }
      rows.push(['Deemed payment', x.ddp, 'info'], ['Tax-free allowance', pa, 'info'], ['Total taxable', taxable, 'info']);
      rows.push(['Income tax', r.tax, 'deduct']); bands();
      rows.push(['National Insurance', r.ni - (p.erInclusive !== false ? (x.employerNI || 0) : 0), 'deduct']);
      if (r.pensionPersonal) rows.push(['Pension (you)', r.pensionPersonal, 'deduct']);
      if (r.sl) rows.push(['Student loan', r.sl, 'deduct']);
      rows.push(['Net pay', r.net, 'tot']);
    } else if (p.mode === 'sole') {
      rows.push(['Turnover (excl. VAT)', annual, 'info']);
      if (p.expenses) rows.push(['Business expenses', p.expenses, 'deduct']);
      rows.push(['Profit', x.profit, 'info'], ['Tax-free allowance', pa, 'info'], ['Total taxable', taxable, 'info']);
      rows.push(['Income tax', r.tax, 'deduct']); bands();
      rows.push(['Class 4 NI', r.ni, 'deduct']);
      if (r.pensionPersonal) rows.push(['Pension (you)', r.pensionPersonal, 'deduct']);
      if (r.sl) rows.push(['Student loan', r.sl, 'deduct']);
      rows.push(['Net income', r.net, 'tot']);
    } else {
      var ernic = x.employerNI || 0;
      rows.push(['Contract income (excl. VAT)', annual, 'info']);
      rows.push(['Corporation tax', r.ct, 'deduct'], ['Employer NI', ernic, 'deduct']);
      rows.push(['Director salary', x.salary, 'info'], ['Dividends', x.dividends, 'info']);
      rows.push(['Tax-free allowance', pa, 'info'], ['Taxable salary', taxable, 'info']);
      rows.push(['Income tax on salary', r.tax, 'deduct']);
      if (r.divTax) rows.push(['Dividend tax', r.divTax, 'deduct']);
      if (r.ni - ernic > 0.005) rows.push(['Employee NI', r.ni - ernic, 'deduct']);
      if (r.pensionPersonal) rows.push(['Pension (you)', r.pensionPersonal, 'deduct']);
      if (r.sl) rows.push(['Student loan', r.sl, 'deduct']);
      rows.push(['Net take-home', r.net, 'tot']);
    }
    return rows;
  }

  function calcAt(p, annual) {
    setCtx(p);
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
    r.summary = summaryRows(p, r, annual);
    r.flags = [];
    if (r.tinfo.maIneligible === 'get') r.flags.push('Marriage allowance is not applied: you can only receive it if you pay tax at the basic rate or lower (starter to intermediate in Scotland).');
    if (r.tinfo.maIneligible === 'give') r.flags.push('Marriage allowance is not applied: you can only give it away if your income is within the personal allowance.');
    r.region = CTX.scot ? 'Scotland' : 'England, Wales and Northern Ireland'; r.taxCode = r.tinfo.code; r.niLetter = CTX.ni;
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

  /* ---- Other income: rental property (residential, own name), other earnings, other dividends ----
     Works out the EXTRA tax the other income causes on top of the main income, by running the whole
     income tax calculation with and without it. Rent is non-savings income: it uses up the basic-rate band,
     can taper the personal allowance and pushes dividends into higher bands. No NI, student loan or pension
     is modelled on it. opts.y2728 switches property income to the April 2027 rates and ordering. */
  function otherDefaults() { return { rent: 0, share: 100, costMode: 'exp', expenses: 0, interest: 0, capital: 0, finBf: 0, earn: 0, div: 0 }; }
  function otherActive(o) { return !!o && (+o.rent > 0 || +o.earn > 0 || +o.div > 0); }
  function propertyAt(o, opts) {
    o = Object.assign(otherDefaults(), o || {});
    var share = o.share === '' || o.share == null ? 1 : Math.min(100, pos(+o.share)) / 100;
    var rent = pos(+o.rent) * share, exp = pos(+o.expenses) * share, intr = pos(+o.interest) * share, cap = pos(+o.capital) * share;
    var allow = o.costMode === 'allow', A = RATES.property.allowance;
    var deduction = allow ? Math.min(A, rent) : exp;
    var profit = rent - deduction;
    var out = { rent: rent, expenses: exp, interest: intr, capital: cap, allowance: allow, deduction: deduction,
      profit: pos(profit), loss: pos(-profit), financeClaimable: allow ? 0 : intr, financeBf: allow ? 0 : pos(+o.finBf) };
    out.fullyRelieved = allow && rent > 0 && rent <= A;
    return out;
  }
  function calcAll(p, opts) {
    opts = opts || {};
    var r = calc(p), o = p.other;
    var all = { gross: r.annualGross, tax: r.tax, ni: r.ni, sl: r.sl, divTax: r.divTax, ct: r.ct, net: r.net, otherCash: 0, extraTax: 0, active: false };
    if (otherActive(o)) {
      var pr = propertyAt(o, opts), oe = pos(+o.earn), od = pos(+o.div), tin = r.tin, rate, t1, t0 = r.tinfo;
      var npAll = tin.np + oe, divAll = tin.div + od;
      if (opts.y2728) { rate = RATES.property.y2728.reducerRate; t1 = incomeTaxP(npAll, pr.profit, divAll, tin.ras); }
      else { rate = RATES.property.reducerRate; t1 = incomeTax(npAll + pr.profit, divAll, tin.ras); }
      var ati = pos(npAll + pr.profit - t1.pa);
      var fr = financeReducer(pr.financeClaimable, pr.financeBf, pr.profit, ati, rate);
      var red = Math.min(fr.reduction, t1.incomeTax);
      var dIT = t1.incomeTax - t0.incomeTax, dDiv = t1.dividendTax - t0.dividendTax;
      var extra = dIT - red + dDiv;
      var cash = pr.rent - pr.expenses - pr.interest - pr.capital + oe + od - extra;
      all = { gross: r.annualGross + pr.rent + oe + od, tax: r.tax + dIT - red, ni: r.ni, sl: r.sl, divTax: r.divTax + dDiv, ct: r.ct,
        otherCash: cash, extraTax: extra, active: true, prop: pr, reducer: fr, reduction: red, reducerRate: rate,
        taxBeforeReduction: dIT + dDiv, incomeTaxAdded: dIT, dividendTaxAdded: dDiv, otherEarn: oe, otherDiv: od, ati: ati, y2728: !!opts.y2728,
        loss: pr.loss, paAfter: t1.pa, ani: t1.ani };
      all.net = r.net + cash;
    }
    all.totalTax = all.tax + all.ni + all.sl + all.divTax + all.ct;
    all.effective = all.gross > 0 ? all.totalTax / all.gross : 0;
    r.all = all;
    return r;
  }

  function household(people, opts) {
    var rs = people.map(function (p) { return calcAll(p, opts); }), net = 0, tot = 0, gross = 0;
    rs.forEach(function (r) { net += r.all.net; tot += r.all.totalTax; gross += r.all.gross; });
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


  /* ---- Umbrella company payroll (weekly pay run) ----
     The umbrella keeps its margin, pays the pension and employer costs out of the invoice, and pays you the rest as taxable gross.
     Solve: gross + employer NIC + levy + employer pension + margin = invoice, with ER NIC = 15% x (gross - weekly threshold).
     Tax is weekly PAYE on the code; taxable pay is rounded up to the next whole pound (matches a real Giant slip to the penny). */
  function umbrella(p) {
    var u = RATES.umbrella, n = RATES.ni;
    var rate = pos(+p.rate || 0), days = pos(+p.days || 0), margin = pos(p.margin != null ? +p.margin : u.margin);
    var pensionPct = pos(+p.pensionPct || 0), invoice = r2(rate * days);
    var pension = r2(invoice * pensionPct / 100);
    var th = u.stWeek, erRate = n.employer, levyRate = u.levy;
    var gross = (invoice - margin - pension + erRate * th) / (1 + erRate + levyRate);
    if (gross * (erRate + levyRate) < 0 || gross < th) gross = (invoice - margin - pension) / (1 + levyRate);
    gross = pos(r2(gross));
    var ernic = r2(erRate * pos(gross - th)), levy = r2(levyRate * gross);
    var code = String(p.taxCode || '1257L').toUpperCase().replace(/\s/g, ''), free = 0, flat = null;
    var m = /^(\d+)L$/.exec(code);
    if (code === '0T') free = 0; else if (m) free = (parseInt(m[1], 10) * 10 + 9) / 52; else if (code === 'BR') flat = 0.2; else if (code === 'D0') flat = 0.4; else if (code === 'D1') flat = 0.45; else if (code === 'NT') flat = 0;
    var taxable = Math.ceil(pos(gross - free));
    var tax;
    if (flat != null) tax = taxable * flat; else {
      var bb = RATES.basicBand / 52, al = RATES.additionalAt / 52;
      tax = RATES.rate.basic * Math.min(taxable, bb) + RATES.rate.higher * pos(Math.min(taxable, al) - bb) + RATES.rate.additional * pos(taxable - al);
    }
    tax = r2(tax);
    var ni = r2(n.main * pos(Math.min(gross, u.uelWeek) - u.ptWeek) + n.upper * pos(gross - u.uelWeek));
    var net = r2(gross - tax - ni);
    return { invoice: invoice, margin: margin, pension: pension, ernic: ernic, levy: levy, gross: gross, tax: tax, ni: ni, net: net,
      codeKnown: flat != null || code === '0T' || !!m, code: code, share: invoice ? net / invoice : 0,
      deducted: r2(invoice - gross), pensionPotPlusNet: r2(net + pension) };
  }

  var api = { calcAll: calcAll, propertyAt: propertyAt, otherDefaults: otherDefaults, otherActive: otherActive, incomeTaxP: incomeTaxP, financeReducer: financeReducer, umbrella: umbrella, RATES: RATES, statement: statement, calc: calc, calcAt: calcAt, household: household, solveForNet: solveForNet, incomeTax: incomeTax,
    class1: class1, class4: class4, parseCode: parseCode, NI_LETTERS: NI_LETTERS, employerNI: employerNI, corpTax: corpTax, studentLoan: studentLoan, toAnnual: toAnnual,
    periods: periods, workdays: workdays, r2: r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BRBPAY = api;
})(typeof window !== 'undefined' ? window : this);
