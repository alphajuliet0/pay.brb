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
process.exit(fails ? 1 : 0);
// Umbrella: invoice splits exactly into gross + employer costs + pension + fee
var um = E.umbrella({ rate: 500, days: 5, pensionPct: 10, taxCode: '1257L' });
eq('umbrella split sums to invoice', um.gross + um.ernic + um.levy + um.pension + um.margin, um.invoice, 0.02);
eq('umbrella net = gross - tax - NI', um.net, um.gross - um.tax - um.ni, 0.01);
