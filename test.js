var E = require('./engine.js'), fails = 0;
function eq(name, got, want, tol) { tol = tol == null ? 0.01 : tol; var ok = Math.abs(got - want) <= tol; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + ': got ' + got.toFixed(2) + ' want ' + want); }
// gov.uk dividends example: £29,570 wages + £3,000 dividends
eq('gov.uk dividend example', E.incomeTax(29570, 3000, 0).total, 3400 + 268.75);
// gov.uk student loan example Plan 1 on £33,000
eq('gov.uk student loan plan 1', E.studentLoan(33000, '1', false), 549);
eq('gov.uk student loan plan 4 £36k', E.studentLoan(36000, '4', false), 0.09 * (36000 - 33795));
// ESM10029 deemed payment example: 7200 - VAT 1200 - materials 750 - expenses 250
eq('ESM10029 deemed direct payment', 7200 - 1200 - 750 - 250, 5000);
// PA taper
eq('PA taper £110k', E.incomeTax(110000, 0, 0).pa, 7570);
eq('tax £110k', E.incomeTax(110000, 0, 0).total, 7540 + 0.4 * (102430 - 37700));
eq('PA gone at £125,140', E.incomeTax(125140, 0, 0).pa, 0);
// Perm £50k
var perm = E.calc({ mode: 'perm', amount: 50000, unit: 'year' });
eq('perm £50k tax', perm.tax, 7486); eq('perm £50k NI', perm.ni, 2994.4); eq('perm £50k net', perm.net, 39519.6);
// Corporation tax marginal relief (HMRC CTM03925 example: profits 98,000 -> main rate less relief)
eq('CT at 98k', E.corpTax(98000), 98000 * 0.25 - 3 / 200 * (250000 - 98000));
eq('CT at 50k', E.corpTax(50000), 9500); eq('CT at 250k', E.corpTax(250000), 62500);
// Class 4 £60k profit: 6% of 37,700 + 2% of 9,730
eq('Class 4 £60k', E.class4(60000), 2262 + 194.6);
// Employer NI
eq('Employer NI £12,570', E.employerNI(12570), 1135.5);
// RAS: £8,000 net pays £10,000 gross; higher rate payer £60k salary
var ras = E.calc({ mode: 'perm', amount: 60000, unit: 'year', pensionMethod: 'ras', pension: 8000, pensionUnit: 'amt' });
var noP = E.calc({ mode: 'perm', amount: 60000, unit: 'year' });
console.log('RAS check: tax with £10k gross RAS', ras.tax.toFixed(2), 'vs none', noP.tax.toFixed(2), '(expect diff 4000 = 40% of 10k)');
eq('RAS tax diff (20% on the £9,730 that was in the higher band)', noP.tax - ras.tax, 1946);
// Unit conversion round trip
var c = { mode: 'ltd', amount: 400, unit: 'day', dpw: 5 };
eq('day rate to annual (227 days)', E.toAnnual(400, 'day', c), 400 * 227);
// ContractorUK default case: £400/day x 220 days = £88,000, £3,000 expenses, £3,000 employer pension, optimise salary
var d = { amount: 88000, unit: 'year', expenses: 3000, employerPension: 3000, pensionUnit: 'amt', salaryMode: 'optimise' };
var out = E.calc(Object.assign({ mode: 'ltd' }, d)), ins = E.calc(Object.assign({ mode: 'inside' }, d));
console.log('ContractorUK default: outside net', out.net.toFixed(0), '(theirs 56,709) inside net', ins.net.toFixed(0), '(theirs 53,805)');
eq('outside vs ContractorUK', out.net, 56709, 60); eq('inside vs ContractorUK', ins.net, 53805, 60);
// Monotonic + solver
var s = E.solveForNet({ mode: 'inside' }, 40000); eq('solver round trip', E.calcAt({ mode: 'inside' }, s).net, 40000, 0.5);
// Period statements: reconcile cash-flow lines and YTD in every mode/frequency.
['perm','sole','ltd','inside'].forEach(function(mode){
 ['month','week','fourweek'].forEach(function(f){
  var p={mode:mode,amount:88000,unit:'year',expenses:mode==='perm'?0:3000,pension:2400,employerPension:3000,studentLoan:'2',pg:true,vatRegistered:true,vatFlat:true,frsRate:14.5};
  var st=E.statement(p,f),last=st.periods[st.count-1];
  eq(mode+' '+f+' annual reconciliation',last.ytdNet,E.calc(p).net,0.05);
  eq(mode+' '+f+' sum periods',st.periods.reduce(function(a,x){return a+x.net;},0),last.ytdNet,0.001);
  st.periods.forEach(function(x){eq(mode+' '+f+' period '+x.number+' cashflow',x.lines.reduce(function(a,l){return a+l.amount;},0),x.net,0.001);});
 });
});
var inc=E.statement({mode:'inside',amount:60000,unit:'year',erInclusive:false},'month');
eq('NI paid on top does not reduce take-home',inc.annualNet,E.calc({mode:'inside',amount:60000,unit:'year',erInclusive:false}).net,0.03);
eq('monthly count',inc.count,12);
eq('weekly count',E.statement({mode:'perm',amount:50000,unit:'year'},'week').count,52);
eq('4-weekly count',E.statement({mode:'perm',amount:50000,unit:'year'},'fourweek').count,13);
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
// Umbrella: invoice splits exactly into gross + employer costs + pension + fee
var um = E.umbrella({ rate: 500, days: 5, pensionPct: 10, taxCode: '1257L' });
eq('umbrella split sums to invoice', um.gross + um.ernic + um.levy + um.pension + um.margin, um.invoice, 0.02);
eq('umbrella net = gross - tax - NI', um.net, um.gross - um.tax - um.ni, 0.01);

/* ---- Other income: rental property, Section 24 finance cost reducer, 2027/28 property rates ---- */
// gov.uk "Tax relief for residential landlords: how it's worked out" (reducer = rate x lowest of finance costs, property profit, adjusted total income above PA)
eq('gov.uk landlord ex 1 (Sophia): finance costs lowest', E.financeReducer(20000, 0, 43000, 32000, 0.2).reduction, 4000);
eq('gov.uk landlord ex 2 (John): finance costs lowest', E.financeReducer(8000, 0, 16000, 40000, 0.2).reduction, 1600);
eq('gov.uk landlord ex 4 (Brian) yr1: property profit lowest', E.financeReducer(15000, 0, 13000, 38000, 0.2).reduction, 2600);
eq('gov.uk landlord ex 4 (Brian) yr1: carry forward', E.financeReducer(15000, 0, 13000, 38000, 0.2).carry, 2000);
eq('gov.uk landlord ex 4 (Brian) yr2: 17,000 incl b/f', E.financeReducer(15000, 2000, 22000, 47000, 0.2).reduction, 3400);
eq('reducer limited by adjusted total income', E.financeReducer(20000, 0, 40000, 5000, 0.2).reduction, 1000);
// gov.uk technical note annex (2027/28): employment 30,000, property profit 3,000, finance costs 1,000, dividends 200 (savings 400 omitted, taxed at 0%)
var ax = E.incomeTaxP(30000, 3000, 200, 0);
eq('2027/28 annex: employment tax 3,486 + property tax 660', ax.incomeTax, 4146);
eq('2027/28 annex: dividend tax nil (allowance)', ax.dividendTax, 0);
var axp = { mode: 'perm', amount: 30000, unit: 'year', other: { rent: 3000, share: 100, costMode: 'exp', expenses: 0, interest: 1000, div: 200 } };
var axr = E.calcAll(axp, { y2728: true });
eq('2027/28 annex: total income tax after 22% reducer = 3,926', axr.tax + axr.all.tax - axr.tax, 3926);
eq('2027/28 annex: reduction 220', axr.all.reduction, 220);
// 2027/28 property rates stack on top of earnings: 50,000 earnings, 10,000 property profit
eq('2027/28 stacking: 7,486 + 270 x 22% + 9,730 x 42%', E.incomeTaxP(50000, 10000, 0, 0).incomeTax, 7486 + 270 * 0.22 + 9730 * 0.42);
eq('2027/28 with no property equals normal calc', E.incomeTaxP(50000, 0, 0, 0).incomeTax, E.incomeTax(50000, 0, 0).incomeTax);
// 2026/27 hand-worked (Brian-style): salary 50,000, rent 20,000, other costs 7,000, interest 15,000
var br = E.calcAll({ mode: 'perm', amount: 50000, unit: 'year', other: { rent: 20000, share: 100, costMode: 'exp', expenses: 7000, interest: 15000, capital: 0 } });
// income tax on 63,000: 37,700 x 20% + 12,730 x 40% = 12,632, less 20% x 13,000 = 2,600 -> 10,032; was 7,486
eq('2026/27 Brian-style: total income tax', br.all.tax, 10032);
eq('2026/27 Brian-style: reducer', br.all.reduction, 2600);
eq('2026/27 Brian-style: finance costs carried forward', br.all.reducer.carry, 2000);
eq('2026/27 Brian-style: extra tax', br.all.extraTax, 10032 - 7486);
eq('2026/27 Brian-style: cash after costs, interest and tax', br.all.otherCash, 20000 - 7000 - 15000 - (10032 - 7486));
// property allowance: 6,000 rent, 30,000 salary: profit 5,000, 20% extra
var al = E.calcAll({ mode: 'perm', amount: 30000, unit: 'year', other: { rent: 6000, share: 100, costMode: 'allow', expenses: 0, interest: 2000 } });
eq('property allowance: profit 5,000 taxed at 20%', al.all.extraTax, 1000);
eq('property allowance: no finance cost reducer', al.all.reduction, 0);
var al5 = E.calcAll({ mode: 'perm', amount: 30000, unit: 'year', other: { rent: 6000, share: 50, costMode: 'allow' } });
eq('property allowance on 50% share: 3,000 rent less 1,000 = 2,000 x 20%', al5.all.extraTax, 400);
eq('rent of 1,000 or less is fully covered by the allowance', E.calcAll({ mode: 'perm', amount: 30000, unit: 'year', other: { rent: 900, costMode: 'allow' } }).all.extraTax, 0);
// ownership share applies to rent, costs and interest
var sh = E.propertyAt({ rent: 12000, share: 50, expenses: 2000, interest: 4000, capital: 1000, costMode: 'exp' });
eq('share: rent', sh.rent, 6000); eq('share: profit', sh.profit, 5000); eq('share: interest', sh.interest, 2000);
// loss: costs above rent give no profit and no reducer
var ls = E.calcAll({ mode: 'perm', amount: 30000, unit: 'year', other: { rent: 5000, expenses: 8000, interest: 1000 } });
eq('loss: no extra tax', ls.all.extraTax, 0); eq('loss recorded', ls.all.loss, 3000);
// dividends sit on top: salary 12,570 (covered by PA), rent profit 30,000, other dividends 40,000. Hand-worked:
// rent 30,000 x 20% = 6,000; dividends start at 30,000 taxable: 500 nil, 7,200 x 10.75% = 774, 32,300 x 35.75% = 11,547.25
eq('rent pushes other dividends up the bands', E.calcAll({ mode: 'perm', amount: 12570, unit: 'year', other: { rent: 30000, div: 40000 } }).all.extraTax, 6000 + 774 + 11547.25);
// no other income: calcAll equals calc
var plain = E.calcAll({ mode: 'ltd', amount: 500, unit: 'day' });
eq('no other income leaves take-home unchanged', plain.all.net, E.calc({ mode: 'ltd', amount: 500, unit: 'day' }).net);
// household sums the combined figures
var hhx = E.household([{ mode: 'perm', amount: 50000, unit: 'year' }, { mode: 'perm', amount: 30000, unit: 'year' }]);
eq('household net', hhx.net, E.calc({ mode: 'perm', amount: 50000, unit: 'year' }).net + E.calc({ mode: 'perm', amount: 30000, unit: 'year' }).net);
// Payslip basis (HMRC Tables A: tax-free pay = code x 10 + 9, so 1257L = 12,579). Reconciled to listentotaxman 2026/27.
function pay(g, x) { return E.calc(Object.assign({ mode: 'perm', amount: g, unit: 'year', taxBasis: 'payslip' }, x || {})); }
eq('payslip tax 50k', pay(50000).tax, 7484.2); eq('payslip net 50k', pay(50000).net, 39521.4);
eq('payslip tax 110k', pay(110000).tax, 33428.4); eq('payslip allowance 110k', pay(110000).tinfo.pa, 7579);
eq('payslip tax 125k', pay(125000).tax, 42428.4); eq('payslip allowance 125k', pay(125000).tinfo.pa, 79);
eq('payslip tax 150k (no allowance, no +9)', pay(150000).tax, 53703);
eq('year basis stays exact 50k', E.calc({ mode: 'perm', amount: 50000, unit: 'year' }).tax, 7486);
// Summary rows reconcile in every mode: net = last total row
['perm', 'sole', 'ltd', 'inside'].forEach(function (m) {
  var r = E.calc({ mode: m, amount: 88000, unit: 'year', expenses: 3000 });
  var last = r.summary.filter(function (x) { return x[2] === 'tot'; }).pop();
  eq('summary net row ' + m, last[1], r.net);
});
var sp = pay(50000);
eq('summary deductions 50k payslip', sp.summary.filter(function (x) { return x[0] === 'Total deductions'; })[0][1], 10478.6);
// Scotland, tax codes, NI letters, marriage allowance. LTTM figures were read from listentotaxman.com on 6 Oct 2026.
function P2(o) { return E.calc(Object.assign({ mode: 'perm', amount: 50000, unit: 'year', taxBasis: 'year' }, o)); }
eq('scot 50k tax (LTTM 8,982.05)', P2({ region: 'scot' }).tax, 8982.05);
eq('scot 50k net (LTTM 38,023.55)', P2({ region: 'scot' }).net, 38023.55);
eq('scot 110k tax (LTTM net 68,307.35)', P2({ region: 'scot', amount: 110000 }).net, 68307.35);
eq('scot 50k payslip basis', P2({ region: 'scot', taxBasis: 'payslip' }).tax, 8978.27);
eq('scot band rows sum to tax', P2({ region: 'scot' }).tinfo.bands.reduce(function (a, b) { return a + b[1]; }, 0), 8982.05);
eq('scot top rate 48% above 125,140 (200k)', P2({ region: 'scot', amount: 200000 }).tinfo.bands.slice(-1)[0][0] * 100, 48);
eq('code 1100L payslip (LTTM 8,056.40)', P2({ taxCode: '1100L', taxBasis: 'payslip' }).tax, 8056.4);
eq('code 1100L allowance (LTTM 11,009)', P2({ taxCode: '1100L', taxBasis: 'payslip' }).tinfo.pa, 11009);
eq('code BR (LTTM 10,000)', P2({ taxCode: 'BR' }).tax, 10000);
eq('code D0 40%', P2({ taxCode: 'D0' }).tax, 20000);
eq('code NT no tax', P2({ taxCode: 'NT' }).tax, 0);
eq('code K100 payslip (LTTM 12,863.60)', P2({ taxCode: 'K100', taxBasis: 'payslip' }).tax, 12863.6);
eq('code S1257L prefix accepted', P2({ taxCode: 'S1257L' }).tax, 7486);
eq('bad code falls back to standard', P2({ taxCode: 'XYZ' }).tax, 7486);
eq('code ignored for sole trader', E.calc({ mode: 'sole', amount: 50000, unit: 'year', taxCode: 'BR' }).tax, E.calc({ mode: 'sole', amount: 50000, unit: 'year' }).tax);
eq('NI letter B employee NI (LTTM 692.46)', P2({ niLetter: 'B' }).ni, 692.46, 0.011);
eq('NI letter C employee NI nil', P2({ niLetter: 'C' }).ni, 0);
eq('NI letter C employer NI still 15%', P2({ niLetter: 'C' }).extra.employerNI, 6750);
eq('NI letter H employer NI nil under 50,270', P2({ niLetter: 'H' }).extra.employerNI, 0);
eq('NI letter J employee NI 2%', P2({ niLetter: 'J' }).ni, 748.6);
eq('marriage allowance receive cuts tax by 252', P2({ ma: 'get' }).tax, 7486 - 252);
eq('marriage allowance receive refused at 60k', P2({ ma: 'get', amount: 60000 }).tax, P2({ amount: 60000 }).tax);
eq('marriage allowance give at 12,000', P2({ ma: 'give', amount: 12000 }).tax, 138);
eq('marriage allowance give refused at 30k', P2({ ma: 'give', amount: 30000 }).tax, P2({ amount: 30000 }).tax);
eq('defaults unchanged', P2({}).tax, 7486);
process.exit(fails ? 1 : 0);
