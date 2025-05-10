/**
 * Header of a currency's statements report
 */
export interface Header {
  currency: string;
  dtFrom: Date;
  dtTo: Date;
  initBalance: number;
  finalBalance: number;
  creditSum: number;
  debitSum: number;
}

export interface ParsedFile {
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
 * One single statement
 */
export interface Statement {
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
