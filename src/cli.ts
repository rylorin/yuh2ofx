import commandLineArgs from "command-line-args";
import { exit } from "node:process";

export interface CliOptions {
  filename: string;
  currency: string;
  format: "ofx" | "csv";
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
  ];

  try {
    const options = commandLineArgs(optionDefinitions) as CliOptions;

    // Validate required arguments
    if (!options.filename) {
      console.error("Error: filename is required");
      console.error(
        "Usage: yuh2ofx <filename> --currency <currency> [--format <format>]",
      );
      console.error("  format: ofx (default) or csv");
      exit(1);
    }

    if (!options.currency) {
      console.error("Error: currency is required");
      console.error(
        "Usage: yuh2ofx <filename> --currency <currency> [--format <format>]",
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
      "Usage: yuh2ofx <filename> --currency <currency> [--format <format>]",
    );
    console.error("  format: ofx (default) or csv");
    exit(1);
  }
}
