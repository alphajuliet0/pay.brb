# pay.brb

UK pay calculator by bigredbox. Permanent salary, sole trader, Ltd outside IR35 and inside IR35 (public sector deemed payment), single or joint income, rental and other income, hourly/daily/weekly/monthly/yearly, pension, student loan, target-rate mode.

- Rates for 2026/27 live in one object, `RATES` in `engine.js`. Next April: update it and run `node test.js`.
- `index.html` is the built app (engine and styles inlined). Estimates only, not tax advice.
- Tests check gov.uk worked examples, the ContractorUK 2026/27 default case and a listentotaxman payslip reconciliation (tax code 1257L, allowance £12,579).

## v1.1
- Household overview shows both people together, stacked on mobile.
- Monthly, weekly and 4-weekly cash-flow statements with estimated YTD. Annual amounts are allocated evenly, with penny adjustments in the final period. These are not actual PAYE payslips.
- Device-local report preview and print-to-PDF, including both household scenarios and assumptions. No report data is uploaded.

## v2 (October 2026)
- Compare is now a household view: Person A, Person B and the household total, each set to Permanent, Contractor outside IR35 or Contractor inside IR35. Sole trader is gone from Compare only (it stays on Calculate). The one-person "same income, three ways" view is a toggle.
- New Other income tab: residential buy to let in your own name (rent, expenses or the 1,000 property allowance, mortgage interest kept apart from capital repaid, ownership share, finance costs brought forward), other earnings and other dividends as yearly amounts. It shows the extra tax the other income causes, including the 20% mortgage interest tax credit, and flows into Compare, the household overview and the PDF report.
- Switch for property rates from April 2027 (22%, 42%, 47%, 22% credit, new income ordering). Everything else stays on 2026/27 rates.
- Not modelled: property losses carried forward, partnerships, furnished holiday lets, non-residential property, Scotland, NI or student loan on other income.
- Sources (gov.uk): tax relief for residential landlords how it's worked out; property and trading allowances; property, savings and dividend rates technical note (26 Nov 2025); form 17 for joint property.
- Tests in `test.js` use the gov.uk landlord examples, the technical note annex example and hand-worked cases.


Deploy retrigger 6 Oct.
