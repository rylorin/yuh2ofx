import { ParsedFile } from "../types";

/**
 * Interface for file format generators
 */
export interface Generator {
  generate(parsed: ParsedFile): string;
}
