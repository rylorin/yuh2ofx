import { CreditDebit, ParsedFile, Statement, YuhCategory } from "../types";
import { Generator } from "./generator";

enum CsvCategory {
  Achat = "Achat",
  Dividende = "Dividendes",
  Depot = "Dépôt",
  Retrait = "Retrait",
}

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

  private category2type(stmt: Statement): CsvCategory | undefined {
    let result: CsvCategory;
    switch (stmt.category) {
      case YuhCategory.Buy:
        result = CsvCategory.Achat;
        break;
      case YuhCategory.Dividend:
        result = CsvCategory.Dividende;
        break;
      default:
        if (stmt.credit == CreditDebit.Credit) result = CsvCategory.Depot;
        else result = CsvCategory.Retrait;
    }
    return result;
  }

  public generate(parsed: ParsedFile): string {
    const { statements } = parsed;
    let csv =
      "Date;Type;Note;Symbole boursier;ISIN;Nom du titre;Parts;Montant brut;Frais;Impôts / Taxes;Valeur;Devise de l'opération\n";
    statements.forEach((stmt) => {
      let p1: number;
      let p2: number;

      const date = this.formatDate(stmt.date);
      const category = this.category2type(stmt);
      let ticker = "";
      let securityName = "";
      let shares = "";
      let price = "";
      let fees = "";
      let taxe = "";
      let isin = "";

      switch (category) {
        case CsvCategory.Achat:
        case CsvCategory.Dividende:
          {
            // parse ticker symbol, text included between parentheses
            p1 = stmt.memo.indexOf("(");
            p2 = stmt.memo.indexOf(")", p1 + 1);
            //  const parentheses = stmt.memo.match(/\([A-Z]{1,5}\)/);
            //   const ticker = parentheses ? parentheses[0].slice(1, -1) : "";
            ticker = stmt.memo.substring(p1 + 1, p2);
            // Security name
            securityName = stmt.payee.substring(stmt.category.length + 1);
            // Parse shares after "Quantité: ""
            p1 = stmt.memo.indexOf("Quantité: ");
            p2 = stmt.memo.indexOf(" ", p1 + 10);
            shares = stmt.memo.substring(p1 + 10, p2).replace(".", ",");
            // Parse average price after "Prix: XXX "
            p1 = stmt.memo.indexOf("Prix: ");
            p2 = stmt.memo.indexOf(" ", p1 + 6 + 4);
            price = stmt.memo.substring(p1 + 6 + 4, p2).replace(".", ",");
            // Parse Fees from "Commission: XXX "
            p1 = stmt.memo.indexOf("Commission: ");
            p2 = stmt.memo.indexOf(" ", p1 + 12 + 4);
            if (p1 >= 0)
              fees = stmt.memo.substring(p1 + 12 + 4, p2).replace(".", ",");
            else fees = "0";
            // Parse Taxe from "Taxe: XXX "
            p1 = stmt.memo.indexOf("Taxe: ");
            p2 = stmt.memo.indexOf(" ", p1 + 6 + 4);
            taxe = stmt.memo.substring(p1 + 6 + 4, p2).replace(".", ",");
            // Parse ISIN from "ISIN: "
            p1 = stmt.memo.indexOf("ISIN: ");
            if (p1 >= 0) isin = stmt.memo.substring(p1 + 6);
            else isin = "";
          }
          break;
      }

      // Convert amount to string
      const amount = `${stmt.amount}`.replace(".", ",");

      // csv += `${stmt.payee}${stmt.memo.length ? " - " + stmt.memo : ""}\n`;
      if (category)
        csv += `${date};${category};${stmt.reference};${ticker};${isin};${securityName};${shares};${price};${fees};${taxe};${amount};${parsed.header.currency}\n`;
    });
    return csv;
  }
}
