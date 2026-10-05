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
process.exit(fails ? 1 : 0);
