import { Output, Page, default as PdfParser } from "pdf2json";

type Header = {
  currency: string;
  dtFrom: Date;
  dtTo: Date;
  initBalance: number;
  finalBalance: number;
  creditSum: number;
  debitSum: number;
};

export const CreditDebit = {
  Credit: "Credit",
  Debit: "Debit",
} as const;
export type CreditDebit = (typeof CreditDebit)[keyof typeof CreditDebit];

type Statement = {
  date: Date;
  information: string;
  reference: string;
  credit: CreditDebit;
  amount: number;
  valueDate: Date;
  balance: number;
};

class MyApp {
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
    this.fixed_pattern = new RegExp("^[0-9]+\\.[0-9][0-9]$");
    this.integer_pattern = new RegExp("^[0-9]+$");
    this.currency = currency;
  }

  public run(filename: string): Promise<void> {
    return this.pdfreader.loadPDF(filename);
  }

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

  private isStartOfCurrencyStatements(page: Page): string | undefined {
    const idx = page.Texts.findIndex((text) => {
      const idx = text.R.findIndex(
        (run) => decodeURIComponent(run.T) == "EXTRAIT DE COMPTE en",
      );
      return idx >= 0;
    });
    if (idx >= 0) return page.Texts[idx + 1].R[0].T;
    return undefined;
  }

  private filterPagesForCurrency(pages: Page[], currency: string): Page[] {
    let activeCurrency: string | undefined;
    const result: Page[] = [];
    pages.forEach((page) => {
      const isStart = this.isStartOfCurrencyStatements(page);
      // console.log("filterPagesForCurrency", activeCurrency, isStart);
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

  private displayPage(page: Page): void {
    console.log("displaypage");
    page.Texts.forEach((text) =>
      text.R.forEach((run) => console.log(decodeURIComponent(run.T))),
    );
  }

  private extractTextsFromPage(page: Page): string[] {
    let result: string[] = [];
    page.Texts.forEach((text) => {
      result = result.concat(text.R.map((run) => decodeURIComponent(run.T)));
    });
    return result;
  }

  private indexOfFirstStatement(texts: string[]): number | undefined {
    let idx = 0;
    while (idx < texts.length) {
      const j = texts.indexOf("Date", idx);
      if (j >= idx) {
        if (
          texts[idx + 1] == "Information" &&
          texts[idx + 5] == "Date" &&
          texts[idx + 6] == "valeur" &&
          texts[idx + 7] == "Solde "
        )
          return idx + 8;
        else idx++;
      } else return undefined;
    }
  }

  private parsePageHeader(page: Page): Header | undefined {
    const texts: string[] = this.extractTextsFromPage(page);
    const idx = texts.findIndex((item) => item == "EXTRAIT DE COMPTE en");
    if (idx >= 0) {
      const header: Header = {
        currency: texts[idx + 1],
        dtFrom: this.string2date(texts[idx + 2].slice(-10)),
        dtTo: this.string2date(texts[idx + 8].slice(-10)),
        initBalance: parseFloat(texts[idx + 3]),
        finalBalance: parseFloat(texts[idx + 9]),
        debitSum: parseFloat(texts[idx + 5]),
        creditSum: parseFloat(texts[idx + 7]),
      };
      // console.log(texts.slice(idx, idx + 20), header);
      return header;
    }
    return undefined;
  }

  private string2date(s: string): Date {
    const dd = parseInt(s.slice(0, 2));
    const mm = parseInt(s.slice(3, 5));
    const yy = parseInt(s.slice(6));
    return new Date(yy, mm - 1, dd, 12);
  }

  private extractOneStatement(
    texts: string[],
    idx: number,
    previousBalance: number,
  ): { statement: Statement | undefined; index: number; finalBalance: number } {
    const d = texts[idx].match(this.date_pattern);
    if (d) {
      // console.log(texts[idx], texts[idx + 1], d);
      let j = idx + 2;
      while (j < texts.length) {
        const r = texts[j - 1].match(this.integer_pattern);
        const a = texts[j].match(this.fixed_pattern);
        const dv = texts[j + 1].match(this.date_pattern);
        const b = texts[j + 2].match(this.fixed_pattern);
        if (a && dv && b) {
          // Statement pattern
          // console.log("extractOneStatement", texts.slice(idx, j + 3));
          const information: string = texts
            .slice(idx + 1, r ? j - 1 : j)
            .join(" ");
          const amount = parseFloat(a[0]);
          const finalBalance = parseFloat(b[0]);
          let credit: CreditDebit;
          // Multiply each amount by 100 to get integer number and avoid floating point errors
          if (
            Math.round((previousBalance + amount) * 100) / 100 ==
            finalBalance
          )
            credit = CreditDebit.Credit;
          else if (
            Math.round((previousBalance - amount) * 100) / 100 ==
            finalBalance
          )
            credit = CreditDebit.Debit;
          else {
            console.error(
              previousBalance,
              amount,
              finalBalance,
              previousBalance + amount,
              previousBalance - amount,
            );
            throw "Unconsistent Credit/Debit statement.";
            credit = CreditDebit.Credit;
          }
          const statement: Statement = {
            date: this.string2date(d[0]),
            reference: r ? r[0] : "",
            amount,
            credit,
            valueDate: this.string2date(dv[0]),
            balance: finalBalance,
            information,
          };
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

  private extractStatementsFromPage(
    page: Page,
    previousBalance: number,
  ): { statements: Statement[]; finalBalance: number } {
    const texts: string[] = this.extractTextsFromPage(page);
    const statements: Statement[] = [];
    let idx = this.indexOfFirstStatement(texts);
    if (idx) {
      while (idx < texts.length) {
        const parsed = this.extractOneStatement(texts, idx, previousBalance);
        idx = parsed.index;
        previousBalance = parsed.finalBalance;
        if (parsed.statement) statements.push(parsed.statement);
      }
    }
    return { statements, finalBalance: previousBalance };
  }

  private extractStatementsFromPages(pages: Page[]): {
    header: Header | undefined;
    statements: Statement[];
  } {
    let result = "";
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
      // console.log("all statements", statements);
      // consistency checks
      const debits = statements.reduce(
        (p, item) => (item.credit == CreditDebit.Credit ? p : p + item.amount),
        0,
      );
      const credits = statements.reduce(
        (p, item) => (item.credit == CreditDebit.Credit ? p + item.amount : p),
        0,
      );
      if (header.debitSum != debits) throw "Unconsistent total debits.";
      if (header.creditSum != credits) throw "Unconsistent total credits.";
      if (header.finalBalance != statements[statements.length - 1].balance)
        throw "Unconsistent final balance.";
    }

    return { header, statements };
  }

  public outputOfxHeader(parsed: {
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
    // console.log(ofx);
    return ofx;
  }

  public outputOfxStatements(parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
    const { header, statements } = parsed;
    let ofx: string = "";
    if (header) {
      ofx = `
      <STMTRS>
        <CURDEF>EUR</CURDEF>
        <BANKACCTFROM>
          <BANKID>SWQBCHZZXXX</BANKID>
          <ACCTID>CH12 XXX</ACCTID>
          <ACCTTYPE>TRADING</ACCTTYPE>
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
            <NAME>${stmt.information}</NAME>
          </STMTTRN>
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
    // console.log(ofx);
    return ofx;
  }

  public outputOfxTrailer(parsed: {
    header: Header | undefined;
    statements: Statement[];
  }): string {
    const ofx = `    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;
    // console.log(ofx);
    return ofx;
  }

  public handlePdfFile(pdfData: Output): void {
    const parsed = this.extractStatementsFromPages(
      this.filterPagesForCurrency(pdfData.Pages, this.currency),
    );
    console.log(this.outputOfxHeader(parsed));
    console.log(this.outputOfxStatements(parsed));
    console.log(this.outputOfxTrailer(parsed));
  }
}

const app = new MyApp(process.argv[3]);
app.run(process.argv[2]);
