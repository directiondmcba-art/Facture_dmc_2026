import type { Company, Database, Document, Expense } from './types';

export const COMPANY: Company = {
  name: 'DMC',
  address: '',
  ice: '',
  phone: '',
  email: '',
  rc: '',
  if: '',
};

export const seed: Database = { company: COMPANY, clients: [], documents: [], imports: [], cashEntries: [], expenses: [], recurringExpenses: [] };

const KEY = 'dmc-crm-v1';

export function normalizeData(parsed: Database): Database {
  if (!Array.isArray(parsed.clients) || !Array.isArray(parsed.documents)) throw new Error('Format de sauvegarde incorrect');
  return {
    ...parsed,
    company: { ...COMPANY, ...parsed.company },
    clients: parsed.clients.map(client => ({ ...client, billingModel: client.billingModel || 'oneoff', relationshipStatus: client.relationshipStatus || 'client', monthlyStart: client.monthlyStart || '', monthlyEnd: client.monthlyEnd || '', monthlyAmountHt: client.monthlyAmountHt ?? null, billingDay: client.billingDay ?? null })),
    imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    cashEntries: Array.isArray(parsed.cashEntries) ? parsed.cashEntries : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    recurringExpenses: Array.isArray(parsed.recurringExpenses) ? parsed.recurringExpenses : [],
  };
}

export function loadData(): Database {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Database;
      return normalizeData(parsed);
    }
  } catch { /* A damaged local backup falls back to the source import. */ }
  return structuredClone(seed);
}

export function saveData(data: Database) { localStorage.setItem(KEY, JSON.stringify(data)); }

export function expandRecurringExpenses(data: Database, throughMonth = new Date().toISOString().slice(0, 7)): Database {
  const known = new Set(data.expenses.map(item => item.id));
  const additions: Expense[] = [];
  for (const rule of data.recurringExpenses) {
    const end = rule.endMonth && rule.endMonth < throughMonth ? rule.endMonth : throughMonth;
    if (!/^\d{4}-\d{2}$/.test(rule.startMonth) || end < rule.startMonth) continue;
    const cursor = new Date(`${rule.startMonth}-01T12:00:00`);
    for (let count = 0; count < 240 && cursor.toISOString().slice(0, 7) <= end; count++, cursor.setMonth(cursor.getMonth() + 1)) {
      const month = cursor.toISOString().slice(0, 7);
      const occurrenceId = `${rule.id}:${month}`;
      if (known.has(occurrenceId)) continue;
      additions.push({ id: occurrenceId, date: `${month}-01`, label: rule.label, amount: rule.amount, category: rule.category, paymentMethod: rule.paymentMethod, person: rule.person, note: rule.note, paid: false, recurrenceId: rule.id, month });
      known.add(occurrenceId);
    }
  }
  return additions.length ? { ...data, expenses: [...data.expenses, ...additions] } : data;
}

export const id = () => crypto.randomUUID();
export const money = (value: number) => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(value) + ' DH';
export const dateFr = (value: string) => value ? new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00`)) : '—';
export const subtotal = (doc: Document) => doc.historical && doc.historicalHt != null ? doc.historicalHt : doc.lines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
export const vat = (doc: Document) => doc.historical && doc.historicalTtc != null ? doc.historicalTtc - subtotal(doc) : Math.round(subtotal(doc) * doc.vatRate) / 100;
export const total = (doc: Document) => doc.historical && doc.historicalTtc != null ? doc.historicalTtc : subtotal(doc) + vat(doc);
export const paid = (doc: Document) => doc.historical && doc.historicalPaymentStatus === 'paid' ? total(doc) : doc.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
export const remaining = (doc: Document) => Math.max(0, total(doc) - paid(doc));
export function status(doc: Document): string {
  if (doc.kind === 'quote') return 'Devis';
  if (doc.historical && doc.historicalPaymentStatus === 'paid') return 'Payée';
  if (doc.historical && doc.historicalPaymentStatus === 'unknown') return 'À vérifier';
  if (doc.historical && doc.historicalPaymentStatus === 'open' && paid(doc) === 0) return 'En cours';
  if (!doc.paymentVerified) return 'À vérifier';
  if (remaining(doc) <= 0) return 'Payée';
  if (paid(doc) > 0) return 'Partielle';
  if (doc.dueAt && doc.dueAt < new Date().toISOString().slice(0, 10)) return 'En retard';
  return 'En attente';
}
