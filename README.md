# yuh2ofx

Convert Yuh statements reports to OFX or CSV format

I use this script to parse PDF statement reports from Yuh Swiss bank
and generate the corresponding OFX file (that can be imported in accounting app)
or CSV file (that can be imported in Portfolio Performance).

Working for statements reports for the following periods:

- december 2024
- all 2025 monthly statements reports
- 2025 yearly statements report

## Usage

```bash
# Convert to OFX format (default, output to stdout)
node build/index.js input.pdf --currency=CHF

# Convert to OFX format and save to file
node build/index.js input.pdf --currency=CHF --output=output.ofx

# Convert to CSV format for Portfolio Performance (output to stdout)
node build/index.js input.pdf --currency=CHF --format=csv

# Convert to CSV format and save to file
node build/index.js input.pdf --currency=CHF --format=csv --output=output.csv

# Explicitly use stdout with -
node build/index.js input.pdf --currency=CHF --output=-

# Filter transactions by date range
node build/index.js input.pdf --currency=CHF --fromDate=2024-12-01 --toDate=2024-12-31

# Filter and save to file
node build/index.js input.pdf --currency=CHF --fromDate=2024-12-01 --toDate=2024-12-31 --output=filtered.ofx
```

### Command Line Options

- `--currency`: Currency code (e.g., CHF, EUR, USD)
- `--format`: Output format (ofx or csv, defaults to ofx)
- `--output`: Output file path (use '-' for stdout, defaults to stdout)
- `--fromDate`: Filter transactions from this date (YYYY-MM-DD format)
- `--toDate`: Filter transactions to this date (YYYY-MM-DD format)

### Output Formats

#### OFX Format

The OFX format follows the Open Financial Exchange standard and can be imported into various accounting applications including GnuCash.

#### CSV Format

The CSV format follows the Portfolio Performance import format with the following columns:

- Date: Transaction date
- Type: Transaction type
- Note: Reference
- Symbole boursier
- ISIN
- Nom du titre
- Parts
- Montant brut
- Frais
- Impôts / Taxes
- Valeur
- Devise de l'opération

## Development

The project is written in TypeScript and uses a modular architecture with separate generators for each output format:

- `OfxGenerator`: Generates OFX format output
- `CsvGenerator`: Generates CSV format output

Both generators implement the `Generator` interface to ensure consistent behavior.
