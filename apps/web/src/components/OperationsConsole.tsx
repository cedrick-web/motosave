import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, BadgeCheck, BriefcaseBusiness, Clock3, FileCheck2, HandCoins, LifeBuoy, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LoanApplication = {
  id: string; application_ref: string; user_id: string; purpose: string; requested_amount: number; term_months: number;
  status: string; submitted_at?: string; created_at?: string;
};
type InsuranceClaim = {
  id: string; policy_id: string; incident_date: string; description: string; status: string; created_at: string;
};
type InsurancePolicy = {
  id: string; policy_number: string | null; status: string; coverage_start: string | null;
  coverage_end: string | null; provider_reference: string | null;
};
type InsuranceQuoteRequest = { id: string; user_id: string; product_id: string | null; motorcycle_id: string | null; notes: string | null; status: string; quoted_premium: number | null; coverage_duration_months: number | null; quoted_terms: Record<string, unknown>; quote_expires_at: string | null; decision_reason: string | null; created_at: string };
type SupportTicket = {
  id: string; subject: string; category: string; description: string; status: string;
  priority: string; assigned_to: string | null; created_at: string;
};
type PartnerOrganization = { id: string; legal_name: string; display_name: string; partner_type: string; public_contact: string | null; status: string; is_published: boolean; created_at: string };
type PartnerMembership = { id: string; user_id: string; organization_id: string; partner_role: string; status: string; created_at: string };
type AdminProfile = { id: string; full_name: string; phone: string | null; role: string; account_status: string; created_at: string };
type AdminLoanProduct = { id: string; partner_id: string; name: string; description: string | null; purpose: string; min_amount: number | null; max_amount: number | null; min_term_months: number | null; max_term_months: number | null; is_published: boolean };
type AdminInsuranceProduct = { id: string; partner_id: string; name: string; description: string | null; coverage_type: string; supports_monthly_payments: boolean; is_published: boolean };
type Queue = {
  role: string;
  loan_applications?: LoanApplication[];
  insurance_claims?: InsuranceClaim[];
  insurance_policies?: InsurancePolicy[];
  insurance_quote_requests?: InsuranceQuoteRequest[];
  support_tickets?: SupportTicket[];
  partner_organizations?: PartnerOrganization[];
  partner_memberships?: PartnerMembership[];
  profiles?: AdminProfile[];
  loan_products?: AdminLoanProduct[];
  insurance_products?: AdminInsuranceProduct[];
};

const fmt = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(Number(value) || 0);
const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-RW', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not recorded';

export default function OperationsConsole({ demo, onNotify }: { demo: boolean; onNotify: (message: string) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [offerFor, setOfferFor] = useState<LoanApplication | null>(null);
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [fees, setFees] = useState('0');
  const [totalRepayment, setTotalRepayment] = useState('');
  const [term, setTerm] = useState('6');
  const [frequency, setFrequency] = useState('monthly');
  const [interestBasis, setInterestBasis] = useState('annual_percentage_rate');
  const [expiresAt, setExpiresAt] = useState('');
  const [policyFor, setPolicyFor] = useState<InsurancePolicy | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');
  const [providerReference, setProviderReference] = useState('');
  const [coverageStart, setCoverageStart] = useState('');
  const [coverageEnd, setCoverageEnd] = useState('');
  const [quoteFor, setQuoteFor] = useState<InsuranceQuoteRequest | null>(null);
  const [quotedPremium, setQuotedPremium] = useState('');
  const [coverageMonths, setCoverageMonths] = useState('12');
  const [quotedTerms, setQuotedTerms] = useState('{"coverage":"Describe the included cover","exclusions":[],"payment_conditions":"Confirm with insurer"}');
  const [quoteExpiry, setQuoteExpiry] = useState('');

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase || demo) throw new Error('Operations require a connected Supabase project and a non-demo account.');
    const { data, error: invocationError } = await supabase.functions.invoke('partner-operations', { body });
    if (invocationError) throw invocationError;
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }, [demo]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await invoke({ action: 'list_queue' });
      setQueue(data.queue as Queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The operations queue could not be loaded.');
    } finally { setLoading(false); }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(action: string, idName: string, id: string, status: string) {
    if (reason.trim().length < 5) {
      setError('Enter a short, accurate reason in the audit note field before changing a record.');
      return;
    }
    setBusyId(id); setError('');
    try {
      await invoke({ action, [idName]: id, status, reason: reason.trim() });
      onNotify('Status updated and audit event recorded.');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The status update failed.');
    } finally { setBusyId(''); }
  }

  function prepareOffer(application: LoanApplication) {
    setOfferFor(application);
    setPrincipal(String(application.requested_amount));
    setTotalRepayment(String(Math.ceil(Number(application.requested_amount) * 1.12)));
    setTerm(String(application.term_months || 6));
    setRate('12');
    setFees('0');
    setFrequency('monthly');
    setInterestBasis('annual_percentage_rate');
    setExpiresAt('');
  }

  async function submitOffer(event: FormEvent) {
    event.preventDefault();
    if (!offerFor) return;
    if (reason.trim().length < 5) { setError('Enter a clear audit reason before creating a loan offer.'); return; }
    setBusyId(offerFor.id); setError('');
    try {
      await invoke({
        action: 'create_loan_offer',
        application_id: offerFor.id,
        principal_amount: Number(principal),
        interest_rate: Number(rate),
        interest_basis: interestBasis,
        fees: Number(fees),
        term_months: Number(term),
        payment_frequency: frequency,
        total_repayment: Number(totalRepayment),
        expires_at: expiresAt || null,
        reason: reason.trim(),
      });
      onNotify('Offer recorded. The applicant must review the lender terms before acceptance.');
      setOfferFor(null); setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The loan offer could not be created.');
    } finally { setBusyId(''); }
  }


  async function submitQuote(event: FormEvent) {
    event.preventDefault();
    if (!quoteFor) return;
    if (reason.trim().length < 5) { setError('Enter an audit reason before issuing the quote.'); return; }
    let terms: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(quotedTerms);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Quote terms must be a JSON object.');
      terms = parsed as Record<string, unknown>;
    } catch {
      setError('Quote terms must be valid JSON object content, including exclusions and payment conditions.');
      return;
    }
    if (!quoteExpiry || Number.isNaN(Date.parse(quoteExpiry)) || Date.parse(quoteExpiry) <= Date.now()) {
      setError('Set an expiry time in the future.');
      return;
    }
    const premium = Number(quotedPremium);
    const months = Number(coverageMonths);
    if (!Number.isFinite(premium) || premium <= 0 || !Number.isInteger(months) || months < 1 || months > 120) {
      setError('Enter a premium above zero and a coverage term between 1 and 120 months.');
      return;
    }
    setBusyId(quoteFor.id); setError('');
    try {
      await invoke({
        action: 'respond_to_quote_request',
        quote_request_id: quoteFor.id,
        status: 'quote_available',
        quoted_premium: premium,
        coverage_duration_months: months,
        quoted_terms: terms,
        quote_expires_at: new Date(quoteExpiry).toISOString(),
        reason: reason.trim(),
      });
      onNotify('Quote published for the applicant to review. It is not active insurance coverage.');
      setQuoteFor(null); setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The quote could not be published.');
    } finally { setBusyId(''); }
  }

  async function activatePolicy(event: FormEvent) {
    event.preventDefault();
    if (!policyFor) return;
    if (!policyNumber.trim() || !providerReference.trim() || !coverageStart || !coverageEnd || reason.trim().length < 5) {
      setError('Policy number, provider reference, coverage dates, and an audit reason are required.');
      return;
    }
    setBusyId(policyFor.id); setError('');
    try {
      await invoke({
        action: 'update_policy_status', policy_id: policyFor.id, status: 'active',
        policy_number: policyNumber.trim(), provider_reference: providerReference.trim(),
        coverage_start: coverageStart, coverage_end: coverageEnd, reason: reason.trim(),
      });
      onNotify('Policy record updated. Confirm issuance with the responsible insurer/provider.');
      setPolicyFor(null); setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The policy could not be updated.');
    } finally { setBusyId(''); }
  }

  if (demo) return <div className="section-stack"><div className="info-callout"><ShieldAlert size={19} /><div><b>Operations are unavailable in demo mode</b><span>Connect a Supabase project and sign in with a partner role assigned through an approved administrative process. The demo client must never operate on real partner records.</span></div></div></div>;

  return <div className="section-stack">
    <div className="operations-hero"><div className="operations-hero-icon"><BriefcaseBusiness size={24} /></div><div><span className="eyebrow light-eyebrow">CONTROLLED PARTNER WORKSPACE</span><h2>Operations, with an audit trail.</h2><p>Queue visibility and state changes are authorised by a server-side role and organization check. Avoid making a decision you cannot support with the record.</p></div><button className="button button-white" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh queue</button></div>
    <div className="info-callout"><ShieldCheck size={19} /><div><b>Server-enforced scope</b><span>The Edge Function checks the signed-in profile, active partner membership, organization type, and verified partner status. Elevated actions are written to audit_logs.</span></div></div>
    <div className="operations-reason"><label htmlFor="ops-reason">Audit note for the next action</label><textarea id="ops-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter the factual reason for a status change, offer, claim decision, or support action." /><small>This note is required for each change. Use factual, concise language.</small></div>
    {error && <div className="alert alert-error"><AlertCircle size={15} /> {error}</div>}
    {loading && <div className="panel loading-panel"><RefreshCw size={18} className="spin-icon" /> Loading authorized queues…</div>}
    {!loading && queue && queue.role === 'platform_admin' && <PartnerAdministration queue={queue} invoke={invoke} reload={load} onNotify={onNotify} reason={reason} onReasonUsed={() => setReason('')} />}
    {!loading && queue && <div className="operations-summary">
      <div className="operation-metric"><span>Authorized role</span><b>{queue.role.replaceAll('_',' ')}</b><small>Resolved from your protected profile</small></div>
      <div className="operation-metric"><span>Loan requests</span><b>{queue.loan_applications?.length || 0}</b><small>Visible within your authorized scope</small></div>
      <div className="operation-metric"><span>Quote requests</span><b>{queue.insurance_quote_requests?.length || 0}</b><small>Product-routed requests from riders</small></div>
      <div className="operation-metric"><span>Insurance claims</span><b>{queue.insurance_claims?.length || 0}</b><small>Insurer-scoped claims or admin review</small></div>
      <div className="operation-metric"><span>Support requests</span><b>{queue.support_tickets?.length || 0}</b><small>Open and assigned tickets in the queue</small></div>
    </div>}

    {!!queue?.loan_applications?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><HandCoins size={17} /> Lending queue</h3><p>All offers require clear total repayment, fees, term, and frequency.</p></div><span className="count-pill">{queue.loan_applications.length}</span></div>
      <div className="operations-list">{queue.loan_applications.map((application) => <article className="operation-card" key={application.id}><div className="operation-card-main"><b>{application.application_ref} · {application.purpose.replaceAll('_',' ')}</b><span>{fmt(Number(application.requested_amount))} requested · {application.term_months} months</span><small>Received {fmtDate(application.submitted_at || application.created_at)} · Applicant ID {application.user_id.slice(0,8)}…</small></div><span className={'status-pill ' + statusTone(application.status)}>{application.status.replaceAll('_',' ')}</span><div className="operation-buttons"><button className="button button-secondary" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'under_review')}>Start review</button><button className="button button-secondary" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'awaiting_documents')}>Request documents</button><button className="button button-primary" disabled={busyId===application.id} onClick={() => prepareOffer(application)}>Prepare offer</button><button className="button button-quiet" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'rejected_by_lender')}>Reject</button></div>
        {offerFor?.id===application.id && <form className="offer-form" onSubmit={submitOffer}><div className="offer-form-title"><b>Create lender offer</b><button type="button" className="text-button" onClick={()=>setOfferFor(null)}>Close</button></div><div className="offer-fields"><label>Principal amount (RWF)<input type="number" min="1" value={principal} onChange={(e)=>setPrincipal(e.target.value)} required /></label><label>Interest rate value<input type="number" min="0" step="0.00001" value={rate} onChange={(e)=>setRate(e.target.value)} required /></label><label>Interest basis<input value={interestBasis} onChange={(e)=>setInterestBasis(e.target.value)} required maxLength={80} /></label><label>Fees (RWF)<input type="number" min="0" step="1" value={fees} onChange={(e)=>setFees(e.target.value)} required /></label><label>Total repayment (RWF)<input type="number" min="1" step="1" value={totalRepayment} onChange={(e)=>setTotalRepayment(e.target.value)} required /></label><label>Term (months)<input type="number" min="1" max="120" step="1" value={term} onChange={(e)=>setTerm(e.target.value)} required /></label><label>Payment frequency<select value={frequency} onChange={(e)=>setFrequency(e.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label><label>Offer expiry <span className="optional-label">Optional</span><input type="datetime-local" value={expiresAt} onChange={(e)=>setExpiresAt(e.target.value)} /></label></div><div className="inline-note"><AlertCircle size={15} /> The rate basis and full costs must match the lender's binding terms. This screen does not calculate an amortization schedule.</div><button className="button button-primary" type="submit" disabled={busyId===application.id}>{busyId===application.id?'Saving offer…':'Create and record offer' } <ArrowRight size={15}/></button></form>}
      </article>)}</div>
    </section>}

    {!!queue?.insurance_quote_requests?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><ShieldCheck size={17} /> Insurance quote requests</h3><p>Publish only accurate pricing and official coverage terms. An issued quote is not active cover.</p></div><span className="count-pill">{queue.insurance_quote_requests.length}</span></div>
      <div className="operations-list">{queue.insurance_quote_requests.map((quote) => <article className="operation-card" key={quote.id}><div className="operation-card-main"><b>Quote request · {fmtDate(quote.created_at)}</b><span>{quote.notes || 'No additional notes supplied.'}</span><small>Applicant {quote.user_id.slice(0,8)}… · Product {quote.product_id ? quote.product_id.slice(0,8)+'…' : 'Not routed'} · Motorcycle {quote.motorcycle_id ? quote.motorcycle_id.slice(0,8)+'…' : 'Not linked'}</small>{quote.quoted_premium ? <small>Quoted {fmt(Number(quote.quoted_premium))} · {quote.coverage_duration_months} months · Expires {fmtDate(quote.quote_expires_at)}</small> : null}</div><span className={'status-pill '+statusTone(quote.status)}>{quote.status.replaceAll('_',' ')}</span><div className="operation-buttons">{quote.product_id ? <><button className="button button-secondary" disabled={busyId===quote.id} onClick={() => void updateStatus('respond_to_quote_request','quote_request_id',quote.id,'under_review')}>Start review</button><button className="button button-secondary" disabled={busyId===quote.id} onClick={() => void updateStatus('respond_to_quote_request','quote_request_id',quote.id,'information_requested')}>Request information</button><button className="button button-primary" disabled={busyId===quote.id} onClick={() => {setQuoteFor(quote);setQuotedPremium('');setCoverageMonths('12');setQuoteExpiry('');}}>Prepare quote</button><button className="button button-quiet" disabled={busyId===quote.id} onClick={() => void updateStatus('respond_to_quote_request','quote_request_id',quote.id,'declined')}>Decline</button></> : <span className="status-pill neutral">Select a published insurer product before routing</span>}</div>
      {quoteFor?.id===quote.id && <form className="offer-form" onSubmit={submitQuote}><div className="offer-form-title"><b>Issue an insurance quote</b><button type="button" className="text-button" onClick={()=>setQuoteFor(null)}>Close</button></div><div className="offer-fields"><label>Premium (RWF)<input type="number" min="1" step="1" value={quotedPremium} onChange={(e)=>setQuotedPremium(e.target.value)} required /></label><label>Coverage term (months)<input type="number" min="1" max="120" step="1" value={coverageMonths} onChange={(e)=>setCoverageMonths(e.target.value)} required /></label><label>Expiry time<input type="datetime-local" value={quoteExpiry} onChange={(e)=>setQuoteExpiry(e.target.value)} required /></label></div><label className="quote-terms-label">Coverage terms as JSON<textarea rows={6} value={quotedTerms} onChange={(e)=>setQuotedTerms(e.target.value)} required /></label><div className="inline-note"><AlertCircle size={15}/> Include important exclusions, payment conditions, and all term details. Do not publish a quote unless the insurer has authorized it.</div><button className="button button-primary" type="submit" disabled={busyId===quote.id}>{busyId===quote.id?'Publishing…':'Publish quote for applicant'}</button></form>}
      </article>)}</div>
    </section>}

    {!!queue?.insurance_claims?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><FileCheck2 size={17} /> Insurance claim queue</h3><p>Record decisions only when supported by the insurer's assessment.</p></div><span className="count-pill">{queue.insurance_claims.length}</span></div>
      <div className="operations-list">{queue.insurance_claims.map((claim) => <article className="operation-card" key={claim.id}><div className="operation-card-main"><b>Claim · {fmtDate(claim.incident_date)}</b><span>{claim.description}</span><small>Policy {claim.policy_id.slice(0,8)}… · Created {fmtDate(claim.created_at)}</small></div><span className={'status-pill ' + statusTone(claim.status)}>{claim.status.replaceAll('_',' ')}</span><div className="operation-buttons"><button className="button button-secondary" disabled={busyId===claim.id} onClick={() => void updateStatus('update_claim_status','claim_id',claim.id,'under_review')}>Start review</button><button className="button button-secondary" disabled={busyId===claim.id} onClick={() => void updateStatus('update_claim_status','claim_id',claim.id,'information_requested')}>Request info</button><button className="button button-primary" disabled={busyId===claim.id} onClick={() => void updateStatus('update_claim_status','claim_id',claim.id,'accepted')}>Accept</button><button className="button button-quiet" disabled={busyId===claim.id} onClick={() => void updateStatus('update_claim_status','claim_id',claim.id,'rejected')}>Reject</button><button className="button button-secondary" disabled={busyId===claim.id} onClick={() => void updateStatus('update_claim_status','claim_id',claim.id,'settled')}>Mark settled</button></div></article>)}</div>
    </section>}

    {!!queue?.insurance_policies?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><ShieldCheck size={17} /> Policy records</h3><p>Active coverage requires a policy number, provider reference, and valid coverage dates.</p></div><span className="count-pill">{queue.insurance_policies.length}</span></div>
      <div className="operations-list">{queue.insurance_policies.map((policy) => <article className="operation-card" key={policy.id}><div className="operation-card-main"><b>{policy.policy_number || 'Policy not yet numbered'}</b><span>{policy.coverage_start || 'Start pending'} to {policy.coverage_end || 'End pending'}</span><small>Provider reference: {policy.provider_reference || 'Not recorded'}</small></div><span className={'status-pill ' + statusTone(policy.status)}>{policy.status.replaceAll('_',' ')}</span><div className="operation-buttons"><button className="button button-primary" disabled={busyId===policy.id} onClick={()=>{setPolicyFor(policy);setPolicyNumber(policy.policy_number||'');setProviderReference(policy.provider_reference||'');setCoverageStart(policy.coverage_start||'');setCoverageEnd(policy.coverage_end||'');}}>Record active coverage</button><button className="button button-secondary" disabled={busyId===policy.id} onClick={()=>void updateStatus('update_policy_status','policy_id',policy.id,'suspended')}>Suspend</button><button className="button button-quiet" disabled={busyId===policy.id} onClick={()=>void updateStatus('update_policy_status','policy_id',policy.id,'expired')}>Mark expired</button></div>
        {policyFor?.id===policy.id && <form className="offer-form" onSubmit={activatePolicy}><div className="offer-form-title"><b>Confirm insurer-issued policy details</b><button type="button" className="text-button" onClick={()=>setPolicyFor(null)}>Close</button></div><div className="offer-fields"><label>Policy number<input value={policyNumber} onChange={(e)=>setPolicyNumber(e.target.value)} required /></label><label>Provider reference<input value={providerReference} onChange={(e)=>setProviderReference(e.target.value)} required /></label><label>Coverage start<input type="date" value={coverageStart} onChange={(e)=>setCoverageStart(e.target.value)} required /></label><label>Coverage end<input type="date" value={coverageEnd} onChange={(e)=>setCoverageEnd(e.target.value)} required /></label></div><div className="inline-note"><ShieldAlert size={15}/> Use these actions only after verifying the insurer's own issuance record. This console does not contact an insurer API.</div><button className="button button-primary" disabled={busyId===policy.id} type="submit">{busyId===policy.id?'Saving…':'Confirm policy record'}</button></form>}
      </article>)}</div>
    </section>}

    {!!queue?.support_tickets?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><LifeBuoy size={17} /> Support queue</h3><p>Handle account requests without asking customers for passwords or payment PINs.</p></div><span className="count-pill">{queue.support_tickets.length}</span></div>
      <div className="operations-list">{queue.support_tickets.map((ticket) => <article className="operation-card" key={ticket.id}><div className="operation-card-main"><b>{ticket.subject}</b><span>{ticket.description}</span><small>{ticket.category} · {ticket.priority} · {fmtDate(ticket.created_at)} · Assigned {ticket.assigned_to ? ticket.assigned_to.slice(0,8)+'…' : 'nobody'}</small></div><span className={'status-pill ' + statusTone(ticket.status)}>{ticket.status.replaceAll('_',' ')}</span><div className="operation-buttons"><button className="button button-secondary" disabled={busyId===ticket.id} onClick={() => void updateStatus('assign_support_ticket','ticket_id',ticket.id,'assigned')}>Assign to me</button><button className="button button-primary" disabled={busyId===ticket.id} onClick={() => void updateStatus('assign_support_ticket','ticket_id',ticket.id,'resolved')}>Mark resolved</button></div></article>)}</div>
    </section>}

    {!loading && queue && queue.role !== 'platform_admin' && !queue.loan_applications?.length && !queue.insurance_claims?.length && !queue.insurance_policies?.length && !queue.insurance_quote_requests?.length && !queue.support_tickets?.length && <div className="empty-card"><span className="empty-illustration"><BadgeCheck size={28}/></span><h3>Queue is clear</h3><p>No items currently match your authorized operational scope.</p></div>}
    <div className="small muted operations-footer"><Clock3 size={14}/> Every successful state change is written to the audit log. Server permissions remain authoritative even when this UI is modified.</div>
  </div>;
}

function PartnerAdministration({ queue, invoke, reload, onNotify, reason, onReasonUsed }: {
  queue: Queue;
  invoke: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  reload: () => Promise<void>;
  onNotify: (message: string) => void;
  reason: string;
  onReasonUsed: () => void;
}) {
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizationType, setOrganizationType] = useState('lender');
  const [publicContact, setPublicContact] = useState('');
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberOrganizationId, setMemberOrganizationId] = useState('');
  const [memberRole, setMemberRole] = useState('lender_officer');
  const [internalUserId, setInternalUserId] = useState('');
  const [internalRole, setInternalRole] = useState('support_agent');
  const [assigningRole, setAssigningRole] = useState(false);
  const [productType, setProductType] = useState('loan');
  const [productOrganizationId, setProductOrganizationId] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPurpose, setProductPurpose] = useState('motorcycle_maintenance');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [minTerm, setMinTerm] = useState('3');
  const [maxTerm, setMaxTerm] = useState('36');
  const [coverageType, setCoverageType] = useState('motorcycle_third_party');
  const [exclusions, setExclusions] = useState('');
  const [premiumBasis, setPremiumBasis] = useState('quote_required');
  const [monthlyPayments, setMonthlyPayments] = useState(false);
  const [termsJson, setTermsJson] = useState('{"notes":"Confirm complete terms directly with the partner."}');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [error, setError] = useState('');

  const organizations = queue.partner_organizations || [];
  const profiles = (queue.profiles || []).filter((profile) => profile.account_status === 'active');
  const loanProducts = queue.loan_products || [];
  const insuranceProducts = queue.insurance_products || [];
  const selectedOrganization = organizations.find((org) => org.id === memberOrganizationId);
  const memberRoles = selectedOrganization?.partner_type === 'lender' ? ['lender_officer']
    : selectedOrganization?.partner_type === 'insurer' ? ['insurer_officer']
    : selectedOrganization?.partner_type === 'cooperative' ? ['cooperative_officer'] : [];

  async function runOperation(action: string, payload: Record<string, unknown>, message: string) {
    if (reason.trim().length < 5) { setError('Enter a factual audit note above before making an administrative change.'); return; }
    setError('');
    try {
      await invoke({ action, ...payload, reason: reason.trim() });
      onReasonUsed();
      onNotify(message);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The administrative operation failed.');
    }
  }

  async function createOrganization(event: FormEvent) {
    event.preventDefault();
    if (legalName.trim().length < 2 || displayName.trim().length < 2) { setError('Enter the full legal name and public display name.'); return; }
    if (reason.trim().length < 5) { setError('Enter a factual audit note above before creating an organization.'); return; }
    setCreatingOrganization(true); setError('');
    try {
      await invoke({
        action: 'create_partner_organization',
        legal_name: legalName.trim(),
        display_name: displayName.trim(),
        partner_type: organizationType,
        public_contact: publicContact.trim() || null,
        reason: reason.trim(),
      });
      setLegalName(''); setDisplayName(''); setPublicContact('');
      onReasonUsed();
      onNotify('Partner organization created in pending-verification status.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The organization could not be created.');
    } finally { setCreatingOrganization(false); }
  }

  async function assignMembership(event: FormEvent) {
    event.preventDefault();
    if (!memberUserId || !memberOrganizationId || !memberRole) { setError('Choose an active profile, organization, and matching partner role.'); return; }
    await runOperation('assign_partner_membership', { user_id: memberUserId, organization_id: memberOrganizationId, partner_role: memberRole }, 'Partner membership assigned. If the organization is not verified, the membership stays pending.');
  }

  async function assignInternalRole(event: FormEvent) {
    event.preventDefault();
    if (!internalUserId) { setError('Choose a profile for the internal role.'); return; }
    setAssigningRole(true);
    try {
      await runOperation('assign_internal_role', { user_id: internalUserId, role: internalRole }, 'Internal support/audit role updated.');
    } finally { setAssigningRole(false); }
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 5) { setError('Enter a factual audit note above before creating a product.'); return; }
    if (!productOrganizationId || productName.trim().length < 2) { setError('Choose a verified partner organization and enter a product name.'); return; }
    let parsedTerms: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(termsJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      parsedTerms = parsed as Record<string, unknown>;
    } catch { setError('Product terms must be a valid JSON object.'); return; }
    setCreatingProduct(true); setError('');
    try {
      if (productType === 'loan') {
        await invoke({
          action: 'create_loan_product', partner_id: productOrganizationId, name: productName.trim(),
          description: productDescription.trim() || null, purpose: productPurpose,
          min_amount: minAmount ? Number(minAmount) : null, max_amount: maxAmount ? Number(maxAmount) : null,
          min_term_months: minTerm ? Number(minTerm) : null, max_term_months: maxTerm ? Number(maxTerm) : null,
          published_terms: parsedTerms, reason: reason.trim(),
        });
      } else {
        await invoke({
          action: 'create_insurance_product', partner_id: productOrganizationId, name: productName.trim(),
          description: productDescription.trim() || null, coverage_type: coverageType,
          exclusions: exclusions.trim() || null, premium_basis: premiumBasis,
          supports_monthly_payments: monthlyPayments, terms: parsedTerms, reason: reason.trim(),
        });
      }
      setProductName(''); setProductDescription('');
      onReasonUsed();
      onNotify('Product created as an unpublished draft. A verified, published organization and platform-admin approval are required before riders can see it.');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The product could not be created.');
    } finally { setCreatingProduct(false); }
  }

  const orgName = (id: string) => organizations.find((org) => org.id === id)?.display_name || id.slice(0, 8) + '…';
  return <div className="section-stack admin-workspace">
    <div className="admin-workspace-heading"><div><span className="eyebrow">PLATFORM ADMINISTRATION</span><h2>Partners, users, and product catalog</h2><p>These tools affect which institutions and products can enter rider workflows. Verify the organization first. Published listings must be accurate and authorized.</p></div><span className="status-pill warning">Privileged controls</span></div>
    {error && <div className="alert alert-error"><AlertCircle size={15}/>{error}</div>}

    <section className="panel admin-panel">
      <div className="panel-heading"><div><h3><BriefcaseBusiness size={17}/> Partner organizations <span className="count-pill">{organizations.length}</span></h3><p>New organizations start pending verification and are not visible in rider catalogs.</p></div></div>
      <form className="admin-form-grid" onSubmit={createOrganization}>
        <label>Legal name<input value={legalName} onChange={(e)=>setLegalName(e.target.value)} minLength={2} maxLength={200} required placeholder="Registered legal entity name"/></label>
        <label>Public display name<input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} minLength={2} maxLength={120} required placeholder="Name riders will recognize"/></label>
        <label>Partner type<select value={organizationType} onChange={(e)=>setOrganizationType(e.target.value)}><option value="lender">Lender</option><option value="insurer">Insurer</option><option value="cooperative">Cooperative</option><option value="payment_provider">Payment provider</option><option value="service_provider">Service provider</option></select></label>
        <label>Public contact <span className="optional-label">Optional</span><input value={publicContact} onChange={(e)=>setPublicContact(e.target.value)} maxLength={240} placeholder="Official contact or website"/></label>
        <button className="button button-primary" disabled={creatingOrganization} type="submit">{creatingOrganization?'Creating…':'Create pending partner'} <ArrowRight size={15}/></button>
      </form>
      <div className="admin-record-list">{organizations.map(org=><article className="admin-record" key={org.id}><div className="admin-record-main"><b>{org.display_name}</b><span>{org.legal_name}</span><small>{org.partner_type.replaceAll('_',' ')} · {org.status.replaceAll('_',' ')} · {org.is_published?'publicly published':'not public'}</small><small>{org.public_contact || 'No public contact recorded'}</small></div><div className="admin-record-actions"><button className="button button-secondary" onClick={()=>void runOperation('review_partner_organization',{organization_id:org.id,status:'verified',is_published:false},'Partner verified; product listings remain unpublished.')}>Verify only</button><button className="button button-primary" onClick={()=>void runOperation('review_partner_organization',{organization_id:org.id,status:'verified',is_published:true},'Partner verified and published.')}>Verify & publish</button><button className="button button-quiet" onClick={()=>void runOperation('review_partner_organization',{organization_id:org.id,status:'suspended',is_published:false},'Partner suspended and its memberships disabled.')}>Suspend</button></div></article>)}
        {!organizations.length&&<div className="compact-empty">No partner organizations registered yet.</div>}
      </div>
    </section>

    <section className="panel admin-panel">
      <div className="panel-heading"><div><h3><ShieldCheck size={17}/> Access and role assignment</h3><p>Partner roles are assigned to active profiles by a platform administrator. The UI never lets riders assign roles to themselves.</p></div></div>
      <form className="admin-form-grid" onSubmit={assignMembership}>
        <label>Active user profile<select value={memberUserId} onChange={(e)=>setMemberUserId(e.target.value)} required><option value="">Select user</option>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.full_name || 'Unnamed user'} · {profile.role} · {profile.id.slice(0,8)}…</option>)}</select></label>
        <label>Organization<select value={memberOrganizationId} onChange={(e)=>{setMemberOrganizationId(e.target.value);const org=organizations.find(item=>item.id===e.target.value);setMemberRole(org?.partner_type==='lender'?'lender_officer':org?.partner_type==='insurer'?'insurer_officer':'cooperative_officer');}} required><option value="">Select organization</option>{organizations.filter(org=>['lender','insurer','cooperative'].includes(org.partner_type)).map(org=><option key={org.id} value={org.id}>{org.display_name} · {org.status}</option>)}</select></label>
        <label>Partner role<select value={memberRole} onChange={(e)=>setMemberRole(e.target.value)} required>{memberRoles.map(role=><option key={role} value={role}>{role.replaceAll('_',' ')}</option>)}{!memberRoles.length&&<option value="lender_officer">Select a supported partner type first</option>}</select></label>
        <button className="button button-primary" type="submit">Assign partner membership <ArrowRight size={15}/></button>
      </form>
      <div className="admin-record-list">{(queue.partner_memberships||[]).slice(0,30).map(member=><article className="admin-record compact-admin-record" key={member.id}><div className="admin-record-main"><b>{profiles.find(profile=>profile.id===member.user_id)?.full_name || member.user_id.slice(0,8)+'…'}</b><span>{orgName(member.organization_id)}</span><small>{member.partner_role.replaceAll('_',' ')} · {member.status}</small></div></article>)}</div>
      <form className="admin-form-grid internal-role-form" onSubmit={assignInternalRole}>
        <label>Internal staff profile<select value={internalUserId} onChange={(e)=>setInternalUserId(e.target.value)} required><option value="">Select user</option>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.full_name || 'Unnamed user'} · {profile.role}</option>)}</select></label>
        <label>Internal role<select value={internalRole} onChange={(e)=>setInternalRole(e.target.value)}><option value="support_agent">Support agent</option><option value="auditor">Auditor</option><option value="analyst">Analyst</option><option value="rider">Return to rider</option></select></label>
        <button className="button button-secondary" type="submit" disabled={assigningRole}>{assigningRole?'Saving…':'Assign internal role'}</button>
      </form>
      <p className="small muted">Platform-admin assignment is intentionally not offered here. Bootstrap or rotate platform admins through a reviewed, out-of-band SQL procedure.</p>
    </section>

    <section className="panel admin-panel">
      <div className="panel-heading"><div><h3><FileCheck2 size={17}/> Product catalog management</h3><p>New products are always created as unpublished drafts. Publishing is a separate, audited approval step.</p></div></div>
      <form className="admin-form-grid" onSubmit={createProduct}>
        <label>Product category<select value={productType} onChange={(e)=>setProductType(e.target.value)}><option value="loan">Loan / financing product</option><option value="insurance">Insurance product</option></select></label>
        <label>Partner organization<select value={productOrganizationId} onChange={(e)=>setProductOrganizationId(e.target.value)} required><option value="">Select verified organization</option>{organizations.filter(org=>org.status==='verified'&&(productType==='loan'?org.partner_type==='lender':org.partner_type==='insurer')).map(org=><option key={org.id} value={org.id}>{org.display_name}{org.is_published?'':' · organization not public'}</option>)}</select></label>
        <label>Product name<input value={productName} onChange={(e)=>setProductName(e.target.value)} maxLength={120} minLength={2} required placeholder="Product name"/></label>
        <label>Description <span className="optional-label">Optional</span><input value={productDescription} onChange={(e)=>setProductDescription(e.target.value)} maxLength={1000} placeholder="Short, accurate description"/></label>
        {productType==='loan' ? <>
          <label>Purpose<select value={productPurpose} onChange={(e)=>setProductPurpose(e.target.value)}><option value="motorcycle_purchase">Motorcycle purchase</option><option value="motorcycle_maintenance">Motorcycle maintenance</option><option value="electric_motorcycle">Electric motorcycle</option><option value="business_expansion">Business expansion</option><option value="general">General</option></select></label>
          <label>Minimum amount (RWF) <span className="optional-label">Optional</span><input type="number" min="1" value={minAmount} onChange={(e)=>setMinAmount(e.target.value)} placeholder="50000"/></label>
          <label>Maximum amount (RWF) <span className="optional-label">Optional</span><input type="number" min="1" value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} placeholder="2000000"/></label>
          <label>Minimum term (months) <input type="number" min="1" max="120" value={minTerm} onChange={(e)=>setMinTerm(e.target.value)} required/></label>
          <label>Maximum term (months) <input type="number" min="1" max="120" value={maxTerm} onChange={(e)=>setMaxTerm(e.target.value)} required/></label>
        </> : <>
          <label>Coverage type<input value={coverageType} onChange={(e)=>setCoverageType(e.target.value)} maxLength={100} required placeholder="motorcycle_third_party"/></label>
          <label>Premium basis<input value={premiumBasis} onChange={(e)=>setPremiumBasis(e.target.value)} maxLength={100} required/></label>
          <label>Exclusions <span className="optional-label">Optional</span><input value={exclusions} onChange={(e)=>setExclusions(e.target.value)} maxLength={3000} placeholder="Important exclusions"/></label>
          <label className="admin-checkbox"><input type="checkbox" checked={monthlyPayments} onChange={(e)=>setMonthlyPayments(e.target.checked)}/> Monthly payment option is actually supported</label>
        </>}
        <label className="quote-terms-label admin-terms-label">Published terms JSON<textarea rows={4} value={termsJson} onChange={(e)=>setTermsJson(e.target.value)} required/></label>
        <button className="button button-primary" type="submit" disabled={creatingProduct||!productOrganizationId}>{creatingProduct?'Creating…':'Create draft product'} <ArrowRight size={15}/></button>
      </form>
      <div className="admin-record-list">
        {loanProducts.map(product=><article className="admin-record" key={product.id}><div className="admin-record-main"><b>{product.name}</b><span>{orgName(product.partner_id)} · Loan</span><small>{product.min_amount?fmt(Number(product.min_amount)):'No minimum'} to {product.max_amount?fmt(Number(product.max_amount)):'No maximum'} · {product.min_term_months||'—'} to {product.max_term_months||'—'} months</small><small>{product.is_published?'Published to rider catalog':'Draft / unpublished'}</small></div><div className="admin-record-actions"><button className="button button-secondary" onClick={()=>void runOperation('publish_partner_product',{product_type:'loan',product_id:product.id,is_published:!product.is_published},product.is_published?'Loan product unpublished.':'Loan product published.')}>{product.is_published?'Unpublish':'Publish'}</button></div></article>)}
        {insuranceProducts.map(product=><article className="admin-record" key={product.id}><div className="admin-record-main"><b>{product.name}</b><span>{orgName(product.partner_id)} · Insurance</span><small>{product.coverage_type.replaceAll('_',' ')} · {product.supports_monthly_payments?'Monthly option':'Ask insurer for payment options'}</small><small>{product.is_published?'Published to rider catalog':'Draft / unpublished'}</small></div><div className="admin-record-actions"><button className="button button-secondary" onClick={()=>void runOperation('publish_partner_product',{product_type:'insurance',product_id:product.id,is_published:!product.is_published},product.is_published?'Insurance product unpublished.':'Insurance product published.')}>{product.is_published?'Unpublish':'Publish'}</button></div></article>)}
        {!loanProducts.length&&!insuranceProducts.length&&<div className="compact-empty">No products are registered yet.</div>}
      </div>
    </section>
  </div>;
}

function statusTone(status: string) {
  if (['active','verified','accepted','settled','completed','resolved'].includes(status)) return 'success';
  if (['rejected','expired','suspended','cancelled','closed'].includes(status)) return 'danger';
  if (['under_review','awaiting_documents','submitted','information_requested','pending','assigned','awaiting_partner','awaiting_user','offer_available'].includes(status)) return 'warning';
  return 'neutral';
}
