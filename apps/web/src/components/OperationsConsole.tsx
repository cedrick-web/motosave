import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, BadgeCheck, BriefcaseBusiness, CheckCircle2, Clock3, FileCheck2, HandCoins, LifeBuoy, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LoanApplication = {
  id: string; application_ref: string; purpose: string; requested_amount: number; term_months: number;
  status: string; submitted_at?: string; created_at?: string;
};
type InsuranceClaim = {
  id: string; policy_id: string; incident_date: string; description: string; status: string; created_at: string;
};
type InsurancePolicy = {
  id: string; policy_number: string | null; status: string; coverage_start: string | null;
  coverage_end: string | null; provider_reference: string | null;
};
type SupportTicket = {
  id: string; subject: string; category: string; description: string; status: string;
  priority: string; assigned_to: string | null; created_at: string;
};
type Queue = {
  role: string;
  loan_applications?: LoanApplication[];
  insurance_claims?: InsuranceClaim[];
  insurance_policies?: InsurancePolicy[];
  support_tickets?: SupportTicket[];
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
    {!loading && queue && <div className="operations-summary">
      <div className="operation-metric"><span>Authorized role</span><b>{queue.role.replaceAll('_',' ')}</b><small>Resolved from your protected profile</small></div>
      <div className="operation-metric"><span>Loan requests</span><b>{queue.loan_applications?.length || 0}</b><small>Visible within your authorized scope</small></div>
      <div className="operation-metric"><span>Insurance claims</span><b>{queue.insurance_claims?.length || 0}</b><small>Insurer-scoped claims or admin review</small></div>
      <div className="operation-metric"><span>Support requests</span><b>{queue.support_tickets?.length || 0}</b><small>Open and assigned tickets in the queue</small></div>
    </div>}

    {!!queue?.loan_applications?.length && <section className="panel operations-panel"><div className="panel-heading"><div><h3><HandCoins size={17} /> Lending queue</h3><p>All offers require clear total repayment, fees, term, and frequency.</p></div><span className="count-pill">{queue.loan_applications.length}</span></div>
      <div className="operations-list">{queue.loan_applications.map((application) => <article className="operation-card" key={application.id}><div className="operation-card-main"><b>{application.application_ref} · {application.purpose.replaceAll('_',' ')}</b><span>{fmt(Number(application.requested_amount))} requested · {application.term_months} months</span><small>Received {fmtDate(application.submitted_at || application.created_at)} · Applicant ID {application.user_id.slice(0,8)}…</small></div><span className={'status-pill ' + statusTone(application.status)}>{application.status.replaceAll('_',' ')}</span><div className="operation-buttons"><button className="button button-secondary" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'under_review')}>Start review</button><button className="button button-secondary" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'awaiting_documents')}>Request documents</button><button className="button button-primary" disabled={busyId===application.id} onClick={() => prepareOffer(application)}>Prepare offer</button><button className="button button-quiet" disabled={busyId===application.id} onClick={() => void updateStatus('update_loan_status','application_id',application.id,'rejected_by_lender')}>Reject</button></div>
        {offerFor?.id===application.id && <form className="offer-form" onSubmit={submitOffer}><div className="offer-form-title"><b>Create lender offer</b><button type="button" className="text-button" onClick={()=>setOfferFor(null)}>Close</button></div><div className="offer-fields"><label>Principal amount (RWF)<input type="number" min="1" value={principal} onChange={(e)=>setPrincipal(e.target.value)} required /></label><label>Interest rate value<input type="number" min="0" step="0.00001" value={rate} onChange={(e)=>setRate(e.target.value)} required /></label><label>Interest basis<input value={interestBasis} onChange={(e)=>setInterestBasis(e.target.value)} required maxLength={80} /></label><label>Fees (RWF)<input type="number" min="0" step="1" value={fees} onChange={(e)=>setFees(e.target.value)} required /></label><label>Total repayment (RWF)<input type="number" min="1" step="1" value={totalRepayment} onChange={(e)=>setTotalRepayment(e.target.value)} required /></label><label>Term (months)<input type="number" min="1" max="120" step="1" value={term} onChange={(e)=>setTerm(e.target.value)} required /></label><label>Payment frequency<select value={frequency} onChange={(e)=>setFrequency(e.target.value)}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label><label>Offer expiry <span className="optional-label">Optional</span><input type="datetime-local" value={expiresAt} onChange={(e)=>setExpiresAt(e.target.value)} /></label></div><div className="inline-note"><AlertCircle size={15} /> The rate basis and full costs must match the lender's binding terms. This screen does not calculate an amortization schedule.</div><button className="button button-primary" type="submit" disabled={busyId===application.id}>{busyId===application.id?'Saving offer…':'Create and record offer' } <ArrowRight size={15}/></button></form>}
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

    {!loading && queue && !queue.loan_applications?.length && !queue.insurance_claims?.length && !queue.insurance_policies?.length && !queue.support_tickets?.length && <div className="empty-card"><span className="empty-illustration"><BadgeCheck size={28}/></span><h3>Queue is clear</h3><p>No items currently match your authorized operational scope.</p></div>}
    <div className="small muted operations-footer"><Clock3 size={14}/> Every successful state change is written to the audit log. Server permissions remain authoritative even when this UI is modified.</div>
  </div>;
}

function statusTone(status: string) {
  if (['active','verified','accepted','settled','completed','resolved'].includes(status)) return 'success';
  if (['rejected','expired','suspended','cancelled','closed'].includes(status)) return 'danger';
  if (['under_review','awaiting_documents','submitted','information_requested','pending','assigned','awaiting_partner','awaiting_user','offer_available'].includes(status)) return 'warning';
  return 'neutral';
}
