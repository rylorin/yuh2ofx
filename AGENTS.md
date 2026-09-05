# AGENTS.md

Guide for AI coding agents working on this repository.

## Project Overview

**yuh2ofx** (`@rylorin/yuh2ofx`) is a MIT-licensed Node.js **command-line tool** that converts **PDF statement reports from the Yuh Swiss bank** into two output formats:

- **OFX** (Open Financial Exchange) — importable into accounting apps such as GnuCash.
- **CSV** — formatted for **Portfolio Performance** import.

It is published to npm as a globally-installable CLI (`yuh2ofx`) and used via `npx`. The PDF text is French, so the domain vocabulary below matters for correct parsing.

### Expected input statements (PDF reports)

The parser is expected to work with:

- December 2024
- All 2025 monthly statements
- 2025 yearly statements
- All 2026 monthly statements

> ⚠️ The parsing logic is tightly coupled to the exact layout/headers of these specific Yuh PDF reports. Changes to the parser must preserve compatibility with all of these.

## Tech Stack & Tooling

- **Language:** TypeScript (strict), target **ES2021**, `module`/`moduleResolution` = **NodeNext** (emits **CommonJS**, since `package.json` has no `"type": "module"`). The project is prepared for a future **TypeScript 7 / tsgo** upgrade — see the TS7 section below.
- **Runtime:** Node.js **>= 22.22.3** (pinned in CI to 22.22.3).
- **Package manager:** Yarn (classic v1 — `yarn.lock`).
- **Key dependencies:**
  - `pdf2json` (^4.0.3) — PDF → JSON text extraction. Default import is `Pdf2Json`; the `Page` type is exported.
  - `command-line-args` (^6.0.2) — CLI argument parsing.
- **Linting/formatting:** ESLint (flat config, `typescript-eslint` strict + stylistic), Prettier (with `experimentalTernaries: true`).
- **Git hooks:** Husky + lint-staged (`yarn test` runs on pre-commit).

## Project Structure

```
src/
  index.ts                        # Entry point (#! /usr/bin/env node). Pdf2Ofx orchestrator.
  cli.ts                          # CliOptions interface + parseArgs() (CLI arg parsing & validation)
  types.ts                        # Domain types: Header, ParsedFile, Statement, YuhCategory, CreditDebit
  pdf-parser.ts                   # PdfParser: PDF → ParsedFile (text extraction + statement parsing)
  utils.ts                        # Helpers: hashObject, string2date, convertEncoding, parseFixed
  generators/
    generator.ts                  # Generator interface: generate(parsed: ParsedFile): string
    ofx-generator.ts              # OfxGenerator (implements Generator)
    csv-generator.ts              # CsvGenerator (implements Generator)
dist/                             # Build output (gitignored) — tsc emits here
.github/workflows/
  qc.yml                          # Quality check (lint + test) on push
  npm-publish.yml                 # Version bump + publish to npm on release/push to main
```

## Commands

```bash
yarn build        # tsc --project tsconfig.json → emits to dist/
yarn dev          # ts-node-dev watch mode, src/index (NODE_ENV=development)
yarn start        # node dist/index.js (NODE_ENV=production)
yarn lint         # eslint ./src
yarn type-check   # tsc --noEmit
yarn qc           # lint + type-check + prettier --check .
yarn test         # = yarn qc  (there is no unit-test suite — "test" runs quality checks)
```

**Always run `yarn qc` (or at least `yarn lint` + `yarn type-check`) before finishing a change** — this is what CI (`.github/workflows/qc.yml`) and the pre-commit hook enforce.

## TypeScript 7 (tsgo) Readiness

The codebase has been migrated off the deprecated module-resolution path so it can move to TS 7 (the native `tsgo` compiler) without friction:

- **`module`/`moduleResolution` are `NodeNext`.** This was required: under `module: CommonJS` the resolution defaults to `node10`, which TS 6.0.3 flags as _"deprecated and will stop functioning in TypeScript 7.0"_, and `module: CommonJS` has no surviving `moduleResolution` pairing in TS 7 (`node10`/`classic` are removed; `node16`/`nodenext` force `module` to `node16`/`nodenext`; `bundler` is for bundler projects, not a plain Node CLI).
- **The package stays CommonJS** (no `"type": "module"` in `package.json`), so relative imports need **no `.js` extensions** — the ESM-only requirement for explicit extensions does not apply to CJS files, and adding them breaks `ts-node-dev` (ts-node 10.9.2 cannot resolve `./x.js` → `./x.ts` for CJS). Do **not** add `.js` extensions unless the package is converted to ESM.
- **Type-only imports use `import type`** (e.g. `import { CreditDebit, type ParsedFile } from "../types"`). This is tsgo-friendly hygiene and must be kept when touching imports.
- **Do NOT enable `verbatimModuleSyntax`** — it fails on this codebase because it mixes ESM `import`/`export` syntax with CommonJS emit. Enabling it would require converting to ESM (`"type": "module"`) or rewriting all files to `import =`/`export =`. Out of scope.
- If you ever do the full TS 7 migration: switch the compiler to `tsgo`/`typescript@next` (7.x), keep NodeNext, and re-run `yarn qc` + a real PDF end-to-end test.

## CLI Usage

```
yuh2ofx <filename> --currency <CUR> [--format ofx|csv] [--output <file>] [--fromDate <date>] [--toDate <date>]
```

- `--currency`: required, one of `EUR` | `CHF` | `USD` (case-insensitive input, uppercased internally).
- `--format`: `ofx` (default) or `csv`.
- `--output`: file path; `-` or omitted → stdout.
- `--fromDate` / `--toDate`: `YYYY-MM-DD`, filter statements (also override `header.dtFrom`/`dtTo`).

Validation rules in `cli.ts`: filename and currency are required, format must be `ofx`/`csv` — otherwise the process exits with code 1.

## Core Data Model (`src/types.ts`)

```ts
interface Header {
  currency: string; // "CHF", "EUR", "USD"
  dtFrom: Date; // statement period start
  dtTo: Date; // statement period end
  initBalance: number; // opening balance
  finalBalance: number; // closing balance (recomputed in parser: init + creditSum - debitSum)
  creditSum: number; // sum of credits
  debitSum: number; // sum of debits
}

interface ParsedFile {
  header: Header;
  statements: Statement[];
}

interface Statement {
  date: Date; // transaction date
  reference: string; // FITID / Note; generated via sha256 hash if absent from PDF
  category: YuhCategory;
  credit: CreditDebit; // "Credit" | "Debit"
  amount: number; // always positive
  valueDate: Date;
  balance: number; // running balance after this statement
  memo: string;
  payee: string;
}

const CreditDebit = { Credit: "Credit", Debit: "Debit" } as const;
```

### `YuhCategory` enum — French values from the PDF (case-sensitive, used in parsing)

| Member              | Value (French)                  |
| ------------------- | ------------------------------- |
| `Buy`               | `Achat`                         |
| `Dividend`          | `Dividende`                     |
| `Card`              | `Paiement carte de débit`       |
| `From`              | `Virement de`                   |
| `To`                | `Virement à`                    |
| `Interests`         | `Intérêts créditeurs`           |
| `Change`            | `Échange de devises`            |
| `AutoChange`        | `Change de devises automatique` |
| `SavingsDeposit`    | `Dépôt d'épargne`               |
| `SavingsWithdrawal` | `Retrait d'épargne`             |
| `CapitalGain`       | `Gain en capital`               |
| `CardRefund`        | `Remboursement carte de debit`  |

> The category string is `stmt[0]` cast directly to `YuhCategory`. If a new statement type appears in a report, it hits the `default` branch (logs "not implemented!") and produces a degraded payee/memo — adding new categories here is a common change.

## Architecture & Flow

**`src/index.ts`** is the entry point:

1. `parseArgs()` reads/validates CLI options.
2. `Pdf2Ofx` constructor selects a generator: `CsvGenerator` for csv, `OfxGenerator(currency)` otherwise.
3. `run()`: `PdfParser(currency).parse(filename)` → apply date filters → `generator.generate(parsed)` → write to file or stdout.

**`PdfParser` (`pdf-parser.ts`)** is the heart of the tool:

- Scans PDF pages for the section header `"Extrait de compte en"` (constant `STATEMENTS_REPORT_HEADER`), and selects pages matching the requested currency (`extractPagesForCurrency`).
- Parses the account header block (`parsePageHeader`) at fixed text offsets — **these offsets depend on the PDF layout**.
- Extracts each statement (`extractOneStatement`) using three regexes:
  - `date_pattern`: `^[0-3][0-9]\.[0-1][0-9]\.202[3-9]$` (DD.MM.YYYY, years 2023–2029)
  - `fixed_pattern`: `^[-+]?[0-9]+\.[0-9][0-9]$` (monetary amounts)
  - `integer_pattern`: `^[0-9]+$` (reference)
- Determines Credit vs Debit by checking whether `prevBalance ± amount == finalBalance` (integer math via `*100` to avoid float errors). Throws `"Credit/Debit statement not consistent."` otherwise.
- Runs consistency checks against the header (total debits, total credits, final balance) and throws on mismatch.
- If a statement has no reference, one is generated from a sha256 hash of the statement object (`hashObject`).

**Generators** implement `generate(parsed: ParsedFile): string`:

- `OfxGenerator` — builds the OFX XML (SGML-style `<?OFX ...?>` header + `<OFX>` block). `TRNTYPE` is `CREDIT`/`DEBIT`; `TRNAMT` is signed (`-amount` for debits); `FITID` = statement reference.
- `CsvGenerator` — maps `YuhCategory` → `CsvCategory` (Achat/Dividendes/Dépôt/Retrait/Intérêts), then extracts ticker, ISIN, security name, shares, price, fees, tax from the memo string via substring parsing (e.g. `"Quantité: "`, `"Prix: "`, `"Commission: "`, `"Taxe: "`, `"ISIN: "`). The CSV header is the fixed Portfolio Performance column set. **Note:** the CSV header row repeats `Montant brut en devise` as both the 8th and last (13th) column, and the value column uses `parsed.header.currency`.

## Key Gotchas / Conventions

- **Money as floats:** amounts are numbers; the code avoids float errors by multiplying by 100 and rounding before comparisons. When comparing, use integer math (`Math.round(x * 100)`) rather than raw equality.
- **Dates:** `string2date` parses `DD.MM.YYYY` and creates a `Date` at hour **12:00** (noon) — this deliberately avoids timezone/`toISOString` day-shift issues. Dates are formatted to `YYYYMMDD` in generators via `toISOString()`.
- **Special characters in PDFs** are malformed; `convertEncoding` remaps `‡→à`, `È→é`, `Í→ê`, `Ù→ô`, `…→É`. Extend this map if new accented chars appear.
- **Text decoding:** PDF text runs are `decodeURIComponent(run.T)`; grouping separators `'` and thousands separators `,` are stripped when parsing numbers (`parseFixed`, `.replaceAll("'", "")`).
- **`hashObject`** uses sha256 of `JSON.stringify(object)`.
- **`explicit-any` is allowed** (`@typescript-eslint/no-explicit-any: "off"`), and non-null assertions are permitted.
- **Error handling:** the CLI `parseArgs` and `Pdf2Ofx.run` log to `console.error` and exit(1) on failure. `process.exit(1)` on top-level catch.
- **Console output:** real output goes to `stdout` (`console.log`); status/progress/errors go to `stderr` (`console.error`). Don't mix the two — the generated document on stdout must stay clean.

## ESLint Rules of Note (src only)

Strict type-aware rules are enabled: `no-floating-promises`, `no-misused-promises`, `no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-return`, `unbound-method`, `restrict-plus-operands`, `restrict-template-expressions`, `explicit-function-return-type`, `explicit-module-boundary-types`. `no-console` is off. The config ignores `node_modules/*`, `build/*`, `**/*.spec.ts`, and `*.config.mjs`.

## CI / Publishing

- **`qc.yml`** — on push (ignoring README/LICENSE/build workflow): `yarn install --frozen-lockfile` → `yarn lint` → `yarn test`. Node 22.22.3, Yarn cache. Timeout 3 min.
- **`npm-publish.yml`** — on GitHub release **or** push to `main`: install → `yarn build` → auto version-bump (`phips28/gh-action-bump-version`) → `npm publish` with `NPM_TOKEN`.
- Publishing requires `package.json` version changes to be intentional; the version-bump action handles it for pushes to main.
- Commit messages use a conventional style (see git history: "Currency added to CSV export", "packages upgrade", etc.) and end with a `Co-Authored-By: Claude Code <noreply@anthropic.com>` trailer when Claude-authored.

## Workflow Guidance for Agents

1. **Read before you edit** — the parser and generators share implicit assumptions about the PDF layout and data model (`src/types.ts` is the contract).
2. **Prefer the generator pattern** — new output formats implement the `Generator` interface in `src/generators/`; add a `--format` value in `cli.ts` and wire it in `index.ts`.
3. **Adding a new statement category** touches several places: `YuhCategory` in `types.ts`, the switch in `pdf-parser.ts::extractOneStatement`, and possibly the `CsvGenerator.category2type` mapping.
4. **Never break compatibility** with the known report formats listed in the README; the parser's fixed text offsets and regexes are layout-dependent.
5. **Validate with `yarn qc`** before committing. There is no unit test suite — correctness is verified by running the tool against real PDFs (use `yarn dev` / `yarn start`).
6. **Output cleanliness:** when testing the CLI, note that the OFX/CSV document goes to stdout and diagnostics to stderr.
