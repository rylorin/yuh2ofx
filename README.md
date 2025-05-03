# yuh2ofx

Convert Yuh statements reports to OFX or CSV format

I use this script to parse PDF statement reports from Yuh Swiss bank
and generate the corresponding OFX file (that can be imported in accounting app)
or CSV file (that can be imported in Portfolio Performance).

Working for statements reports for the following periods:

- december 2024
- january 2025
- february 2025

## Usage

```bash
# Convert to OFX format (default)
node build/index.js input.pdf CHF

# Convert to CSV format for Portfolio Performance
node build/index.js input.pdf CHF csv
```

The CSV format follows the Portfolio Performance import format with the following columns:

- Datum: Transaction date
- Wert: Value date
- Typ: Transaction type (Einlage/Entnahme)
- Notiz: Payee and memo
- Betrag: Amount
