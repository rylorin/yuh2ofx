import { CliOptions, parseArgs } from "./cli";
import { CsvGenerator } from "./generators/csv-generator";
import { Generator } from "./generators/generator";
import { OfxGenerator } from "./generators/ofx-generator";
import { PdfParser } from "./pdf-parser";

const STATEMENTS_REPORT_HEADER = "Extrait de compte en";

/**
 * Extract statements from a PDF report and generate the corresponding document
 */
class Pdf2Ofx {
  private readonly parser: PdfParser;
  private readonly generator: Generator;

  constructor(options: CliOptions) {
    this.parser = new PdfParser(options.currency);
    this.generator =
      options.format === "csv" ?
        new CsvGenerator()
      : new OfxGenerator(options.currency);
  }

  /**
   * Extract statements from given file name
   * @param filename Input file name
   * @returns nothing
   */
  public async run(filename: string): Promise<void> {
    try {
      const parsed = await this.parser.parse(filename);
      console.log(this.generator.generate(parsed));
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

// Parse command line arguments and run the application
const options = parseArgs();
const app = new Pdf2Ofx(options);
app.run(options.filename).catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
