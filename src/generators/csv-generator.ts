import { CreditDebit, ParsedFile } from "../types";
import { Generator } from "./generator";

/**
 * CSV file format generator for Portfolio Performance
 */
export class CsvGenerator implements Generator {
  private formatDate(datetime: Date): string {
    const value = datetime.toISOString();
    const year = parseInt(value.substring(0, 4));
    const month = parseInt(value.substring(5, 7));
    const day = parseInt(value.substring(8, 10));
    const result: string =
      year.toString() +
      (month < 10 ? "0" + month : month) +
      (day < 10 ? "0" + day : day);
    return result;
  }

  public generate(parsed: ParsedFile): string {
    const { statements } = parsed;
    let csv = "Datum;Wert;Typ;Notiz;Betrag\n";
    statements.forEach((stmt) => {
      const date = this.formatDate(stmt.date);
      const value = this.formatDate(stmt.valueDate);
      const type = stmt.credit == CreditDebit.Credit ? "Einlage" : "Entnahme";
      const note = `${stmt.payee}${stmt.memo.length ? " - " + stmt.memo : ""}`;
      const amount =
        stmt.credit == CreditDebit.Credit ? stmt.amount : -stmt.amount;
      csv += `${date};${value};${type};${note};${amount}\n`;
    });
    return csv;
  }
}
