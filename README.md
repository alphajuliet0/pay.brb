# pay.brb

UK pay calculator by bigredbox. Permanent salary, sole trader, Ltd outside IR35 and inside IR35 (public sector deemed payment), single or joint income, hourly/daily/weekly/monthly/yearly, pension, student loan, target-rate mode.

- Rates for 2026/27 live in one object, `RATES` in `engine.js`. Next April: update it and run `node test.js`.
- `index.html` is the built app (engine and styles inlined). Estimates only, not tax advice.
- Tests check gov.uk worked examples and the ContractorUK 2026/27 default case.
