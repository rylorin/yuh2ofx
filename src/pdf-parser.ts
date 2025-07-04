import { Page, default as Pdf2Json } from "pdf2json";
import {
  CreditDebit,
  Header,
  ParsedFile,
  Statement,
  YuhCategory,
} from "./types";
import { convertEncoding, hashObject, parseFixed, string2date } from "./utils";

const STATEMENTS_REPORT_HEADER = "Extrait de compte en";

/**
 * Class responsible for parsing PDF files and extracting transaction data
 */
export class PdfParser {
  private readonly pdfreader: Pdf2Json;
  private readonly date_pattern: RegExp;
  private readonly fixed_pattern: RegExp;
  private readonly integer_pattern: RegExp;
  private readonly currency: string;

  constructor(currency: string) {
    this.pdfreader = new Pdf2Json();
    this.date_pattern = new RegExp("^[0-3][0-9]\\.[0-1][0-9]\\.202[3-9]$");
    this.fixed_pattern = new RegExp("^[-+]?[0-9]+\\.[0-9][0-9]$");
    this.integer_pattern = new RegExp("^[0-9]+$");
    this.currency = currency.toUpperCase();
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Load and parse a PDF file
   * @param filename Input file name
   * @returns Promise that resolves with the parsed data
   */
  public async parse(filename: string): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
      this.pdfreader.on("pdfParser_dataError", (errData) => reject(errData));
      this.pdfreader.on("pdfParser_dataReady", (pdfData) => {
        try {
          const parsed = this.extractStatementsFromPages(
            this.extractPagesForCurrency(pdfData.Pages, this.currency),
          );
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
      this.pdfreader.loadPDF(filename).catch(reject);
    });
  }

  /**
   * Find the start of statements section in a page
   * @param page PDF page to scan
   * @returns Currency if found, undefined otherwise
   */
  private findStartOfStatements(page: Page): string | undefined {
    const idx = page.Texts.findIndex((text) => {
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
        dtFrom: string2date(texts[idx + 2].slice(-10)),
        dtTo: string2date(texts[idx + 11].slice(-10)),
        initBalance: parseFixed(texts[idx + 3]),
        finalBalance: parseFixed(texts[idx + 12]),
        debitSum: parseFixed(texts[idx + 6]),
        creditSum: parseFixed(texts[idx + 9]),
      };
      const _dtFromStr = header.dtFrom.toISOString().substring(0, 10);
      const _dtToStr = header.dtTo.toISOString().substring(0, 10);
      header.finalBalance = this.roundToTwoDecimals(
        header.initBalance + header.creditSum - header.debitSum,
      );
      return header;
    }
    return undefined;
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
            .map((item) => convertEncoding(item));
          const category: YuhCategory = stmt[0] as YuhCategory;
          let payee: string;
          let memo: string;
          switch (category) {
            case YuhCategory.Card:
              payee = stmt[2];
              memo = category + " " + stmt.slice(1).join(" ");
              break;
            case YuhCategory.From:
            case YuhCategory.To:
              payee = stmt.slice(0, 2).join(" ");
              memo = stmt.slice(1).join(" ");
              break;
            case YuhCategory.Interests:
              payee = stmt[1];
              memo = "";
              break;
            case YuhCategory.Change:
            case YuhCategory.Buy:
            case YuhCategory.Dividend:
            case YuhCategory.SavingsDeposit:
            case YuhCategory.SavingsWithdrawal:
              payee = category + (stmt[1] ? " " + stmt[1] : "");
              memo =
                category +
                (stmt.length > 1 ? " " + stmt.slice(1).join(" ") : "");
              break;
            default:
              console.error(`${category} not implemented!`); // eslint-disable-line @typescript-eslint/restrict-template-expressions
              /* eslint-disable-next-line @typescript-eslint/restrict-plus-operands */
              payee = category + (stmt[1] ? " " + stmt[1] : "");
              memo =
                category + // eslint-disable-line @typescript-eslint/restrict-plus-operands
                (stmt.length > 1 ? " " + stmt.slice(1).join(" ") : "");
          }
          memo = memo.replaceAll("   ", " ").replaceAll("  ", " ");
          const amount = parseFixed(a[0]);
          const finalBalance = parseFixed(b[0]);
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
            date: string2date(d[0]),
            reference: r ? r[0] : "",
            category,
            amount,
            credit,
            valueDate: string2date(dv[0]),
            balance: finalBalance,
            payee,
            memo,
          };
          if (!statement.reference) {
            statement.reference = hashObject(statement);
          }
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

    const len = pages.length;
    let header: Header | undefined;
    if (len) header = this.parsePageHeader(pages[0]);
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
      if (header.finalBalance != statements[statements.length - 1].balance) {
        console.error(header);
        // Disabled for April 2025 statements
        throw Error(
          `Unconsistent final balance: ${header.finalBalance} vs ${statements[statements.length - 1].balance}`,
        );
      }
      return { header, statements };
    } else {
      throw Error("No header found.");
    }
  }
}
