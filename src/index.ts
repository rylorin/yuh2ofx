import { writeFileSync } from "node:fs";
import { CliOptions, parseArgs } from "./cli";
import { CsvGenerator } from "./generators/csv-generator";
import { Generator } from "./generators/generator";
import { OfxGenerator } from "./generators/ofx-generator";
import { PdfParser } from "./pdf-parser";

// const STATEMENTS_REPORT_HEADER = "Extrait de compte en";

/**
 * Extract statements from a PDF report and generate the corresponding document
 */
class Pdf2Ofx {
  private readonly parser: PdfParser;
  private readonly generator: Generator;

  constructor(options: CliOptions) {
    this.parser = new PdfParser(
      options.currency,
    );
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
  public async run(options: CliOptions): Promise<void> {
    const { filename, output, fromDate, toDate } = options;
    try {
      const parsed = await this.parser.parse(filename);
      if (fromDate) {
        const dtFrom = new Date(fromDate);
        parsed.statements = parsed.statements.filter(
          (item) => item.date >= dtFrom,
        );
        parsed.header.dtFrom = dtFrom;
      }
      if (toDate) {
        const dtTo = new Date(toDate);
        parsed.statements = parsed.statements.filter(
          (item) => item.date <= dtTo,
        );
        parsed.header.dtTo = dtTo;
      }
      // console.debug(fromDate, toDate, parsed.header, parsed.statements.length);
      const generatedContent = this.generator.generate(parsed);

      if (output && output !== "-") {
        // Write to file
        writeFileSync(output, generatedContent, "utf8");
        console.error(`Output written to: ${output}`);
      } else {
        // Write to stdout (default behavior)
        console.log(generatedContent);
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

// Parse command line arguments and run the application
const options = parseArgs();
const app = new Pdf2Ofx(options);
app.run(options).catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
