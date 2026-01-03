import { CreditDebit, ParsedFile } from "../types";
import { Generator } from "./generator";

/**
 * OFX file format generator
 */
export class OfxGenerator implements Generator {
  private readonly currency: string;

  constructor(currency: string) {
    this.currency = currency.toUpperCase();
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

  private generateHeader(): string {
    return `<?xml version="1.0" encoding="utf-8" ?>
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
  }

  private generateStatements(parsed: ParsedFile): string {
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
        if (stmt.memo.length && stmt.memo != stmt.payee)
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

  private generateTrailer(): string {
    return `    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;
  }

  public generate(parsed: ParsedFile): string {
    return (
      this.generateHeader() +
      this.generateStatements(parsed) +
      this.generateTrailer()
    );
  }
}
