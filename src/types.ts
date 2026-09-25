export type Client = {
  id: string;
  name: string;
  ice: string;
  sector: string;
  alias: string;
  city: string;
  email: string;
  phone: string;
  notes: string;
  billingModel: 'monthly' | 'oneoff';
  relationshipStatus: 'client' | 'former' | 'prospect' | 'upcoming';
  monthlyStart: string;
  monthlyEnd: string;
  monthlyAmountHt: number | null;
  billingDay: number | null;
};

export type Line = {
  id: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
};

export type Payment = { id: string; date: string; amount: number; note: string };

export type Company = {
  name: string;
  address: string;
  ice: string;
  phone: string;
  email: string;
  rc: string;
  if: string;
  logoDataUrl?: string;
  stampDataUrl?: string;
};

export type Document = {
  id: string;
  kind: 'invoice' | 'quote';
  reference: string;
  originalReference: string;
  clientId: string;
  clientNameSnapshot: string;
  clientIceSnapshot: string;
  issuedAt: string;
  createdAt: string;
  category: 'monthly' | 'oneoff';
  periodStart: string;
  periodEnd: string;
  subject: string;
  dueAt: string;
  vatRate: number;
  lines: Line[];
  payments: Payment[];
  paymentVerified: boolean;
  notes: string;
  source: string;
  sourceUrl?: string;
  historical?: boolean;
  provisional?: boolean;
  historicalHt?: number;
  historicalTtc?: number;
  historicalPaymentStatus?: 'paid' | 'open' | 'unknown';
  historicalPaidAt?: string;
};

export type ImportRow = {
  id: string;
  reference: string;
  rawClient: string;
  clientId: string;
  sheetDate: string;
  invoiceDate: string;
  amountHt: number | null;
  amountTtc: number | null;
  description: string;
  sourceStatus: string;
  paymentDate: string;
  sourceFile: string;
  sourceUrl: string;
  sheetRow: number;
  disposition?: 'integrated' | 'review' | 'reserved' | 'excluded';
  reviewReason?: string;
};

export type CashEntry = { id: string; date: string; amount: number; service: string; clientId: string; invoiceId: string; note: string };

export type ExpenseCategory = 'electricity' | 'water' | 'internet' | 'cloud' | 'subscription' | 'office' | 'bonus' | 'other';
export type PaymentMethod = 'cash' | 'bank' | 'other';
export type Expense = { id: string; date: string; label: string; amount: number; category: ExpenseCategory; paymentMethod: PaymentMethod; person: string; note: string; paid: boolean; recurrenceId: string; month: string };
export type RecurringExpense = { id: string; label: string; amount: number; category: ExpenseCategory; paymentMethod: PaymentMethod; person: string; note: string; startMonth: string; endMonth: string };

export type Database = { company: Company; clients: Client[]; documents: Document[]; imports: ImportRow[]; cashEntries: CashEntry[]; expenses: Expense[]; recurringExpenses: RecurringExpense[] };
