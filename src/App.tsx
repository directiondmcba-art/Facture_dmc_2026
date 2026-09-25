import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Banknote, Building2, CalendarDays, Check, ClipboardList, CreditCard, FilePlus2, FileText, LayoutDashboard, Plus, Printer, Receipt, Search, Settings2, Trash2, Upload, Users, Wallet, X } from 'lucide-react';
import type { CashEntry, Client, Company, Database, Document, Expense, Line, MonthlyTemplate, RecurringExpense, Reimbursement } from './types';
import { advanceRemaining, currentMonth, dateFr, expandRecurringExpenses, id, loadData, money, normalizeData, priceAmounts, reimbursedAmount, remaining, saveData, status, subtotal, total, vat } from './data';
import { DocumentPrint, StatementPrint } from './Print';
import { CashPage, ExpensesPage } from './Finance';
import { AdvancesPage } from './Advances';
import { CloudGate, useCloudSync } from './cloud';

type View = 'dashboard' | 'clients' | 'invoices' | 'quotes' | 'cash' | 'expenses' | 'advances' | 'imports' | 'settings';
type Dialog = { type: 'client'; value: Client } | { type: 'document'; value: Document } | null;
type PrintTarget = { type: 'document'; doc: Document } | { type: 'statement'; client: Client } | null;

const emptyClient = (): Client => ({ id: id(), name: '', ice: '', sector: '', alias: '', city: 'Casablanca, Maroc', email: '', phone: '', notes: '', billingModel: 'oneoff', relationshipStatus: 'client', monthlyStart: '', monthlyEnd: '', monthlyAmountHt: null, billingDay: null });
const emptyLine = (): Line => ({ id: id(), description: '', quantity: 1, unitPrice: 0, amount: 0 });
const emptyMonthlyTemplate = (amountHt = 0): MonthlyTemplate => ({ subject: 'Prestations mensuelles', descriptions: [], amount: amountHt, amountBasis: 'ht', vatRate: 20 });
const currentPeriod = () => { const [year, month] = currentMonth().split('-').map(Number); return { periodStart: `${year}-${String(month).padStart(2, '0')}-01`, periodEnd: `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` }; };
function applyMonthlyTemplate(doc: Document, client: Client): Document {
  const template = client.monthlyTemplate;
  const period = doc.periodStart ? { periodStart: doc.periodStart, periodEnd: doc.periodEnd } : currentPeriod();
  return { ...doc, ...period, category: 'monthly', subject: template?.subject || 'Prestations mensuelles', vatRate: template?.vatRate ?? 20,
    pricingMode: 'flat', flatPrice: template?.amount ?? client.monthlyAmountHt ?? 0, flatPriceBasis: template?.amountBasis || 'ht',
    lines: template?.descriptions.length ? template.descriptions.map(description => ({ ...emptyLine(), description })) : [emptyLine()] };
}
const emptyDocument = (kind: Document['kind'], clientId = ''): Document => ({
  id: id(), kind, reference: '', originalReference: '', clientId, clientNameSnapshot: '', clientIceSnapshot: '',
  issuedAt: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString().slice(0, 10),
  category: 'oneoff', periodStart: '', periodEnd: '', subject: '', dueAt: '', vatRate: 20,
  pricingMode: 'flat', flatPrice: 0, flatPriceBasis: 'ht',
  lines: [emptyLine()], payments: [], paymentVerified: false, notes: '', source: '',
});

function ClientEditor({ initial, onClose, onSave }: { initial: Client; onClose: () => void; onSave: (c: Client) => void }) {
  const [value, setValue] = useState(initial);
  const update = <K extends keyof Client>(key: K, val: Client[K]) => setValue(v => ({ ...v, [key]: val }));
  const template = value.monthlyTemplate || emptyMonthlyTemplate(value.monthlyAmountHt || 0);
  const templatePrices = priceAmounts(template.amount, template.amountBasis, template.vatRate);
  const updateTemplate = <K extends keyof MonthlyTemplate>(key: K, val: MonthlyTemplate[K]) => setValue(v => ({ ...v, monthlyTemplate: { ...(v.monthlyTemplate || emptyMonthlyTemplate(v.monthlyAmountHt || 0)), [key]: val } }));
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal form-modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">Fiche client</span><h2>{initial.name ? 'Modifier le client' : 'Nouveau client'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={20}/></button></div>
    <form onSubmit={e => { e.preventDefault(); if (value.name.trim()) { const cleanTemplate = value.billingModel === 'monthly' ? { ...template, descriptions: template.descriptions.map(text => text.trim()).filter(Boolean) } : value.monthlyTemplate; onSave({ ...value, name: value.name.trim(), monthlyTemplate: cleanTemplate, monthlyAmountHt: cleanTemplate && value.billingModel === 'monthly' && cleanTemplate.amount > 0 ? priceAmounts(cleanTemplate.amount, cleanTemplate.amountBasis, cleanTemplate.vatRate).ht : value.monthlyAmountHt }); } }}>
      <div className="form-grid"><label className="wide">Dénomination sociale *<input value={value.name} onChange={e => update('name', e.target.value)} required placeholder="Nom officiel du client" /></label>
        <label>Nom courant / alias<input value={value.alias} onChange={e => update('alias', e.target.value)} placeholder="Nom utilisé au quotidien" /></label>
        <label>ICE<input value={value.ice} onChange={e => update('ice', e.target.value)} placeholder="Identifiant fiscal" /></label>
        <label>Secteur<input value={value.sector} onChange={e => update('sector', e.target.value)} /></label>
        <label>Ville / adresse<input value={value.city} onChange={e => update('city', e.target.value)} /></label>
        <label>Email<input type="email" value={value.email} onChange={e => update('email', e.target.value)} /></label>
        <label>Téléphone<input value={value.phone} onChange={e => update('phone', e.target.value)} /></label>
        <label>Type de relation<select value={value.billingModel} onChange={e => update('billingModel', e.target.value as Client['billingModel'])}><option value="oneoff">Ponctuel</option><option value="monthly">Mensuel</option></select></label>
        <label>Situation<select value={value.relationshipStatus} onChange={e => update('relationshipStatus', e.target.value as Client['relationshipStatus'])}><option value="client">Actif</option><option value="former">Ancien client</option><option value="upcoming">À démarrer</option><option value="prospect">Prospect</option></select></label>
        {value.billingModel === 'monthly' && <><label>Début du contrat / suivi<input type="date" value={value.monthlyStart} onChange={e => update('monthlyStart', e.target.value)} /></label><label>Fin du contrat (si connue)<input type="date" value={value.monthlyEnd} onChange={e => update('monthlyEnd', e.target.value)} /></label><label>Jour habituel de facturation<input type="number" min="1" max="31" value={value.billingDay ?? ''} onChange={e => update('billingDay', e.target.value === '' ? null : Number(e.target.value))} /></label><div className="form-subheading wide">Modèle de facture mensuelle <small>Prérempli dans chaque nouvelle facture, puis librement modifiable.</small></div><label className="wide">Objet du modèle<input value={template.subject} onChange={e => updateTemplate('subject', e.target.value)} /></label><label className="wide">Prestations du modèle, une par ligne<textarea rows={6} value={template.descriptions.join('\n')} onChange={e => updateTemplate('descriptions', e.target.value.split('\n'))} placeholder="Stratégie marketing&#10;Création de contenu" /></label><label>TVA du modèle (%)<input type="number" min="0" max="100" step="0.01" value={template.vatRate} onChange={e => updateTemplate('vatRate', Number(e.target.value))} /></label><label>Forfait HT (DH)<input type="number" min="0" step="0.01" value={template.amount ? templatePrices.ht : ''} onChange={e => setValue(v => ({ ...v, monthlyTemplate: { ...(v.monthlyTemplate || emptyMonthlyTemplate(v.monthlyAmountHt || 0)), amount: Number(e.target.value), amountBasis: 'ht' } }))} /></label><label>Forfait TTC (DH)<input type="number" min="0" step="0.01" value={template.amount ? templatePrices.ttc : ''} onChange={e => setValue(v => ({ ...v, monthlyTemplate: { ...(v.monthlyTemplate || emptyMonthlyTemplate(v.monthlyAmountHt || 0)), amount: Number(e.target.value), amountBasis: 'ttc' } }))} /></label><div className="field-hint wide">Le dernier montant saisi fait foi. Modifier une facture ne change pas ce modèle.</div></>}
        <label className="wide">Notes internes<textarea rows={3} value={value.notes} onChange={e => update('notes', e.target.value)} /></label></div>
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Annuler</button><button className="button primary" type="submit"><Check size={17}/> Enregistrer</button></div>
    </form>
  </div></div>;
}

function DocumentEditor({ initial, clients, documents, onClose, onSave, onDelete }: { initial: Document; clients: Client[]; documents: Document[]; onClose: () => void; onSave: (d: Document) => void; onDelete: (d: Document) => void }) {
  const isNew = !documents.some(doc => doc.id === initial.id);
  const [value, setValue] = useState(() => {
    const client = clients.find(item => item.id === initial.clientId);
    return isNew && initial.kind === 'invoice' && initial.category === 'monthly' && client ? applyMonthlyTemplate(initial, client) : initial;
  });
  const [error, setError] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const update = <K extends keyof Document>(key: K, val: Document[K]) => setValue(v => ({ ...v, [key]: val }));
  const selectClient = (clientId: string) => setValue(previous => {
    if (!isNew) return { ...previous, clientId };
    const client = clients.find(item => item.id === clientId);
    const fresh = { ...emptyDocument(previous.kind, clientId), id: previous.id, reference: previous.reference, issuedAt: previous.issuedAt, createdAt: previous.createdAt };
    return client?.billingModel === 'monthly' && previous.kind === 'invoice' ? applyMonthlyTemplate(fresh, client) : fresh;
  });
  const selectCategory = (category: Document['category']) => setValue(previous => {
    if (category === 'monthly' && isNew && previous.kind === 'invoice') {
      const client = clients.find(item => item.id === previous.clientId);
      if (client?.billingModel === 'monthly') return applyMonthlyTemplate(previous, client);
    }
    if (category === 'oneoff' && isNew && previous.category === 'monthly') return { ...previous, category, periodStart: '', periodEnd: '', subject: '', lines: [emptyLine()], flatPrice: 0, flatPriceBasis: 'ht', vatRate: 20 };
    return { ...previous, category, periodStart: category === 'monthly' ? previous.periodStart || currentPeriod().periodStart : '', periodEnd: category === 'monthly' ? previous.periodEnd || currentPeriod().periodEnd : '' };
  });
  const updateLine = (lineId: string, key: keyof Line, raw: string) => setValue(v => ({ ...v, lines: v.lines.map(line => {
    if (line.id !== lineId) return line;
    const next: Line = { ...line, [key]: key === 'description' ? raw : (raw === '' ? null : Number(raw)) } as Line;
    if (key === 'quantity' || key === 'unitPrice') next.amount = Math.round((next.quantity || 0) * (next.unitPrice || 0) * 100) / 100;
    return next;
  }) }));
  const addPayment = () => {
    const amount = Number(payAmount);
    if (!payDate || !Number.isFinite(amount) || amount <= 0) { setError('Indique une date et un montant de paiement positif.'); return; }
    setValue(v => ({ ...v, payments: [...v.payments, { id: id(), date: payDate, amount, note: payNote }] }));
    setPayAmount(''); setPayNote(''); setError('');
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.clientId) { setError('Choisis un client avant d’enregistrer.'); return; }
    if (!value.historical && !value.lines.some(item => item.description.trim())) { setError('Ajoute au moins une prestation.'); return; }
    if (!value.historical && value.pricingMode === 'flat' && (!Number.isFinite(value.flatPrice) || (value.flatPrice || 0) <= 0) && value.reference.trim()) { setError('Indique un forfait positif avant de numéroter ce document.'); return; }
    const expected = value.kind === 'invoice' ? /^FC\d{3}$/ : /^DV\d{3}$/;
    const reference = value.reference.toUpperCase().replace(/[\s-]/g, '');
    if (reference && !expected.test(reference)) { setError(`Référence attendue : ${value.kind === 'invoice' ? 'FC001' : 'DV001'} (trois chiffres).`); return; }
    if (reference && documents.some(d => d.id !== value.id && d.reference === reference)) { setError('Cette référence existe déjà.'); return; }
    if (initial.provisional && !value.provisional && (!value.issuedAt || !value.sourceUrl)) { setError('Renseigne la date et le lien du PDF avant de lever le statut provisoire.'); return; }
    if (value.category === 'monthly' && !value.historical && (!value.periodStart || !value.periodEnd || value.periodEnd < value.periodStart)) { setError('Renseigne une période mensuelle valide.'); return; }
    const client = clients.find(c => c.id === value.clientId)!;
    const changedClient = value.clientId !== initial.clientId;
    onSave({ ...value, reference, clientNameSnapshot: changedClient || !value.clientNameSnapshot ? client.name : value.clientNameSnapshot,
      clientIceSnapshot: changedClient || !value.clientNameSnapshot ? client.ice : value.clientIceSnapshot,
      lines: value.lines.filter(item => item.description.trim()),
    });
  };
  const activeTemplate = clients.find(client => client.id === value.clientId)?.monthlyTemplate;
  const hasMonthlyTemplate = !!(activeTemplate?.descriptions.length || activeTemplate?.amount);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal document-modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">{value.kind === 'invoice' ? 'Facturation' : 'Proposition commerciale'}</span><h2>{initial.reference || initial.subject ? `Modifier ${initial.reference || 'le brouillon'}` : `${value.kind === 'invoice' ? 'Nouvelle facture' : 'Nouveau devis'}`}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={20}/></button></div>
    <form onSubmit={submit}>
      <div className="section-label">Informations générales</div>
      <div className="form-grid three"><label>Client *<select value={value.clientId} onChange={e => selectClient(e.target.value)} required><option value="">Choisir un client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Référence<input value={value.reference} onChange={e => update('reference', e.target.value)} placeholder={value.kind === 'invoice' ? 'FC + 3 chiffres' : 'DV + 3 chiffres'} /><small>Saisie manuelle. Laissez vide pour enregistrer un brouillon.</small></label>
        <label>Date du document<input type="date" value={value.issuedAt} onChange={e => update('issuedAt', e.target.value)} /></label>
        <label>Date de création dans le CRM<input type="date" value={value.createdAt} onChange={e => update('createdAt', e.target.value)} /></label>
        <label>Catégorie<select value={value.category} onChange={e => selectCategory(e.target.value as Document['category'])}><option value="oneoff">Ponctuelle</option><option value="monthly">Mensuelle</option></select></label>
        <label>TVA (%)<input type="number" min="0" max="100" step="0.01" value={value.vatRate} onChange={e => update('vatRate', Number(e.target.value))} /></label>
        {value.category === 'monthly' && <><label>Période du<input type="date" value={value.periodStart} onChange={e => update('periodStart', e.target.value)} /></label><label>Au<input type="date" value={value.periodEnd} onChange={e => update('periodEnd', e.target.value)} /></label><div className="field-hint wide">Vérifiez la période : elle est proposée sur le mois en cours et reste modifiable.</div></>}
        {value.kind === 'invoice' && <label>Échéance de paiement<input type="date" value={value.dueAt} onChange={e => update('dueAt', e.target.value)} /></label>}
        <label className="wide">Objet / titre<input value={value.subject} onChange={e => update('subject', e.target.value)} placeholder="Ex. Création de site web" /></label>
      </div>
      {value.historical && <div className="archive-note">{value.provisional ? 'Entrée provisoire issue du tableau : date et PDF d’origine à compléter avant de partager un relevé.' : 'Facture historique : seul le PDF d’origine fait foi. Les montants ci-dessous servent au suivi, sans recréer le détail des prestations.'} {value.sourceUrl && <a href={value.sourceUrl} target="_blank" rel="noreferrer">Ouvrir le PDF d’origine ↗</a>}</div>}
      {value.historical ? <><div className="form-grid three"><label>Montant HT<input type="number" min="0" step="0.01" value={value.historicalHt ?? ''} onChange={e => update('historicalHt', e.target.value === '' ? undefined : Number(e.target.value))}/></label><label>Montant TTC<input type="number" min="0" step="0.01" value={value.historicalTtc ?? ''} onChange={e => update('historicalTtc', e.target.value === '' ? undefined : Number(e.target.value))}/></label><label>État du paiement<select value={value.historicalPaymentStatus || 'unknown'} onChange={e => update('historicalPaymentStatus', e.target.value as Document['historicalPaymentStatus'])}><option value="paid">Payée intégralement</option><option value="open">En cours</option><option value="unknown">À vérifier</option></select></label>{value.historicalPaymentStatus === 'paid' && <label>Date de paiement (si connue)<input type="date" value={value.historicalPaidAt || ''} onChange={e => update('historicalPaidAt', e.target.value)} /><small>Le tableau confirme le règlement, mais ne donne pas sa date.</small></label>}<label className="wide">Lien vers le PDF d’origine<input type="url" value={value.sourceUrl || ''} onChange={e => update('sourceUrl', e.target.value)}/></label></div>{initial.provisional && <label className="check-row"><input type="checkbox" checked={!value.provisional} onChange={e => update('provisional', !e.target.checked)}/> Date et PDF retrouvés : retirer la mention « provisoire »</label>}</> : <><div className="section-label with-action"><span>Prestations</span><button type="button" className="text-button" onClick={() => update('lines', [...value.lines, emptyLine()])}><Plus size={16}/> Ajouter une ligne</button></div>
      <div className="pricing-switch"><button type="button" className={value.pricingMode === 'flat' ? 'active' : ''} onClick={() => update('pricingMode', 'flat')}>Forfait global</button><button type="button" className={value.pricingMode !== 'flat' ? 'active' : ''} onClick={() => update('pricingMode', 'lines')}>Prix par ligne</button></div>
      {value.category === 'monthly' && isNew && <div className="field-hint">{hasMonthlyTemplate ? 'Modèle mensuel du client chargé. Les modifications de cette facture ne changeront pas le modèle.' : 'Aucun modèle enregistré pour ce client. Configurez ses prestations et son forfait dans la fiche client pour les prochaines factures.'}</div>}
      {value.pricingMode === 'flat' && <div className="field-hint">Décrivez chaque prestation ci-dessous. Un seul prix s’applique à l’ensemble.</div>}
      {value.pricingMode !== 'flat' && <div className="line-grid line-head"><span>Description</span><span>Qté</span><span>PU HT</span><span>Total HT</span><span></span></div>}
      {value.lines.map(line => <div className={`line-grid ${value.pricingMode === 'flat' ? 'flat-line' : ''}`} key={line.id}><textarea rows={2} value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} placeholder="Description de la prestation"/>{value.pricingMode !== 'flat' && <><input type="number" min="0" step="0.01" value={line.quantity ?? ''} onChange={e => updateLine(line.id, 'quantity', e.target.value)} /><input type="number" min="0" step="0.01" value={line.unitPrice ?? ''} onChange={e => updateLine(line.id, 'unitPrice', e.target.value)} /><input type="number" min="0" step="0.01" value={line.amount} onChange={e => updateLine(line.id, 'amount', e.target.value)} /></>}<button type="button" className="icon-button subtle" aria-label="Supprimer la ligne" onClick={() => update('lines', value.lines.filter(item => item.id !== line.id))}><Trash2 size={16}/></button></div>)}
      {value.pricingMode === 'flat' && <div className="form-grid flat-prices"><label>Forfait HT (DH)<input type="number" min="0" step="0.01" value={value.flatPrice ? subtotal(value) : ''} onChange={e => setValue(v => ({ ...v, flatPrice: Number(e.target.value), flatPriceBasis: 'ht' }))} /></label><label>Forfait TTC (DH)<input type="number" min="0" step="0.01" value={value.flatPrice ? total(value) : ''} onChange={e => setValue(v => ({ ...v, flatPrice: Number(e.target.value), flatPriceBasis: 'ttc' }))} /></label><div className="field-hint wide">Le dernier montant saisi fait foi. La TVA est calculée automatiquement au taux indiqué plus haut.</div></div>}
      </>}
      <div className="editor-totals"><span>Total HT <b>{money(subtotal(value))}</b></span><span>TVA <b>{money(vat(value))}</b></span><span>Total TTC <b>{money(total(value))}</b></span></div>
      {value.kind === 'invoice' && !value.historical && <><div className="section-label">Paiements</div><label className="check-row"><input type="checkbox" checked={value.paymentVerified} onChange={e => update('paymentVerified', e.target.checked)} /> Situation des paiements vérifiée</label>
        {value.payments.map(p => <div className="payment-row" key={p.id}><span>{dateFr(p.date)}</span><strong>{money(p.amount)}</strong><span>{p.note}</span>{p.id.startsWith('cash-') ? <small>Modifier dans « Paiements en cash »</small> : <button type="button" className="icon-button subtle" aria-label="Supprimer le paiement" onClick={() => update('payments', value.payments.filter(item => item.id !== p.id))}><Trash2 size={15}/></button>}</div>)}
        <div className="payment-entry"><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /><input type="number" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Montant DH" /><input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note facultative" /><button type="button" className="button soft" onClick={addPayment}><Plus size={15}/> Paiement</button></div>
        <div className="balance-line">Reste à payer <strong>{money(remaining(value))}</strong></div></>}
      <div className="section-label">Notes internes</div><textarea className="full-textarea" rows={2} value={value.notes} onChange={e => update('notes', e.target.value)} placeholder="Informations de suivi non imprimées sur le document" />
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions between">{documents.some(d => d.id === initial.id) ? <button type="button" className="button danger-text" onClick={() => onDelete(initial)}><Trash2 size={16}/> Supprimer</button> : <span/>}<div><button type="button" className="button ghost" onClick={onClose}>Annuler</button><button className="button primary" type="submit"><Check size={17}/> Enregistrer</button></div></div>
    </form>
  </div></div>;
}

export default function App() {
  const [db, setDb] = useState<Database>(loadData);
  const [view, setView] = useState<View>('dashboard');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cloud = useCloudSync(db, setDb);
  useEffect(() => { if (cloud.phase === 'local' || cloud.phase === 'ready') saveData(db); }, [db, cloud.phase]);
  useEffect(() => { if (cloud.phase === 'local' || cloud.phase === 'ready') setDb(prev => expandRecurringExpenses(prev)); }, [cloud.phase, db.recurringExpenses]);
  useEffect(() => {
    if (cloud.phase !== 'local' && cloud.phase !== 'ready') return;
    const updateMonthlyExpenses = () => setDb(prev => expandRecurringExpenses(prev));
    window.addEventListener('focus', updateMonthlyExpenses);
    document.addEventListener('visibilitychange', updateMonthlyExpenses);
    const timer = window.setInterval(updateMonthlyExpenses, 60_000);
    return () => { window.removeEventListener('focus', updateMonthlyExpenses); document.removeEventListener('visibilitychange', updateMonthlyExpenses); window.clearInterval(timer); };
  }, [cloud.phase]);
  const clients = db.clients;
  const invoices = db.documents.filter(d => d.kind === 'invoice');
  const quotes = db.documents.filter(d => d.kind === 'quote');
  const selectedClient = clients.find(c => c.id === selectedClientId);
  const shownDocs = (view === 'quotes' ? quotes : invoices).filter(d => `${d.reference} ${d.clientNameSnapshot} ${d.subject}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const shownClients = clients.filter(c => `${c.name} ${c.alias} ${c.ice}`.toLowerCase().includes(search.toLowerCase()));
  const unverified = invoices.filter(d => status(d) === 'À vérifier').length;
  const due = invoices.filter(d => status(d) !== 'À vérifier').reduce((sum, d) => sum + remaining(d), 0);
  const thisMonth = currentMonth();
  const cashMonth = db.cashEntries.filter(item => item.date.startsWith(thisMonth)).reduce((sum, item) => sum + item.amount, 0);
  const advanceDue = db.expenses.reduce((sum, item) => sum + advanceRemaining(item), 0);
  const navigate = (next: View) => { setView(next); setSearch(''); setSelectedClientId(null); };
  const updateCompany = (key: keyof Company, val: string) => setDb(prev => ({ ...prev, company: { ...prev.company, [key]: val } }));
  const uploadCompanyAsset = async (key: 'logoDataUrl' | 'stampDataUrl', file?: File) => { if (!file) return; if (file.type !== 'image/svg+xml' && file.type !== 'image/png') { alert('Choisissez un SVG ou un PNG.'); return; } const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); setDb(prev => ({ ...prev, company: { ...prev.company, [key]: dataUrl } })); };
  const saveClient = (value: Client) => { setDb(prev => ({ ...prev, clients: prev.clients.some(c => c.id === value.id) ? prev.clients.map(c => c.id === value.id ? value : c) : [...prev.clients, value] })); setDialog(null); setSelectedClientId(value.id); };
  const saveDocument = (value: Document) => { const old = db.documents.find(d => d.id === value.id); if (old && old.clientId !== value.clientId && db.cashEntries.some(item => item.invoiceId === value.id)) { alert('Cette facture possède un paiement cash. Détachez ce paiement avant de changer de client.'); return; } setDb(prev => ({ ...prev, documents: prev.documents.some(d => d.id === value.id) ? prev.documents.map(d => d.id === value.id ? { ...value, payments: [...value.payments.filter(p => !p.id.startsWith('cash-')), ...d.payments.filter(p => p.id.startsWith('cash-'))] } : d) : [...prev.documents, value] })); setDialog(null); };
  const deleteDocument = (value: Document) => { if (confirm(`Supprimer ${value.reference || 'ce brouillon'} ?`)) { setDb(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== value.id), cashEntries: prev.cashEntries.map(item => item.invoiceId === value.id ? { ...item, invoiceId: '' } : item) })); setDialog(null); } };
  const deleteClient = (value: Client) => { if (db.documents.some(d => d.clientId === value.id) || db.cashEntries.some(item => item.clientId === value.id)) { alert('Ce client possède des documents ou des paiements cash. Réattribue-les avant de supprimer la fiche.'); return; } if (confirm(`Supprimer ${value.name} ?`)) { setDb(prev => ({ ...prev, clients: prev.clients.filter(c => c.id !== value.id) })); setSelectedClientId(null); } };
  const saveCash = (value: CashEntry): string | void => {
    if (!value.date || !value.service.trim() || !Number.isFinite(value.amount) || value.amount <= 0) return 'Renseignez une date, un service et un montant positif.';
    const previous = db.cashEntries.find(item => item.id === value.id);
    if (value.invoiceId) {
      const invoice = db.documents.find(d => d.id === value.invoiceId);
      if (!invoice || invoice.kind !== 'invoice' || invoice.clientId !== value.clientId || invoice.historicalPaymentStatus === 'paid') return 'La facture choisie ne correspond pas au client ou est déjà payée.';
      const available = remaining(invoice) + (previous?.invoiceId === invoice.id ? previous.amount : 0);
      if (value.amount > available + 0.001) return `Le paiement dépasse le reste à payer de ${money(available)}.`;
    }
    setDb(prev => ({ ...prev, cashEntries: prev.cashEntries.some(item => item.id === value.id) ? prev.cashEntries.map(item => item.id === value.id ? value : item) : [...prev.cashEntries, value], documents: prev.documents.map(doc => {
      if (doc.id !== value.invoiceId && doc.id !== previous?.invoiceId) return doc;
      const payments = doc.payments.filter(payment => payment.id !== `cash-${value.id}`);
      if (doc.id === value.invoiceId) payments.push({ id: `cash-${value.id}`, date: value.date, amount: value.amount, note: `Cash · ${value.service}` });
      return { ...doc, payments, paymentVerified: true };
    }) }));
  };
  const deleteCash = (value: CashEntry) => { if (!confirm(`Supprimer ce paiement cash de ${money(value.amount)} ?`)) return; setDb(prev => ({ ...prev, cashEntries: prev.cashEntries.filter(item => item.id !== value.id), documents: prev.documents.map(doc => doc.id === value.invoiceId ? { ...doc, payments: doc.payments.filter(payment => payment.id !== `cash-${value.id}`) } : doc) })); };
  const saveExpense = (value: Expense): string | void => {
    const previous = db.expenses.find(item => item.id === value.id);
    const alreadyReimbursed = previous ? reimbursedAmount(previous) : 0;
    if (alreadyReimbursed > 0 && (!value.paid || value.fundingSource !== 'personal')) return 'Cette avance possède des remboursements. Supprimez-les avant de changer son origine ou son état.';
    if (value.amount + 0.001 < alreadyReimbursed) return `Le montant ne peut pas être inférieur aux ${money(alreadyReimbursed)} déjà remboursés.`;
    const safe = { ...value, reimbursements: previous?.reimbursements || [] };
    setDb(prev => ({ ...prev, expenses: prev.expenses.some(item => item.id === value.id) ? prev.expenses.map(item => item.id === value.id ? safe : item) : [...prev.expenses, safe] }));
  };
  const deleteExpense = (value: Expense) => { if (value.reimbursements?.length) { alert('Cette avance possède des remboursements. Supprimez-les avant la dépense.'); return; } if (confirm(`Supprimer « ${value.label} » ?`)) setDb(prev => ({ ...prev, expenses: prev.expenses.filter(item => item.id !== value.id) })); };
  const saveReimbursement = (expenseId: string, value: Reimbursement): string | void => {
    const expense = db.expenses.find(item => item.id === expenseId);
    if (!expense || !expense.paid || expense.fundingSource !== 'personal') return 'Cette avance n’est plus disponible.';
    if (!value.date || !Number.isFinite(value.amount) || value.amount <= 0) return 'Indiquez une date et un montant positif.';
    const prior = expense.reimbursements.find(item => item.id === value.id);
    const available = advanceRemaining(expense) + (prior?.amount || 0);
    if (value.amount > available + 0.001) return `Le remboursement dépasse le solde disponible de ${money(available)}.`;
    setDb(prev => ({ ...prev, expenses: prev.expenses.map(item => item.id === expenseId ? { ...item, reimbursements: item.reimbursements.some(r => r.id === value.id) ? item.reimbursements.map(r => r.id === value.id ? value : r) : [...item.reimbursements, value] } : item) }));
  };
  const deleteReimbursement = (expenseId: string, reimbursementId: string) => { if (!confirm('Supprimer ce remboursement ?')) return; setDb(prev => ({ ...prev, expenses: prev.expenses.map(item => item.id === expenseId ? { ...item, reimbursements: item.reimbursements.filter(r => r.id !== reimbursementId) } : item) })); };
  const saveRule = (value: RecurringExpense) => setDb(prev => expandRecurringExpenses({ ...prev, recurringExpenses: prev.recurringExpenses.some(item => item.id === value.id) ? prev.recurringExpenses.map(item => item.id === value.id ? value : item) : [...prev.recurringExpenses, value] }));
  const stopRule = (value: RecurringExpense) => { if (confirm(`Arrêter « ${value.label} » après ${thisMonth} ?`)) setDb(prev => ({ ...prev, recurringExpenses: prev.recurringExpenses.map(item => item.id === value.id ? { ...item, endMonth: thisMonth } : item) })); };
  const openPrint = (target: PrintTarget) => setPrintTarget(target);
  const downloadBackup = () => { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `dmc-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); };
  const restoreBackup = async (file?: File) => { if (!file) return; try { const parsed = normalizeData(JSON.parse(await file.text()) as Database); if (confirm(`Remplacer les données ${cloud.phase === 'ready' ? 'cloud' : 'locales'} actuelles par cette sauvegarde ?`)) { setDb(parsed); setSelectedClientId(null); setDialog(null); } } catch { alert('Impossible de lire ce fichier de sauvegarde.'); } if (fileInput.current) fileInput.current.value = ''; };
  const months = useMemo(() => { const set = new Set(invoices.filter(d => d.category === 'monthly' && d.periodStart).map(d => d.periodStart.slice(0, 7))); return set.size; }, [invoices]);

  return <>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">{db.company.logoDataUrl ? <img src={db.company.logoDataUrl} alt="Logo DMC"/> : <>D<span>·</span></>}</div><div><strong>DMC</strong><small>FACTURATION</small></div></div>
        <div className="sidebar-section">ESPACE DE TRAVAIL</div>
        <nav className="navigation">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><LayoutDashboard size={19}/> Vue d’ensemble</button>
          <button className={view === 'clients' ? 'active' : ''} onClick={() => navigate('clients')}><Users size={19}/> Clients <span>{clients.length}</span></button>
          <button className={view === 'invoices' ? 'active' : ''} onClick={() => navigate('invoices')}><FileText size={19}/> Factures <span>{invoices.length}</span></button>
          <button className={view === 'quotes' ? 'active' : ''} onClick={() => navigate('quotes')}><ClipboardList size={19}/> Devis <span>{quotes.length}</span></button>
          <button className={view === 'cash' ? 'active' : ''} onClick={() => navigate('cash')}><Banknote size={19}/> Paiements en cash <span>{db.cashEntries.length}</span></button>
          <button className={view === 'expenses' ? 'active' : ''} onClick={() => navigate('expenses')}><Receipt size={19}/> Sorties d’argent <span>{db.expenses.length}</span></button>
          <button className={view === 'advances' ? 'active' : ''} onClick={() => navigate('advances')}><Wallet size={19}/> Finances à ajouter <span>{db.expenses.filter(item => advanceRemaining(item) > 0).length}</span></button>
          <button className={view === 'imports' ? 'active' : ''} onClick={() => navigate('imports')}><Upload size={19}/> Revue 2026 <span>{db.imports.filter(r => r.disposition === 'review').length}</span></button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings2 size={19}/> Identité DMC</button>
        </nav>
        <div className="sidebar-bottom"><div className="storage-note"><span className="storage-dot"/><div><strong>{cloud.phase === 'local' ? 'Version locale' : cloud.email || 'Supabase'}</strong><small>{cloud.phase === 'local' ? 'Vos données restent sur cet appareil.' : cloud.message || 'Synchronisation cloud active'}</small></div></div>{cloud.phase === 'ready' && <><button className="sidebar-link" onClick={() => void cloud.refresh()}>↻ Actualiser le cloud</button><button className="sidebar-link" onClick={() => void cloud.signOut()}>Déconnexion</button></>}<button className="sidebar-link" onClick={downloadBackup}><ArrowDownToLine size={17}/> Exporter une sauvegarde</button><button className="sidebar-link" onClick={() => fileInput.current?.click()}><Upload size={17}/> Restaurer une sauvegarde</button><input ref={fileInput} type="file" accept="application/json" hidden onChange={e => restoreBackup(e.target.files?.[0])}/></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumb">DMC <span>/</span> {view === 'dashboard' ? 'Vue d’ensemble' : view === 'clients' ? 'Clients' : view === 'invoices' ? 'Factures' : view === 'quotes' ? 'Devis' : view === 'cash' ? 'Paiements en cash' : view === 'expenses' ? 'Sorties d’argent' : view === 'advances' ? 'Finances à ajouter' : view === 'imports' ? 'Revue 2026' : 'Identité DMC'}</div><div className="top-actions"><span className="date-badge"><CalendarDays size={16}/>{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><div className="avatar">DM</div></div></header>
        <div className="main-content">
          {view === 'dashboard' && <>
            <div className="page-title-row"><div><div className="eyebrow">Votre espace de facturation</div><h1>Vue d’ensemble</h1><p>Un point de départ clair pour suivre vos clients, devis et factures.</p></div><button className="button primary" onClick={() => { if (!clients.length) { navigate('clients'); setDialog({ type: 'client', value: emptyClient() }); } else setDialog({ type: 'document', value: emptyDocument('invoice') }); }}><Plus size={18}/> Nouvelle facture</button></div>
            <div className="welcome-banner"><div><div className="welcome-kicker">DMC · GESTION INTERNE</div><h2>Tout votre suivi,<br/>au même endroit.</h2><p>{clients.length ? 'Suivez les factures historiques et vérifiez les références encore incertaines.' : 'Commencez par créer vos clients, puis ajoutez vos documents 2026 à votre rythme.'}</p><button onClick={() => clients.length ? navigate('imports') : (navigate('clients'), setDialog({ type: 'client', value: emptyClient() }))}>{clients.length ? 'Voir la revue 2026' : 'Ajouter un premier client'} <ArrowRight size={16}/></button></div><div className="banner-graphic"><div className="graphic-card g1"><span>FACTURE</span><i/><i/><i/><b/></div><div className="graphic-card g2"><span>DEVIS</span><i/><i/><b/></div></div></div>
            <div className="stats-grid"><div className="stat-card"><span className="stat-icon blue"><Users size={20}/></span><span>Clients</span><strong>{clients.length}</strong><small>Fiches enregistrées</small></div><div className="stat-card"><span className="stat-icon coral"><FileText size={20}/></span><span>Factures</span><strong>{invoices.length}</strong><small>{unverified ? `${unverified} situation(s) à vérifier` : 'Documents enregistrés'}</small></div><div className="stat-card"><span className="stat-icon gold"><Wallet size={20}/></span><span>Soldes « En cours » du tableau</span><strong>{money(due)}</strong><small>À rapprocher des paiements récents</small></div><div className="stat-card"><span className="stat-icon lilac"><CalendarDays size={20}/></span><span>Mois de prestation</span><strong>{months}</strong><small>Sur les factures mensuelles</small></div><div className="stat-card"><span className="stat-icon green"><Banknote size={20}/></span><span>Entrées cash · ce mois</span><strong>{money(cashMonth)}</strong><small>{db.cashEntries.filter(item => item.date.startsWith(thisMonth)).length} paiement(s) enregistrés</small></div><div className="stat-card"><span className="stat-icon gold"><Wallet size={20}/></span><span>Avances à me rembourser</span><strong>{money(advanceDue)}</strong><small>Dépenses payées personnellement</small></div></div>
            <div className="dashboard-columns"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">Activité</span><h3>Documents récents</h3></div><button className="text-button" onClick={() => navigate('invoices')}>Voir les factures <ArrowRight size={15}/></button></div>{db.documents.length ? <div className="mini-list">{[...db.documents].sort((a,b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0,5).map(d => <button key={d.id} onClick={() => setDialog({ type: 'document', value: d })}><span className="mini-icon"><FileText size={18}/></span><span><b>{d.clientNameSnapshot}</b><small>{d.reference || 'Brouillon'} · {dateFr(d.issuedAt)}</small></span><strong>{money(total(d))}</strong></button>)}</div> : <div className="panel-empty"><FilePlus2 size={25}/><strong>Aucun document pour le moment</strong><span>Vos factures et devis apparaîtront ici.</span></div>}</div><div className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">Accès rapide</span><h3>Que souhaitez-vous faire ?</h3></div></div><button onClick={() => setDialog({ type: 'client', value: emptyClient() })}><span className="quick-icon"><Building2 size={20}/></span><span><strong>Ajouter un client</strong><small>Créer une nouvelle fiche</small></span><ArrowRight size={18}/></button><button onClick={() => setDialog({ type: 'document', value: emptyDocument('quote') })}><span className="quick-icon"><ClipboardList size={20}/></span><span><strong>Créer un devis</strong><small>Préparer une proposition</small></span><ArrowRight size={18}/></button><button onClick={() => setDialog({ type: 'document', value: emptyDocument('invoice') })}><span className="quick-icon"><CreditCard size={20}/></span><span><strong>Créer une facture</strong><small>Ponctuelle ou mensuelle</small></span><ArrowRight size={18}/></button></div></div>
          </>}
          {view === 'clients' && <>
            <div className="page-title-row"><div><div className="eyebrow">Répertoire</div><h1>Clients</h1><p>Les informations de référence pour vos documents et votre suivi.</p></div><button className="button primary" onClick={() => setDialog({ type: 'client', value: emptyClient() })}><Plus size={18}/> Nouveau client</button></div>
            {selectedClient ? <div className="client-detail"><button className="back-link" onClick={() => setSelectedClientId(null)}><ArrowLeft size={17}/> Tous les clients</button><div className="detail-head"><div className="client-avatar">{selectedClient.name.slice(0,2).toUpperCase()}</div><div><span className="eyebrow">Fiche client</span><h2>{selectedClient.name}</h2><p>{selectedClient.alias || selectedClient.sector || 'Client DMC'}</p></div><div className="detail-actions"><button className="button soft" onClick={() => openPrint({ type: 'statement', client: selectedClient })}><Printer size={17}/> Relevé PDF</button><button className="button outline" onClick={() => setDialog({ type: 'client', value: selectedClient })}><Settings2 size={17}/> Modifier</button></div></div><div className="detail-grid"><div className="info-card"><span>ICE</span><strong>{selectedClient.ice || '—'}</strong></div><div className="info-card"><span>Facturation</span><strong>{selectedClient.billingModel === 'monthly' ? 'Mensuelle' : 'Ponctuelle'}</strong></div><div className="info-card"><span>Situation</span><strong>{relationshipLabel(selectedClient.relationshipStatus)}</strong></div><div className="info-card"><span>Contact</span><strong>{selectedClient.email || selectedClient.phone || '—'}</strong></div></div>{selectedClient.billingModel === 'monthly' && <MonthlyFollowUp client={selectedClient} docs={invoices.filter(d => d.clientId === selectedClient.id)} onConfigure={() => setDialog({ type: 'client', value: selectedClient })}/>}<div className="panel"><div className="panel-heading"><div><span className="eyebrow">Historique</span><h3>Documents du client</h3></div><button className="text-button" onClick={() => setDialog({ type: 'document', value: { ...emptyDocument('invoice', selectedClient.id), category: selectedClient.billingModel } })}><Plus size={16}/> Facture</button></div><DocumentRows docs={db.documents.filter(d => d.clientId === selectedClient.id)} onEdit={d => setDialog({ type: 'document', value: d })} onPrint={d => openPrint({ type: 'document', doc: d })}/></div><button className="button danger-text delete-client" onClick={() => deleteClient(selectedClient)}><Trash2 size={16}/> Supprimer cette fiche client</button></div> : <div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client, un alias, un ICE..."/></div><span>{shownClients.length} client{shownClients.length > 1 ? 's' : ''}</span></div>{shownClients.length ? <div className="client-list">{shownClients.map(c => <button onClick={() => setSelectedClientId(c.id)} key={c.id}><span className="client-avatar small">{c.name.slice(0,2).toUpperCase()}</span><span className="client-list-name"><strong>{c.name}</strong><small>{c.alias || c.sector || 'Client DMC'} · {c.billingModel === 'monthly' ? 'Mensuel' : 'Ponctuel'} · {relationshipLabel(c.relationshipStatus)}</small></span><span className="client-ice">ICE {c.ice || '—'}</span><ArrowRight size={18}/></button>)}</div> : <div className="empty-state"><div className="empty-illustration"><Users size={32}/></div><h3>{search ? 'Aucun résultat' : 'Votre répertoire est prêt'}</h3><p>{search ? 'Essayez une autre recherche.' : 'Ajoutez votre premier client pour commencer à créer des documents.'}</p>{!search && <button className="button primary" onClick={() => setDialog({ type: 'client', value: emptyClient() })}><Plus size={17}/> Ajouter un client</button>}</div>}</div>}
          </>}
          {(view === 'invoices' || view === 'quotes') && <><div className="page-title-row"><div><div className="eyebrow">{view === 'invoices' ? 'Gestion des encaissements' : 'Propositions commerciales'}</div><h1>{view === 'invoices' ? 'Factures' : 'Devis'}</h1><p>{view === 'invoices' ? 'Toutes vos factures, ponctuelles et mensuelles, au même endroit.' : 'Préparez et retrouvez vos devis.'}</p></div><button className="button primary" onClick={() => { if (!clients.length) { navigate('clients'); setDialog({ type: 'client', value: emptyClient() }); } else setDialog({ type: 'document', value: emptyDocument(view === 'invoices' ? 'invoice' : 'quote') }); }}><Plus size={18}/> {view === 'invoices' ? 'Nouvelle facture' : 'Nouveau devis'}</button></div><div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une référence, un client..."/></div><span>{shownDocs.length} document{shownDocs.length > 1 ? 's' : ''}</span></div><DocumentRows docs={shownDocs} onEdit={d => setDialog({ type: 'document', value: d })} onPrint={d => openPrint({ type: 'document', doc: d })} emptyTitle={search ? 'Aucun résultat' : `Aucun ${view === 'invoices' ? 'facture' : 'devis'} pour le moment`} emptyText={search ? 'Essayez une autre recherche.' : 'Les documents ajoutés apparaîtront ici.'}/></div></>}
          {view === 'cash' && <CashPage entries={db.cashEntries} clients={clients} invoices={invoices} onSave={saveCash} onDelete={deleteCash}/>}
          {view === 'expenses' && <ExpensesPage expenses={db.expenses} rules={db.recurringExpenses} onSaveExpense={saveExpense} onDeleteExpense={deleteExpense} onSaveRule={saveRule} onStopRule={stopRule}/>}
          {view === 'advances' && <AdvancesPage expenses={db.expenses} onSave={saveReimbursement} onDelete={deleteReimbursement} onNewExpense={() => navigate('expenses')}/>}
          {view === 'imports' && <><div className="page-title-row"><div><div className="eyebrow">Rapprochement des sources</div><h1>Revue 2026</h1><p>Références du tableau rapprochées des PDF Drive. Les factures sans pièce sont visibles comme entrées provisoires.</p></div></div><div className="panel list-panel"><div className="list-toolbar"><div className="search-box"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, client, écart..."/></div><span>{db.imports.filter(r => r.disposition === 'review').length} à contrôler</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Réf.</th><th>Client tableau</th><th>Source</th><th>Montant TTC</th><th>Traitement</th><th>Point à vérifier</th></tr></thead><tbody>{db.imports.filter(r => `${r.reference} ${r.rawClient} ${r.reviewReason || ''}`.toLowerCase().includes(search.toLowerCase())).map(r => <tr key={r.id}><td><strong>{r.reference}</strong><small>Ligne {r.sheetRow}</small></td><td>{r.rawClient || '—'}</td><td>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>PDF Drive ↗</a> : r.sourceFile || 'Tableau seul'}</td><td>{r.amountTtc == null ? '—' : money(r.amountTtc)}</td><td><span className="status">{r.disposition === 'integrated' ? 'Intégrée' : r.disposition === 'excluded' ? 'Écartée' : r.disposition === 'reserved' ? 'Réservée' : 'Provisoire'}</span></td><td>{r.reviewReason || '—'}</td></tr>)}</tbody></table></div></div></>}
          {view === 'settings' && <><div className="page-title-row"><div><div className="eyebrow">Émetteur des documents</div><h1>Identité DMC</h1><p>Ces informations figurent sur les factures, devis et relevés PDF.</p></div><button className="button outline" onClick={downloadBackup}><ArrowDownToLine size={17}/> Télécharger la sauvegarde JSON</button></div><div className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">Coordonnées</span><h3>Informations de l’agence</h3></div><span className="autosave">Enregistrement automatique</span></div><div className="settings-grid">{([['name','Nom de l’agence'],['address','Adresse'],['ice','ICE'],['rc','RC'],['if','IF'],['phone','Téléphone'],['email','Email']] as [keyof Company,string][]).map(([key,label]) => <label key={key}>{label}<input value={db.company[key] || ''} onChange={e => updateCompany(key,e.target.value)} /></label>)}</div><div className="asset-settings"><div className="asset-card"><strong>Logo DMC</strong><div className="asset-preview logo-preview">{db.company.logoDataUrl ? <img src={db.company.logoDataUrl} alt="Logo actuel de DMC"/> : <span>Aucun logo enregistré</span>}</div><label>Remplacer le logo (SVG/PNG)<input type="file" accept="image/svg+xml,image/png" onChange={e => uploadCompanyAsset('logoDataUrl', e.target.files?.[0])}/></label></div><div className="asset-card"><strong>Cachet et signature</strong><div className="asset-preview stamp-preview">{db.company.stampDataUrl ? <img src={db.company.stampDataUrl} alt="Cachet et signature actuels de DMC"/> : <span>Aucun cachet enregistré</span>}</div><label>Remplacer le cachet (SVG/PNG)<input type="file" accept="image/svg+xml,image/png" onChange={e => uploadCompanyAsset('stampDataUrl', e.target.files?.[0])}/></label></div></div><div className="settings-note">Les aperçus montrent les fichiers enregistrés. Le champ de sélection affiche « Aucun fichier choisi » après un rechargement, même si le logo ou le cachet est déjà présent. La sauvegarde JSON contient aussi ces deux images : gardez-la hors de GitHub.</div></div></>}
        </div>
      </main>
    </div>
    {dialog?.type === 'client' && <ClientEditor key={dialog.value.id} initial={dialog.value} onClose={() => setDialog(null)} onSave={saveClient}/>}
    {dialog?.type === 'document' && <DocumentEditor key={dialog.value.id} initial={dialog.value} clients={clients} documents={db.documents} onClose={() => setDialog(null)} onSave={saveDocument} onDelete={deleteDocument}/>}
    {printTarget && <div className="print-overlay"><div className="print-toolbar"><div><strong>{printTarget.type === 'document' ? (printTarget.doc.reference || 'Brouillon') : `Relevé · ${printTarget.client.name}`}</strong><span>Aperçu A4 · utiliser « Enregistrer en PDF » dans l’impression</span></div><div><button className="button outline" onClick={() => setPrintTarget(null)}><X size={17}/> Fermer</button><button className="button primary" onClick={() => window.print()}><Printer size={17}/> Imprimer / PDF</button></div></div><div className="print-scroll">{printTarget.type === 'document' ? <DocumentPrint doc={printTarget.doc} client={clients.find(c => c.id === printTarget.doc.clientId)} company={db.company}/> : <StatementPrint client={printTarget.client} docs={db.documents} company={db.company}/>}</div></div>}
    <CloudGate cloud={cloud} hasLocalData={!!(db.clients.length || db.documents.length || db.cashEntries.length || db.expenses.length)}/>
  </>;
}

function DocumentRows({ docs, onEdit, onPrint, emptyTitle = 'Aucun document', emptyText = 'Les documents apparaîtront ici.' }: { docs: Document[]; onEdit: (d: Document) => void; onPrint: (d: Document) => void; emptyTitle?: string; emptyText?: string }) {
  if (!docs.length) return <div className="empty-state"><div className="empty-illustration"><FileText size={32}/></div><h3>{emptyTitle}</h3><p>{emptyText}</p></div>;
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Catégorie / période</th><th>Montant TTC</th><th>Statut</th><th></th></tr></thead><tbody>{docs.map(doc => <tr key={doc.id} onClick={() => onEdit(doc)}><td><strong>{doc.reference || 'Brouillon'}</strong><small>{doc.subject || (doc.kind === 'invoice' ? 'Facture' : 'Devis')}{doc.provisional ? ' · Provisoire' : doc.historical ? ' · Archive' : ''}</small></td><td>{doc.clientNameSnapshot}</td><td>{dateFr(doc.issuedAt)}</td><td>{doc.category === 'monthly' ? <>Mensuelle<small>{dateFr(doc.periodStart)} → {dateFr(doc.periodEnd)}</small></> : 'Ponctuelle'}</td><td className="amount">{money(total(doc))}</td><td><span className={`status ${status(doc).toLowerCase().replace(' ', '-')}`}>{doc.reference ? status(doc) : 'Brouillon'}</span></td><td>{doc.historical ? doc.sourceUrl ? <a href={doc.sourceUrl} target="_blank" rel="noreferrer" title="PDF d’origine" onClick={e => e.stopPropagation()}>PDF ↗</a> : <small>PDF manquant</small> : <button className="icon-button" title="Aperçu PDF" aria-label="Aperçu PDF" onClick={e => { e.stopPropagation(); onPrint(doc); }}><Printer size={17}/></button>}</td></tr>)}</tbody></table></div>;
}

const relationshipLabel = (value: Client['relationshipStatus']) => ({ client: 'Actif', former: 'Ancien client', prospect: 'Prospect', upcoming: 'À démarrer' })[value];

function MonthlyFollowUp({ client, docs, onConfigure }: { client: Client; docs: Document[]; onConfigure: () => void }) {
  if (!client.monthlyStart) return <div className="panel monthly-panel"><strong>Suivi mensuel à configurer</strong><p>La date de début n’est pas connue. Elle est nécessaire pour repérer les mois sans facture, sans inventer une période de contrat.</p><button className="button soft" onClick={onConfigure}>Renseigner les dates</button></div>;
  const start = new Date(`${client.monthlyStart.slice(0, 7)}-01T12:00:00`);
  const end = client.monthlyEnd ? new Date(`${client.monthlyEnd.slice(0, 7)}-01T12:00:00`) : new Date();
  const months: string[] = [];
  for (let d = new Date(start); d <= end && months.length < 60; d.setMonth(d.getMonth() + 1)) months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  const covered = new Set(docs.filter(d => d.category === 'monthly' && d.periodStart).map(d => d.periodStart.slice(0, 7)));
  const gaps = months.filter(m => !covered.has(m));
  return <div className="panel monthly-panel"><strong>Suivi mensuel · {months.length} mois prévus</strong><p>{gaps.length ? `${gaps.length} mois sans facture mensuelle enregistrée : ${gaps.slice(0, 12).join(', ')}${gaps.length > 12 ? '…' : ''}.` : 'Chaque mois prévu a une facture mensuelle enregistrée.'} Les factures ponctuelles ne couvrent pas un mois de contrat.</p><small>Début : {dateFr(client.monthlyStart)} · Fin : {client.monthlyEnd ? dateFr(client.monthlyEnd) : 'contrat en cours'}</small></div>;
}

