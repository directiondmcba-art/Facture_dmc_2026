import type { Client, Company, Document, Line } from './types';
import { dateFr, money, paid, remaining, status, subtotal, total, vat } from './data';

function splitLines(lines: Line[], hasStamp = false): Line[][] {
  if (!lines.length) return [[]];
  const heights = lines.map(line => 5.5 + Math.max(0, Math.ceil(line.description.length / 85) - 1) * 4 + (line.description.match(/\n/g)?.length || 0) * 4);
  const limit = 168;
  const reserveLastPage = hasStamp ? 58 : 34;
  const totalHeight = heights.reduce((sum, height) => sum + height, 0);
  let count = Math.max(1, Math.ceil((totalHeight + reserveLastPage) / limit));
  while (count <= lines.length) {
    const pages: Line[][] = [];
    let next = 0;
    let remainingHeight = totalHeight;
    for (let page = 0; page < count; page++) {
      const capacity = limit - (page === count - 1 ? reserveLastPage : 0);
      const target = Math.min(capacity, remainingHeight / (count - page));
      const part: Line[] = [];
      let used = 0;
      while (next < lines.length && (page === count - 1 || next < lines.length - (count - page - 1))) {
        const height = heights[next];
        if (part.length && (used + height > capacity || (used >= target && page < count - 1))) break;
        if (used + height > capacity && part.length) break;
        part.push(lines[next]);
        used += height;
        next++;
      }
      pages.push(part);
      remainingHeight -= used;
    }
    if (next === lines.length && pages.every((part, index) => part.reduce((sum, line) => sum + heights[lines.indexOf(line)], 0) <= limit - (index === count - 1 ? reserveLastPage : 0))) return pages;
    count++;
  }
  return lines.map(line => [line]);
}

function PageHeader({ title, date, reference, company }: { title: string; date: string; reference: string; company: Company }) {
  return <>
    <div className="paper-stripe" />
    <div className="paper-heading">
      <div>
        {company.logoDataUrl && <img className="paper-logo" src={company.logoDataUrl} alt="Logo DMC" />}
        <div className="paper-company">{company.name}</div>
        <div>{company.address}</div>
        <div>ICE : {company.ice}</div>
        <div>Tél : {company.phone}</div>
        <div>Email : {company.email}</div>
      </div>
      <div className="paper-meta"><strong>{title}</strong><span>{dateFr(date)}</span><span>{reference || 'BROUILLON'}</span></div>
    </div>
  </>;
}

function PageFooter({ page, count, company }: { page: number; count: number; company: Company }) {
  return <div className="paper-footer">
    <div>{company.name}, {company.address}</div>
    <div>Tél : (+212) {company.phone} · Email : {company.email.toUpperCase()}</div>
    <div>RC : {company.rc} · IF : {company.if} · ICE : {company.ice}</div>
    {count > 1 && <span className="paper-page-number">Page {page} / {count}</span>}
  </div>;
}

export function DocumentPrint({ doc, client, company }: { doc: Document; client?: Client; company: Company }) {
  const pages = splitLines(doc.lines, !!company.stampDataUrl);
  return <div className="print-pages">
    {pages.map((lines, index) => <section className="paper" key={index}>
      <PageHeader title={doc.kind === 'invoice' ? 'FACTURE' : 'DEVIS'} date={doc.issuedAt} reference={doc.reference} company={company} />
      <div className="paper-client"><strong>NOM DU CLIENT : {doc.clientNameSnapshot || client?.name || '—'}</strong><span>ICE : {doc.clientIceSnapshot || client?.ice || '—'}</span><small>{client?.city || 'Casablanca / Maroc'}</small></div>
      <div className="paper-subject"><strong>{doc.category === 'monthly' && doc.periodStart ? `${dateFr(doc.periodStart)} AU ${dateFr(doc.periodEnd)}` : doc.subject}</strong><span>Montants exprimés en MAD (Dirhams Marocains)</span></div>
      <div className="paper-table-wrap">
        <table className="paper-table"><thead><tr><th>Description</th><th>Qté</th><th>PU HT</th><th>TOTAL HT</th></tr></thead>
          <tbody>{lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity ?? '—'}</td><td>{line.unitPrice === null ? '—' : money(line.unitPrice)}</td><td>{line.amount ? money(line.amount) : '—'}</td></tr>)}</tbody>
        </table>
        {index === pages.length - 1 && <div className="paper-totals">
          <div><strong>Total HT</strong><span>{money(subtotal(doc))}</span></div>
          <div><strong>TVA {doc.vatRate}%</strong><span>{money(vat(doc))}</span></div>
          <div className="paper-grand-total"><strong>Total à payer</strong><strong>{money(total(doc))}</strong></div>
        </div>}
        {index === pages.length - 1 && company.stampDataUrl && <img className="paper-stamp" src={company.stampDataUrl} alt="Cachet et signature DMC" />}
      </div>
      <PageFooter page={index + 1} count={pages.length} company={company} />
    </section>)}
  </div>;
}

export function StatementPrint({ client, docs, company }: { client: Client; docs: Document[]; company: Company }) {
  const invoices = docs.filter(doc => doc.kind === 'invoice' && doc.clientId === client.id).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  const pages: Document[][] = [];
  for (let i = 0; i < invoices.length; i += 15) pages.push(invoices.slice(i, i + 15));
  if (!pages.length) pages.push([]);
  const known = invoices.filter(doc => status(doc) !== 'À vérifier');
  const billed = known.reduce((sum, doc) => sum + total(doc), 0);
  const received = known.reduce((sum, doc) => sum + paid(doc), 0);
  return <div className="print-pages">{pages.map((part, index) => <section className="paper" key={index}>
    <PageHeader title="RELEVÉ CLIENT" date={new Date().toISOString().slice(0, 10)} reference="Situation des factures" company={company} />
    <div className="paper-client"><strong>{client.name}</strong><span>ICE : {client.ice || '—'}</span><small>{client.city || 'Casablanca / Maroc'}</small></div>
    <div className="paper-subject"><strong>Situation au {dateFr(new Date().toISOString().slice(0, 10))}</strong><span>Montants exprimés en MAD</span></div>
    <div className="paper-table-wrap">
      <table className="paper-table statement-table"><thead><tr><th>Référence</th><th>Date</th><th>Période</th><th>Montant TTC</th><th>Payé</th><th>Solde</th><th>Statut</th></tr></thead><tbody>
        {part.map(doc => <tr key={doc.id}><td>{doc.reference}</td><td>{dateFr(doc.issuedAt)}</td><td>{doc.category === 'monthly' ? dateFr(doc.periodStart) : 'Ponctuelle'}</td><td>{money(total(doc))}</td><td>{status(doc) === 'À vérifier' ? '—' : money(paid(doc))}</td><td>{status(doc) === 'À vérifier' ? '—' : money(remaining(doc))}</td><td>{status(doc)}</td></tr>)}
      </tbody></table>
      {!invoices.length && <p className="paper-empty">Aucune facture enregistrée pour ce client.</p>}
      {index === pages.length - 1 && <div className="statement-summary"><span>Total des situations connues : <strong>{money(billed)}</strong></span><span>Montants marqués payés : <strong>{money(received)}</strong></span><span>Solde connu : <strong>{money(Math.max(0, billed - received))}</strong></span></div>}
      {invoices.some(doc => doc.provisional || status(doc) === 'À vérifier' || (doc.historical && doc.historicalPaymentStatus === 'paid' && !doc.historicalPaidAt)) && index === pages.length - 1 && <p className="paper-caution">Certaines factures sont provisoires, dates de paiement manquent ou situations restent à vérifier. Contrôler le relevé avant partage.</p>}
    </div>
    <PageFooter page={index + 1} count={pages.length} company={company} />
  </section>)}</div>;
}
