import crypto from "node:crypto";
import { exit } from "node:process";
import { Output, Page, default as PdfParser } from "pdf2json";

function hashObject(object: Record<string, any>): string {
  if (typeof object != "object") {
    throw new TypeError("Object expected");
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(object), "utf8")
    .digest("hex" as crypto.BinaryToTextEncoding);

  return hash;
}

/**
 * Header of a currency's statements report
 */
interface Header {
  currency: string;
  dtFrom: Date;
  dtTo: Date;
  initBalance: number;
  finalBalance: number;
  creditSum: number;
  debitSum: number;
}

interface ParsedFile {
  header: Header;
  statements: Statement[];
}

/**
 * Credit or debit statement
 */
export const CreditDebit = {
  Credit: "Credit",
  Debit: "Debit",
} as const;
export type CreditDebit = (typeof CreditDebit)[keyof typeof CreditDebit];

/**
 * One sigle statement
 */
interface Statement {
  date: Date;
  reference: string;
  category: string;
  credit: CreditDebit;
  amount: number;
  valueDate: Date;
  balance: number;
  memo: string;
  payee: string;
}

const STATEMENTS_REPORT_HEADER = "Extrait de compte en";

/**
 * Extract statements from a PDF report and generate the corresponding OFX document
 */
class Pdf2Ofx {
  private readonly pdfreader: PdfParser;
  private readonly date_pattern: RegExp;
  private readonly fixed_pattern: RegExp;
  private readonly integer_pattern: RegExp;
  private readonly currency: string;

  constructor(currency: string) {
    this.pdfreader = new PdfParser();
    this.pdfreader.on("pdfParser_dataError", (errData) =>
      console.error(errData),
    );
    this.pdfreader.on("pdfParser_dataReady", (pdfData) =>
      this.handlePdfFile(pdfData),
    );

    this.date_pattern = new RegExp("^[0-3][0-9]\\.[0-1][0-9]\\.202[3-9]$");
    this.fixed_pattern = new RegExp("^[-+]?[0-9]+\\.[0-9][0-9]$");
    this.integer_pattern = new RegExp("^[0-9]+$");
    this.currency = currency.toUpperCase();
  }

  /**
   * Extract statements from given file name
   * @param filename Input file name
   * @returns nothing
   */
  public run(filename: string): Promise<void> {
    return this.pdfreader.loadPDF(filename);
  }

  /**
   * Convert a date to OFX format
   * @param datetime date to format
   * @returns date as string
   */
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

  private formatDateTime(datetime: Date): string {
    const value = datetime.toISOString();
    const year = parseInt(value.substring(0, 4));
    const month = parseInt(value.substring(5, 7));
    const day = parseInt(value.substring(8, 10));
    const hours = parseInt(value.substring(11, 13));
    const mins = parseInt(value.substring(14, 16));
    const secs = parseInt(value.substring(17, 19));

    const result: string =
      year.toString() +
      (month < 10 ? "0" + month : month) +
      (day < 10 ? "0" + day : day);
    const time: string =
      (hours < 10 ? "0" + hours : hours) +
      ":" +
      (mins < 10 ? "0" + mins : mins) +
      ":" +
      (secs < 10 ? "0" + secs : secs);
    return result + " " + time + " UTC";
  }

  /**
   *
   * @param page PDF page to scan
   * @returns
   */
  private findStartOfStatements(page: Page): string | undefined {
    const idx = page.Texts.findIndex((text) => {
      // console.error("text.R", text.R);
      const idx = text.R.findIndex(
        (run) => decodeURIComponent(run.T) == STATEMENTS_REPORT_HEADER,
      );
      return idx >= 0;
    });
    if (idx >= 0) return page.Texts[idx + 1].R[0].T;
    return undefined;
  }

  /**
   * Extract pages related to a given currency
   * @param pages PDF pages
   * @param currency Currency to extract
   * @returns PDF pages
   */
  private extractPagesForCurrency(pages: Page[], currency: string): Page[] {
    let activeCurrency: string | undefined;
    const result: Page[] = [];
    pages.forEach((page) => {
      const isStart = this.findStartOfStatements(page);
      if (isStart == currency) {
        activeCurrency = isStart;
        result.push(page);
      } else if (activeCurrency == currency && !isStart) {
        result.push(page);
      } else if (isStart && isStart !== activeCurrency) {
        activeCurrency = isStart;
      }
    });
    return result;
  }

  /**
   * Extract text data from PDF page
   * @param page PDF Page
   * @returns array of strings
   */
  private extractTextsFromPage(page: Page): string[] {
    let result: string[] = [];
    page.Texts.forEach((text) => {
      result = result.concat(text.R.map((run) => decodeURIComponent(run.T)));
    });
    return result;
  }

  /**
   * Find position of first statement in a page
   * @param texts Text to scan
   * @returns First statement position
   */
  private indexOfFirstStatement(texts: string[]): number | undefined {
    let idx = 0;
    while (idx < texts.length) {
      const j = texts.indexOf("DATE", idx);
      if (j >= idx) {
        if (
          texts[idx + 1] == "INFORMATION" &&
          texts[idx + 5] == "DATE VALEUR" &&
          texts[idx + 6] == "SOLDE ("
        )
          return idx + 9;
        else idx++;
      } else return undefined;
    }
  }

  private parseFixed(text: string): number {
    text = text.trim();
    const minus = text[0] == "-";
    const integerPart = text.slice(0, -3);
    const decimalPart = text.slice(-2);
    const integerValue = parseInt(
      integerPart.replaceAll(",", "").replaceAll("'", ""),
    );
    const decimalValue = parseInt(decimalPart);
    const result = integerValue + (minus ? -decimalValue : decimalValue) / 100;
    return result;
  }

  /**
   * Extract summary from page related to the current currency
   * @param page PDF page to parse
   * @returns Header if found, undefined otherwise
   */
  private parsePageHeader(page: Page): Header | undefined {
    const texts: string[] = this.extractTextsFromPage(page);
    const idx = texts.findIndex((item) => item == STATEMENTS_REPORT_HEADER);
    if (idx >= 0) {
      const header: Header = {
        currency: texts[idx + 1],
        dtFrom: this.string2date(texts[idx + 2].slice(-10)),
        dtTo: this.string2date(texts[idx + 11].slice(-10)),
        initBalance: this.parseFixed(texts[idx + 3]),
        finalBalance: this.parseFixed(texts[idx + 12]),
        debitSum: this.parseFixed(texts[idx + 6]),
        creditSum: this.parseFixed(texts[idx + 9]),
      };
      return header;
    }
    return undefined;
  }

  /**
   * Convert a date from Yuh format
   * @param s Date as string
   * @returns Parsed Date
   */
  private string2date(s: string): Date {
    const dd = parseInt(s.slice(0, 2));
    const mm = parseInt(s.slice(3, 5));
    const yy = parseInt(s.slice(6));
    return new Date(yy, mm - 1, dd, 12);
  }

  private convertEncoding(s: string): string {
    return s
      .replaceAll("‡", "à")
      .replaceAll("È", "é")
      .replaceAll("Í", "ê")
      .replaceAll("Ù", "ô");
  }

  /**
   * Parse one statement from text
   * @param texts Text to parse
   * @param idx Start position
   * @param previousBalance Previous balance amount
   * @returns Parsed statement and next position
   */
  private extractOneStatement(
    texts: string[],
    idx: number,
    previousBalance: number,
  ): { statement: Statement | undefined; index: number; finalBalance: number } {
    const d = texts[idx].match(this.date_pattern);
    if (d) {
      let j = idx + 2;
      while (j + 2 <= texts.length) {
        const r = texts[j - 1].match(this.integer_pattern); // Reference
        const a = texts[j].replaceAll("'", "").match(this.fixed_pattern); // amount (debit/credit)
        const dv = texts[j + 1].match(this.date_pattern); // Date valeur
        const b = texts[j + 2].replaceAll("'", "").match(this.fixed_pattern); // balance (after debit/credit)
        if (a && dv && b) {
          const stmt = texts
            .slice(idx + 1, r ? j - 1 : j)
            .map((item) => this.convertEncoding(item));
          const category = stmt[0] || "undefined";
          let payee: string;
          let memo: string;
          switch (category) {
            case "Paiement carte de débit":
              payee = stmt[2];
              memo = category + " " + stmt.slice(1).join(" ");
              break;
            case "Virement de":
            case "Virement à":
              // console.error("statement:", category, stmt);
              payee = stmt.slice(0, 2).join(" ");
              memo = stmt.slice(1).join(" ");
              break;
            case "Intérêts créditeurs":
              payee = stmt[1];
              memo = "";
              break;
            case "Change de devises automatique":
            case "Achat":
            default: // eslint-disable-line no-fallthrough
              payee = category + (stmt[1] ? " " + stmt[1] : "");
              memo =
                category +
                (stmt.length > 1 ? " " + stmt.slice(1).join(" ") : "");
          }
          memo = memo.replaceAll("   ", " ").replaceAll("  ", " ");
          const amount = this.parseFixed(a[0]);
          const finalBalance = this.parseFixed(b[0]);
          let credit: CreditDebit;
          // Multiply each amount by 100 to get integer number and avoid floating point errors
          if (
            Math.round(previousBalance * 100) + Math.round(amount * 100) ==
            Math.round(finalBalance * 100)
          ) {
            credit = CreditDebit.Credit;
          } else if (
            Math.round(previousBalance * 100) - Math.round(amount * 100) ==
            Math.round(finalBalance * 100)
          ) {
            credit = CreditDebit.Debit;
          } else {
            console.error(
              previousBalance,
              amount,
              finalBalance,
              previousBalance + amount,
              previousBalance - amount,
            );
            console.error(
              Math.round(previousBalance * 100),
              Math.round(amount * 100),
              Math.round(finalBalance * 100),
            );
            throw Error("Credit/Debit statement not consistent.");
          }
          const statement: Statement = {
            date: this.string2date(d[0]),
            reference: r ? r[0] : "",
            category,
            amount,
            credit,
            valueDate: this.string2date(dv[0]),
            balance: finalBalance,
            payee,
            memo,
          };
          if (!statement.reference) {
            statement.reference = hashObject(statement);
            // statement.reference = `${statement.date.getTime()}${statement.credit}${statement.balance}`;
          }
          // console.log(statement);
          return {
            statement,
            index: j + 3,
            finalBalance,
          };
        } else {
          j++;
        }
      }
      return { statement: undefined, index: j, finalBalance: previousBalance };
    }
    // Not a date field at this position
    return {
      statement: undefined,
      index: idx + 1,
      finalBalance: previousBalance,
    };
  }

  /**
   * Parse all statements from a given PDF page
   * @param page PDF page to parse
   * @param previousBalance Previous balance value
   * @returns Parsed statements and final balance
   */
  private extractStatementsFromPage(
    page: Page,
    previousBalance: number,
  ): { statements: Statement[]; finalBalance: number } {
    const texts: string[] = this.extractTextsFromPage(page);
    const statements: Statement[] = [];
    let idx = this.indexOfFirstStatement(texts);
    if (idx) {
      if (texts[idx + 1] == "Solde d'ouverture ") idx += 3;
      while (idx < texts.length) {
        const parsed = this.extractOneStatement(texts, idx, previousBalance);
        idx = parsed.index;
        previousBalance = parsed.finalBalance;
        if (parsed.statement) statements.push(parsed.statement);
      }
    }
    return { statements, finalBalance: previousBalance };
  }

  /**
   * Parse statements from a given pages set
   * @param pages PDF pages to parse
   * @returns headers and statements
   */
  private extractStatementsFromPages(pages: Page[]): ParsedFile {
    let statements: Statement[] = [];

    const header = this.parsePageHeader(pages[0]);
    const len = pages.length;
    if (header) {
      let previousBalance = header.initBalance;
      for (let i = 0; i < len; i++) {
        const parsed = this.extractStatementsFromPage(
          pages[i],
          previousBalance,
        );
        statements = statements.concat(parsed.statements);
        previousBalance = parsed.finalBalance;
      }
      // consistency checks
      const debits =
        Math.round(
          statements.reduce(
            (p, item) =>
              item.credit == CreditDebit.Credit ? p : p + item.amount,
            0,
          ) * 100,
        ) / 100;
      const credits =
        Math.round(
          statements.reduce(
            (p, item) =>
              item.credit == CreditDebit.Credit ? p + item.amount : p,
            0,
          ) * 100,
        ) / 100;
      if (header.debitSum != debits) {
        console.error("Unconsistent total debits.", debits, header);
        throw Error("Unconsistent total debits.");
      }
      if (header.creditSum != credits) {
        console.error("Unconsistent total credits.", credits, header);
        throw Error("Unconsistent total credits.");
      }
      const dtFromStr = header.dtFrom.toISOString().substring(0, 10);
      const dtToStr = header.dtTo.toISOString().substring(0, 10);
      if (header.finalBalance != statements[statements.length - 1].balance)
        if (dtFromStr != "2025-04-01" && dtToStr != "2025-04-30")
          // Disabled for April 2025 statements
          throw Error(
            `Unconsistent final balance: ${header.finalBalance} vs ${statements[statements.length - 1].balance}`,
          );
      return { header, statements };
    } else {
      throw Error("No header found.");
    }
  }

  /**
   * Returns OFX file header
   * @param _parsed unused
   * @returns OFX text
   */
  public outputOfxHeader(_parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
    const ofx = `<?xml version="1.0" encoding="utf-8" ?>
<?OFX OFXHEADER="200" VERSION="202" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
      <DTSERVER>${this.formatDate(new Date())}</DTSERVER>
      <LANGUAGE>ENG</LANGUAGE>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>0</TRNUID>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
    `;
    return ofx;
  }

  /**
   * Returns parsed statements as OFX text
   * @param parsed Result from PDF doc pasing
   * @returns OFX text
   */
  public outputOfxStatements(parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
    const { header, statements } = parsed;
    let ofx = "";
    if (header) {
      ofx = `      <STMTRS>
        <CURDEF>${header.currency}</CURDEF>
        <BANKACCTFROM>
          <BANKID>SWQBCHZZXXX</BANKID>
          <ACCTID>${this.currency}</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${this.formatDate(header.dtFrom)}</DTSTART>
          <DTEND>${this.formatDate(header.dtTo)}</DTEND>
`;
      statements.forEach((stmt) => {
        ofx += `          <STMTTRN>
            <TRNTYPE>${stmt.credit.toUpperCase()}</TRNTYPE>
            <DTPOSTED>${this.formatDate(stmt.date)}</DTPOSTED>
            <TRNAMT>${stmt.credit == CreditDebit.Credit ? stmt.amount : -stmt.amount}</TRNAMT>
            <FITID>${stmt.reference}</FITID>
            <NAME>${stmt.payee}</NAME>
`;
        if (stmt.memo != stmt.payee)
          ofx += `            <MEMO>${stmt.memo}</MEMO>
`;
        ofx += `          </STMTTRN>
`;
      });
      ofx += `        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>${header.finalBalance}</BALAMT>
          <DTASOF>${this.formatDate(header.dtTo)}</DTASOF>
        </LEDGERBAL>
      </STMTRS>
`;
    }
    return ofx;
  }

  /**
   * Returns OFX trailer
   * @param _parsed unused
   * @returns OFX text
   */
  public outputOfxTrailer(_parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
    const ofx = `    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;
    return ofx;
  }

  public outputOfxFile(parsed: ParsedFile): void {
    console.log(this.outputOfxHeader(parsed));
    console.log(this.outputOfxStatements(parsed));
    console.log(this.outputOfxTrailer(parsed));
  }

  /**
   * Returns parsed statements as CSV text compatible with Portfolio Performance
   * @param parsed Result from PDF doc pasing
   * @returns CSV text
   */
  public outputCsvStatements(parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
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

  /**
   * Parse PDF data and output corresponding OFX result
   * @param pdfData PDF file
   * @param format Output format ('ofx' or 'csv')
   */
  public handlePdfFile(pdfData: Output, format: string = "ofx"): void {
    const parsed: ParsedFile = this.extractStatementsFromPages(
      this.extractPagesForCurrency(pdfData.Pages, this.currency),
    );
    if (format === "csv") {
      console.log(this.outputCsvStatements(parsed));
    } else {
      this.outputOfxFile(parsed);
    }
  }
}

if (process.argv.length < 4) {
  console.error(`Usage: ${process.argv[1]} filename currency [format]`);
  console.error("  format: ofx (default) or csv");
  exit(1);
} else {
  const format = process.argv[4] || "ofx";
  if (format !== "ofx" && format !== "csv") {
    console.error('Error: format must be either "ofx" or "csv"');
    exit(1);
  }
  const app = new Pdf2Ofx(process.argv[3]);
  app.run(process.argv[2]).catch((err: Error) => {
    console.error(err);
    exit(1);
  });
}
