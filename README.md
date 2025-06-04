# yuh2ofx

Convert Yuh statements reports to OFX or CSV format

I use this script to parse PDF statement reports from Yuh Swiss bank
and generate the corresponding OFX file (that can be imported in accounting app)
or CSV file (that can be imported in Portfolio Performance).

Working for statements reports for the following periods:

- december 2024
- january 2025
- february 2025
- march 2025
- april 2025

## Usage

```bash
# Convert to OFX format (default)
node build/index.js input.pdf --currency=CHF

# Convert to CSV format for Portfolio Performance
node build/index.js input.pdf --currency=CHF --format=csv
```

### Command Line Options

- `--currency`: Currency code (e.g., CHF, EUR, USD)
- `--format`: Output format (ofx or csv, defaults to ofx)

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
