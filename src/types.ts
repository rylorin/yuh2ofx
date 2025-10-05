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

export enum YuhCategory {
  Buy = "Achat",
  Dividend = "Dividende",
  Card = "Paiement carte de débit",
  From = "Virement de",
  To = "Virement à",
  Interests = "Intérêts créditeurs",
  Change = "Échange de devises",
  AutoChange = "Change de devises automatique",
  SavingsDeposit = "Dépôt d'épargne",
  SavingsWithdrawal = "Retrait d'épargne",
  CapitalGain = "Gain en capital",
  CardRefund = "Remboursement carte de debit",
}

/**
 * One single statement
 */
export interface Statement {
  date: Date;
  reference: string;
  category: YuhCategory;
  credit: CreditDebit;
  amount: number;
  valueDate: Date;
  balance: number;
  memo: string;
  payee: string;
}
