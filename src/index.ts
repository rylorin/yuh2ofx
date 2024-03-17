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

type Statement = {
  date: Date;
  information: string;
  reference: string;
  debit: number;
  credit: number;
  valueDate: Date;
  balance: number;
};

class MyApp {
  private readonly pdfreader: PdfParser;
  private readonly date_pattern: RegExp;
  private readonly fixed_pattern: RegExp;
  private readonly integer_pattern: RegExp;

  constructor() {
    this.pdfreader = new PdfParser();
    this.pdfreader.on("pdfParser_dataError", (errData) =>
      console.error(errData),
    );
    this.pdfreader.on("pdfParser_dataReady", (pdfData) =>
      this.handlePdfFile(pdfData),
    );

    this.date_pattern = new RegExp("[0-3][0-9]\\.[0-1][0-9]\\.202[3-9]");
    this.fixed_pattern = new RegExp("[0-9]+\\.[0-9][0-9]");
    this.integer_pattern = new RegExp("[0-9]+");
  }

  public run(filename: string, currency: string): void {
    this.pdfreader.loadPDF(process.argv[2]);
  }

  private formatDate(datetime: Date): string {
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
    let found = false;
    let idx = 0;
    while (!found) {
      let j = texts.indexOf("Date", idx);
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

  private parsePageHeader(texts: string[]): Header | undefined {
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
  ): [Statement | undefined, number] {
    const d = texts[idx].match(this.date_pattern);
    if (d) {
      console.log(texts[idx], texts[idx + 1], d);
      let j = idx + 2;
      while (j < texts.length) {
        console.log(
          `'${texts[j - 1]}' '${texts[j]}' '${texts[j + 1]}' '${texts[j + 2]}'`,
        );
        const r = texts[j - 1].match(this.integer_pattern);
        const a = texts[j].match(this.fixed_pattern);
        const dv = texts[j + 1].match(this.date_pattern);
        const b = texts[j + 2].match(this.fixed_pattern);
        console.log("extractOneStatement", r, a, dv, b);
        if (a && dv && b) {
          // Statement pattern
          const information: string = texts
            .slice(idx + 1, r ? j - 1 : j)
            .join(" ");
          return [
            {
              date: this.string2date(d[0]),
              reference: r ? r[0] : "",
              debit: parseFloat(a[0]),
              credit: -parseFloat(a[0]),
              valueDate: this.string2date(dv[0]),
              balance: parseFloat(b[0]),
              information,
            },
            j + 5,
          ];
        } else {
          j++;
        }
      }
      return [undefined, j];
    }
    return [undefined, idx + 1];
  }

  private extractStatementsFromPage(
    page: Page,
    first: boolean,
    last: boolean,
  ): Statement[] {
    const texts: string[] = this.extractTextsFromPage(page);
    if (first) this.parsePageHeader(texts);
    let idx = this.indexOfFirstStatement(texts);
    if (idx) {
      console.log("first statement", texts[idx], texts[idx + 1]);
      console.log(this.extractOneStatement(texts, idx));
    }
    return [];
  }

  private exportStatementsFromPages(pages: Page[]): string {
    const statements: Statement[] = [];
    const len = pages.length;
    const result = "";
    for (let i = 0; i < len; i++)
      statements.concat(
        this.extractStatementsFromPage(pages[i], i == 0, i == len - 1),
      );
    statements.forEach((stmt) =>
      result.concat(`					<STMTTRN>
    <TRNTYPE>DEBIT</TRNTYPE>
    <DTPOSTED>20231130</DTPOSTED>
    <TRNAMT>-0.49</TRNAMT>
    <FITID>202311300127</FITID>
    <NAME>GOOGLE*GOOGLE PLAY APP G.CO-HELPPAY# D02 R296 G.CO-HELPPAY# </NAME>
  </STMTTRN>
`),
    );
    return result;
  }

  public handlePdfFile(pdfData: Output): void {
    console.log(`<?xml version="1.0" encoding="utf-8" ?>
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
    `);

    console.log(
      this.exportStatementsFromPages(
        this.filterPagesForCurrency(pdfData.Pages, "EUR"),
      ),
    );

    console.log(`	</BANKMSGSRSV1>
</OFX>
`);
  }
}

const app = new MyApp();
app.run(process.argv[2], "EUR");
