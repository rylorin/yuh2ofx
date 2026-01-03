import commandLineArgs from "command-line-args";
import { exit } from "node:process";

export interface CliOptions {
  filename: string;
  currency: "EUR" | "CHF" | "USD";
  format: "ofx" | "csv";
  output?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Parse command line arguments
 * @returns Parsed options
 */
export function parseArgs(): CliOptions {
  const optionDefinitions = [
    { name: "filename", type: String, defaultOption: true },
    { name: "currency", type: String },
    { name: "format", type: String, defaultValue: "ofx" },
    { name: "output", type: String },
    { name: "fromDate", type: String },
    { name: "toDate", type: String },
  ];

  try {
    const options = commandLineArgs(optionDefinitions) as CliOptions;
    // console.debug(options);
    options.format = options.format.toLowerCase() as "ofx" | "csv";
    options.currency = options.currency.toUpperCase() as "EUR" | "CHF" | "USD";

    // Validate required arguments
    if (!options.filename) {
      console.error("Error: filename is required");
      console.error(
        "Usage: yuh2ofx --currency <currency> [--format <format>] [--output <file>] [--fromDate <date>] [--toDate <date>]  <filename>",
      );
      console.error("  format: ofx (default) or csv");
      exit(1);
    }

    if (!options.currency) {
      console.error("Error: currency is required");
      console.error(
        "Usage: yuh2ofx <filename> --currency <currency> [--format <format>] [--output <file>] [--fromDate <date>] [--toDate <date>]",
      );
      console.error("  format: ofx (default) or csv");
      exit(1);
    }

    // Validate format
    if (options.format !== "ofx" && options.format !== "csv") {
      console.error('Error: format must be either "ofx" or "csv"');
      exit(1);
    }

    return options;
  } catch (error) {
    console.error("Error parsing command line arguments:", error);
    console.error(
      "Usage: yuh2ofx <filename> --currency <currency> [--format <format>] [--output <file>] [--fromDate <date>] [--toDate <date>]",
    );
    console.error("  format: ofx (default) or csv");
    console.error(
      "  output: output file path (use '-' for stdout, default is stdout)",
    );
    console.error(
      "  fromDate: filter transactions from this date (YYYY-MM-DD)",
    );
    console.error("  toDate: filter transactions to this date (YYYY-MM-DD)");
    exit(1);
  }
}
