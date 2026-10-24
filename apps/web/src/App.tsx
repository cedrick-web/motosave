import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, BadgeCheck, Bell, Bike, BriefcaseBusiness, CalendarDays,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, CreditCard, FileCheck2, FileText, HandCoins,
  Home, Languages, LifeBuoy, LogOut, Menu, MoreHorizontal, Plus, Search, Settings, ShieldCheck,
  Sparkles, TrendingUp, Wallet, Wrench, X, Zap, Receipt, ShieldAlert
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import AuthScreen from './components/AuthScreen';
import OperationsConsole from './components/OperationsConsole';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { calculateGoalProgress } from './lib/finance';
import {
  demoGoals, demoLoans, demoMotorcycles, demoPolicies, demoPremiums, demoTransactions, readStore,
  type Goal, type LoanApplication, type Motorcycle, type Policy, type Premium, type SavingsTransaction
} from './lib/demo-store';

type NavId = 'overview' | 'savings' | 'financing' | 'insurance' | 'motorcycles' | 'activity' | 'operations' | 'support' | 'settings';
type ModalId = 'goal' | 'contribution' | 'loan' | 'motorcycle' | 'quote' | 'maintenance' | 'claim' | null;
const navItems: { id: NavId; label: string; icon: typeof Home; section: string }[] = [
  { id: 'overview', label: 'Overview', icon: Home, section: 'WORKSPACE' },
  { id: 'savings', label: 'Savings goals', icon: Wallet, section: 'WORKSPACE' },
  { id: 'financing', label: 'Financing', icon: HandCoins, section: 'WORKSPACE' },
  { id: 'insurance', label: 'Insurance', icon: ShieldCheck, section: 'WORKSPACE' },
  { id: 'motorcycles', label: 'My motorcycles', icon: Bike, section: 'MANAGE' },
  { id: 'activity', label: 'Activity', icon: Activity, section: 'MANAGE' },
  { id: 'operations', label: 'Partner operations', icon: BriefcaseBusiness, section: 'MANAGE' },
  { id: 'support', label: 'Help & support', icon: LifeBuoy, section: 'OTHER' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'OTHER' },
];
const fmt = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(Number(value) || 0);
const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en-RW', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not set';
const saved = (rows: SavingsTransaction[]) => rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);

type MaintenanceRecord = { id: string; motorcycle_id: string; service_date: string; description: string; amount: number; odometer_km: number | null; next_service_date: string | null; created_at: string };
type InsuranceClaim = { id: string; policy_id: string; incident_date: string; description: string; status: string; created_at: string };
type MotorcycleDocument = { id: string; motorcycle_id: string; document_type: string; storage_path: string; expires_on: string | null; verification_status: string; created_at: string };
type FormState = { title: string; purpose: string; target_amount: string; target_date: string; frequency: string; amount: string; note: string; motorcycle_id: string; registration_number: string; make: string; model: string; year: string; requested_amount: string; term_months: string; loan_purpose: string; quote_notes: string; service_date: string; service_description: string; service_amount: string; odometer_km: string; next_service_date: string; claim_policy_id: string; incident_date: string; incident_description: string };
const emptyForm: FormState = { title: '', purpose: 'emergency', target_amount: '', target_date: '', frequency: 'weekly', amount: '', note: '', motorcycle_id: '', registration_number: '', make: '', model: '', year: '', requested_amount: '', term_months: '6', loan_purpose: 'motorcycle_maintenance', quote_notes: '', service_date: new Date().toISOString().slice(0, 10), service_description: '', service_amount: '', odometer_km: '', next_service_date: '', claim_policy_id: '', incident_date: new Date().toISOString().slice(0, 10), incident_description: '' };

export default function App() {
  const [activeNav, setActiveNav] = useState<NavId>('overview');
  const [modal, setModal] = useState<ModalId>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [toast, setToast] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileName, setProfileName] = useState('MotoSave rider');
  const [profileRole, setProfileRole] = useState('Rider account');
  const [accountRole, setAccountRole] = useState('rider');
  const [demoWorkspace] = useState(!isSupabaseConfigured);
  const [sessionReady, setSessionReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<{ user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null>(null);
  const [goals, setGoals] = useState<Goal[]>(() => isSupabaseConfigured ? [] : readStore('motosave.goals', demoGoals));
  const [transactions, setTransactions] = useState<SavingsTransaction[]>(() => isSupabaseConfigured ? [] : readStore('motosave.transactions', demoTransactions));
  const [motorcycles, setMotorcycles] = useState<Motorcycle[]>(() => isSupabaseConfigured ? [] : readStore('motosave.motorcycles', demoMotorcycles));
  const [loans, setLoans] = useState<LoanApplication[]>(() => isSupabaseConfigured ? [] : readStore('motosave.loans', demoLoans));
  const [policies, setPolicies] = useState<Policy[]>(() => isSupabaseConfigured ? [] : readStore('motosave.policies', demoPolicies));
  const [premiums, setPremiums] = useState<Premium[]>(() => isSupabaseConfigured ? [] : readStore('motosave.premiums', demoPremiums));
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>(() => isSupabaseConfigured ? [] : readStore('motosave.maintenance', []));
  const [insuranceClaims, setInsuranceClaims] = useState<InsuranceClaim[]>(() => isSupabaseConfigured ? [] : readStore('motosave.claims', []));
  const [motorcycleDocuments, setMotorcycleDocuments] = useState<MotorcycleDocument[]>(() => isSupabaseConfigured ? [] : readStore('motosave.documents', []));
  const [notificationsCount, setNotificationsCount] = useState(2);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3400);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session as typeof session);
      setSessionReady(true);
    });
    const { data: authData } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession as typeof session);
      setSessionReady(true);
    });
    return () => { active = false; authData.subscription.unsubscribe(); };
  }, []);

  const loadLiveData = useCallback(async () => {
    if (!supabase || !session?.user.id) return;
    const userId = session.user.id;
    const [profileResult, goalResult, transactionResult, motorcycleResult, loanResult, policyResult, notificationResult, maintenanceResult, claimsResult, documentsResult] = await Promise.all([
      supabase.from('profiles').select('full_name,role,preferred_language').eq('id', userId).maybeSingle(),
      supabase.from('savings_goals').select('*').order('created_at', { ascending: false }),
      supabase.from('savings_transactions').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('motorcycles').select('*').order('created_at', { ascending: false }),
      supabase.from('loan_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('insurance_policies').select('id,policy_number,status,coverage_end,motorcycle_id').order('created_at', { ascending: false }),
      supabase.from('notifications').select('id,is_read').eq('is_read', false).limit(50),
      supabase.from('maintenance_records').select('id,motorcycle_id,service_date,description,amount,odometer_km,next_service_date,created_at').order('service_date', { ascending: false }).limit(100),
      supabase.from('insurance_claims').select('id,policy_id,incident_date,description,status,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('motorcycle_documents').select('id,motorcycle_id,document_type,storage_path,expires_on,verification_status,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (profileResult.data) {
      setProfileName(profileResult.data.full_name || 'MotoSave rider');
      setAccountRole(String(profileResult.data.role || 'rider'));
      setProfileRole(String(profileResult.data.role || 'rider').replaceAll('_', ' '));
    }
    if (goalResult.data) setGoals(goalResult.data as Goal[]);
    if (transactionResult.data) setTransactions(transactionResult.data as SavingsTransaction[]);
    if (motorcycleResult.data) setMotorcycles(motorcycleResult.data as Motorcycle[]);
    if (loanResult.data) setLoans(loanResult.data as LoanApplication[]);
    if (policyResult.data) setPolicies(policyResult.data as Policy[]);
    if (maintenanceResult.data) setMaintenanceRecords(maintenanceResult.data as MaintenanceRecord[]);
    if (claimsResult.data) setInsuranceClaims(claimsResult.data as InsuranceClaim[]);
    if (documentsResult.data) setMotorcycleDocuments(documentsResult.data as MotorcycleDocument[]);
    if (notificationResult.data) setNotificationsCount(notificationResult.data.length);
    const policyIds = (policyResult.data || []).map((policy) => policy.id);
    if (policyIds.length) {
      const premiumResult = await supabase.from('insurance_premium_installments').select('id,policy_id,amount_due,due_date,status').in('policy_id', policyIds).order('due_date', { ascending: true });
      if (premiumResult.data) setPremiums(premiumResult.data as Premium[]);
    } else {
      setPremiums([]);
    }
    if ([profileResult, goalResult, transactionResult, motorcycleResult, loanResult, policyResult, maintenanceResult, claimsResult, documentsResult].some((result) => result.error)) {
      notify('Some information could not be loaded. Check your Supabase migration and access policies.');
    }
  }, [session?.user.id, notify]);

  useEffect(() => { if (session?.user.id) void loadLiveData(); }, [session?.user.id, loadLiveData]);
  useEffect(() => {
    if (isSupabaseConfigured && session) {
      const metadataName = session.user.user_metadata?.full_name;
      if (typeof metadataName === 'string' && metadataName.trim()) setProfileName(metadataName);
    }
  }, [session]);
  useEffect(() => {
    if (demoWorkspace && !isSupabaseConfigured) {
      localStorage.setItem('motosave.goals', JSON.stringify(goals));
      localStorage.setItem('motosave.transactions', JSON.stringify(transactions));
      localStorage.setItem('motosave.motorcycles', JSON.stringify(motorcycles));
      localStorage.setItem('motosave.loans', JSON.stringify(loans));
      localStorage.setItem('motosave.policies', JSON.stringify(policies));
      localStorage.setItem('motosave.premiums', JSON.stringify(premiums));
      localStorage.setItem('motosave.maintenance', JSON.stringify(maintenanceRecords));
      localStorage.setItem('motosave.claims', JSON.stringify(insuranceClaims));
      localStorage.setItem('motosave.documents', JSON.stringify(motorcycleDocuments));
    }
  }, [demoWorkspace, goals, transactions, motorcycles, loans, policies, premiums, maintenanceRecords, insuranceClaims, motorcycleDocuments]);

  const totalTracked = useMemo(() => saved(transactions), [transactions]);
  const verifiedTotal = useMemo(() => transactions.filter((item) => item.verification_status === 'verified').reduce((sum, item) => sum + Number(item.amount || 0), 0), [transactions]);
  const upcomingPremiums = premiums.filter((item) => ['scheduled', 'due', 'pending', 'overdue'].includes(item.status)).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const upcomingPremium = upcomingPremiums[0];
  const goalProgress = (goal: Goal) => calculateGoalProgress(transactions.filter((tx) => tx.goal_id === goal.id).reduce((sum, tx) => sum + Number(tx.amount || 0), 0), Number(goal.target_amount));
  const openModal = (nextModal: ModalId) => { setForm(emptyForm); setModal(nextModal); };

  async function submitModal(event: FormEvent) {
    event.preventDefault();
    if (!modal) return;
    try {
      if (modal === 'goal') {
        const payload = { title: form.title.trim(), purpose: form.purpose, target_amount: Number(form.target_amount), target_date: form.target_date || null, contribution_frequency: form.frequency };
        if (!payload.title || !Number.isFinite(payload.target_amount) || payload.target_amount <= 0) throw new Error('Enter a goal name and a target amount greater than zero.');
        if (supabase && session) {
          const { data, error } = await supabase.from('savings_goals').insert({ ...payload, user_id: session.user.id }).select('*').single();
          if (error) throw error;
          setGoals((rows) => [data as Goal, ...rows]);
        } else {
          setGoals((rows) => [{ ...payload, id: 'goal-' + Date.now(), created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Savings goal created.');
      } else if (modal === 'contribution') {
        const payload = { goal_id: form.motorcycle_id || null, amount: Number(form.amount), note: form.note.trim() || null };
        if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Enter a contribution amount greater than zero.');
        if (supabase && session) {
          const { data, error } = await supabase.from('savings_transactions').insert({ ...payload, user_id: session.user.id }).select('*').single();
          if (error) throw error;
          setTransactions((rows) => [data as SavingsTransaction, ...rows]);
        } else {
          setTransactions((rows) => [{ ...payload, id: 'tx-' + Date.now(), source: 'manual', verification_status: 'unverified', created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Contribution recorded as manual and unverified.');
      } else if (modal === 'motorcycle') {
        const payload = { registration_number: form.registration_number.trim().toUpperCase(), make: form.make.trim(), model: form.model.trim(), model_year: form.year ? Number(form.year) : null, vehicle_type: 'petrol', is_electric: false };
        if (!payload.registration_number || !payload.make || !payload.model) throw new Error('Registration number, make, and model are required.');
        if (supabase && session) {
          const { data, error } = await supabase.from('motorcycles').insert({ ...payload, owner_id: session.user.id }).select('*').single();
          if (error) throw error;
          setMotorcycles((rows) => [data as Motorcycle, ...rows]);
        } else {
          setMotorcycles((rows) => [{ ...payload, id: 'bike-' + Date.now(), created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Motorcycle added to your records.');
      } else if (modal === 'loan') {
        const payload = { purpose: form.loan_purpose, requested_amount: Number(form.requested_amount), term_months: Number(form.term_months), notes: form.note.trim() || null };
        if (!Number.isFinite(payload.requested_amount) || payload.requested_amount <= 0 || !Number.isInteger(payload.term_months) || payload.term_months < 1 || payload.term_months > 120) throw new Error('Enter a valid amount and a term between 1 and 120 months.');
        if (supabase && session) {
          const { data, error } = await supabase.from('loan_applications').insert({ ...payload, user_id: session.user.id }).select('*').single();
          if (error) throw error;
          setLoans((rows) => [data as LoanApplication, ...rows]);
        } else {
          setLoans((rows) => [{ ...payload, id: 'loan-' + Date.now(), status: 'submitted_demo', created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Loan request submitted for workflow review. This is not loan approval.');
      } else if (modal === 'maintenance') {
        const payload = {
          motorcycle_id: form.motorcycle_id,
          service_date: form.service_date,
          description: form.service_description.trim(),
          amount: Number(form.service_amount || '0'),
          odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
          next_service_date: form.next_service_date || null,
        };
        if (!payload.motorcycle_id) throw new Error('Choose a motorcycle for this service record.');
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(payload.service_date) || Number.isNaN(Date.parse(payload.service_date))) throw new Error('Enter a valid service date in YYYY-MM-DD format.');
        if (payload.description.length < 3) throw new Error('Describe the maintenance or repair in at least three characters.');
        if (!Number.isFinite(payload.amount) || payload.amount < 0) throw new Error('Service cost must be a non-negative number.');
        if (payload.odometer_km !== null && (!Number.isInteger(payload.odometer_km) || payload.odometer_km < 0)) throw new Error('Odometer must be a non-negative whole number.');
        if (supabase && session) {
          const { data, error } = await supabase.from('maintenance_records').insert({ ...payload, owner_id: session.user.id }).select('*').single();
          if (error) throw error;
          setMaintenanceRecords((rows) => [data as MaintenanceRecord, ...rows]);
        } else {
          setMaintenanceRecords((rows) => [{ ...payload, id: 'service-' + Date.now(), created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Maintenance record saved.');
      } else if (modal === 'claim') {
        const payload = { policy_id: form.claim_policy_id, incident_date: form.incident_date, description: form.incident_description.trim() };
        if (!payload.policy_id) throw new Error('Choose the policy linked to this claim.');
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(payload.incident_date) || Number.isNaN(Date.parse(payload.incident_date))) throw new Error('Enter a valid incident date in YYYY-MM-DD format.');
        if (payload.description.length < 10) throw new Error('Describe the incident in at least 10 characters.');
        if (supabase && session) {
          const { data, error } = await supabase.from('insurance_claims').insert({ ...payload, user_id: session.user.id }).select('*').single();
          if (error) throw error;
          setInsuranceClaims((rows) => [data as InsuranceClaim, ...rows]);
        } else {
          setInsuranceClaims((rows) => [{ ...payload, id: 'claim-' + Date.now(), status: 'submitted_demo', created_at: new Date().toISOString() }, ...rows]);
        }
        notify('Claim submitted for insurer review. It is not an acceptance or settlement decision.');
      } else if (modal === 'quote') {
        if (supabase && session) {
          const { error } = await supabase.from('insurance_quote_requests').insert({ user_id: session.user.id, motorcycle_id: form.motorcycle_id || null, product_id: null, notes: form.quote_notes.trim() || null });
          if (error) throw error;
        }
        notify(demoWorkspace ? 'Demo quote request recorded. No policy has been issued.' : 'Quote request submitted. The insurer must provide an actual quote.');
      }
      setModal(null);
      if (supabase && session) void loadLiveData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action could not be completed.');
    }
  }

  async function uploadMotorcycleDocument(file: File, motorcycleId: string, documentType: string, expiresOn: string) {
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) throw new Error('Choose a PDF, JPEG, PNG, or WebP file.');
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('File size must be between 1 byte and 10 MB.');
    const bike = motorcycles.find((item) => item.id === motorcycleId);
    if (!bike) throw new Error('Choose one of your motorcycles first.');

    if (isSupabaseConfigured && (!supabase || !session)) throw new Error('Your session is not available. Sign in again before uploading private documents.');
    if (supabase && session && !demoWorkspace) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      const storagePath = session.user.id + '/' + motorcycleId + '/' + crypto.randomUUID() + '-' + safeName;
      const { error: uploadError } = await supabase.storage.from('rider-documents').upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.from('motorcycle_documents').insert({
        owner_id: session.user.id,
        motorcycle_id: motorcycleId,
        document_type: documentType,
        storage_path: storagePath,
        expires_on: expiresOn || null,
      }).select('id,motorcycle_id,document_type,storage_path,expires_on,verification_status,created_at').single();
      if (error) {
        await supabase.storage.from('rider-documents').remove([storagePath]);
        throw error;
      }
      setMotorcycleDocuments((rows) => [data as MotorcycleDocument, ...rows]);
      notify('Private document uploaded. Verification is still pending.');
    } else {
      const demoRow: MotorcycleDocument = {
        id: 'demo-doc-' + Date.now(),
        motorcycle_id: motorcycleId,
        document_type: documentType,
        storage_path: 'DEMO-ONLY/' + file.name,
        expires_on: expiresOn || null,
        verification_status: 'unverified',
        created_at: new Date().toISOString(),
      };
      setMotorcycleDocuments((rows) => [demoRow, ...rows]);
      notify('Demo document metadata saved locally. The file was not uploaded.');
    }
  }

  async function openMotorcycleDocument(document: MotorcycleDocument) {
    if (!supabase || !session || demoWorkspace || document.storage_path.startsWith('DEMO-ONLY/')) {
      notify('This demo document has no uploaded file to open.');
      return;
    }
    const { data, error } = await supabase.storage.from('rider-documents').createSignedUrl(document.storage_path, 60);
    if (error || !data?.signedUrl) {
      notify('Could not create a private document link. Check the storage policy.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function signOut() { if (supabase) { await supabase.auth.signOut(); setSession(null); } }
  async function markPremiumPaid(premium: Premium) {
    if (isSupabaseConfigured) {
      notify('Real payments are not enabled. Use the insurer’s approved payment channel until a provider integration is configured.');
      return;
    }
    setPremiums((rows) => rows.map((item) => item.id === premium.id ? { ...item, status: 'simulated_confirmed' } : item));
    notify('Demo payment simulated. This does not move money or activate insurance.');
  }

  if (isSupabaseConfigured && !sessionReady) return <div className="loading-screen"><span className="brand-mark"><Bike size={24} /></span><p>Securely opening MotoSave…</p></div>;
  if (isSupabaseConfigured && !session) return <AuthScreen />;

  const pageTitle = navItems.find((item) => item.id === activeNav)?.label || 'Overview';
  const firstName = profileName.split(' ')[0] || 'Rider';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Bike size={23} strokeWidth={2.4} /></span><span>MotoSave</span></div>
      <div className="workspace-switch"><span className="workspace-avatar">MS</span><span className="workspace-copy"><b>Rider workspace</b><small>{demoWorkspace ? 'Demo environment' : profileRole}</small></span><ChevronDown size={15} /></div>
      <nav className="side-nav">
        {(['WORKSPACE', 'MANAGE', 'OTHER'] as const).map((section) => <div className="nav-section" key={section}>
          <span className="nav-section-title">{section}</span>
          {navItems.filter((item) => item.section === section && (item.id !== 'operations' || ['cooperative_officer','lender_officer','insurer_officer','support_agent','platform_admin'].includes(accountRole))).map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={'nav-link ' + (activeNav === item.id ? 'active' : '')} onClick={() => { setActiveNav(item.id); document.body.classList.remove('nav-open'); }}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'financing' && loans.some((loan) => ['under_review', 'submitted', 'submitted_demo'].includes(loan.status)) && <span className="nav-dot" />}</button>;
          })}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={18} /></div><b>Need a hand?</b><p>Find answers and help with your account.</p><button onClick={() => setActiveNav('support')}>Visit help center <ArrowRight size={14} /></button></div>
        <div className="sidebar-profile"><div className="avatar">MS</div><div className="sidebar-profile-text"><b>{profileName}</b><small>{profileRole}</small></div><button className="icon-button" aria-label="Settings" onClick={() => setActiveNav('settings')}><MoreHorizontal size={19} /></button></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => document.body.classList.toggle('nav-open')}><Menu size={20} /></button><div className="breadcrumb">Workspace <span>/</span> <b>{pageTitle}</b></div></div>
        <div className="topbar-actions">
          <label className="search-box"><Search size={17} /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search your workspace" aria-label="Search your workspace" /></label>
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => { setActiveNav('activity'); setNotificationsCount(0); }}><Bell size={19} />{notificationsCount > 0 && <i />}</button>
          <button className="language-button" onClick={() => notify('Kinyarwanda interface translation needs review of financial terminology before enabling.')}><Languages size={16} /><span>EN</span><ChevronDown size={13} /></button>
          {supabase && <button className="icon-button" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={18} /></button>}
        </div>
      </header>

      <div className="page-content">
        <div className="page-heading">
          <div><span className="eyebrow">SATURDAY, OCTOBER 24, 2026</span><h1>{activeNav === 'overview' ? 'Good afternoon, ' + firstName : pageTitle}<span className="heading-period">{activeNav === 'overview' ? '.' : ''}</span></h1><p>{getSubtitle(activeNav)}</p></div>
          <div className="heading-actions">{activeNav === 'savings' && <button className="button button-primary" onClick={() => openModal('goal')}><Plus size={17} /> New savings goal</button>}{activeNav === 'financing' && <button className="button button-primary" onClick={() => openModal('loan')}><Plus size={17} /> Apply for financing</button>}{activeNav === 'motorcycles' && <><button className="button button-secondary" onClick={() => openModal('maintenance')}><Wrench size={16} /> Log maintenance</button><button className="button button-primary" onClick={() => openModal('motorcycle')}><Plus size={17} /> Add motorcycle</button></>}{activeNav === 'insurance' && <><button className="button button-secondary" onClick={() => openModal('claim')}><FileCheck2 size={16} /> Submit a claim</button><button className="button button-primary" onClick={() => openModal('quote')}><Plus size={17} /> Request a quote</button></>}</div>
        </div>

        {demoWorkspace && <div className="demo-banner"><div className="demo-banner-icon"><Sparkles size={17} /></div><div><b>Demo workspace</b><span>Sample records are fictional and saved in this browser only. No money moves and no real insurance coverage is created.</span></div><span className="demo-tag">DEMO DATA</span></div>}
        {activeNav === 'overview' && <Overview goals={goals} transactions={transactions} motorcycles={motorcycles} loans={loans} policies={policies} upcomingPremium={upcomingPremium} totalTracked={totalTracked} verifiedTotal={verifiedTotal} progress={goalProgress} onCreateGoal={() => openModal('goal')} onAddContribution={() => openModal('contribution')} onApplyLoan={() => openModal('loan')} onQuote={() => openModal('quote')} onPayPremium={markPremiumPaid} onNavigate={setActiveNav} />}
        {activeNav === 'savings' && <SavingsPage goals={goals} transactions={transactions} progress={goalProgress} onCreateGoal={() => openModal('goal')} onAddContribution={() => openModal('contribution')} totalTracked={totalTracked} verifiedTotal={verifiedTotal} />}
        {activeNav === 'financing' && <FinancingPage loans={loans} onApply={() => openModal('loan')} />}
        {activeNav === 'insurance' && <InsurancePage policies={policies} premiums={premiums} motorcycles={motorcycles} claims={insuranceClaims} onQuote={() => openModal('quote')} onClaim={() => openModal('claim')} onPayPremium={markPremiumPaid} />}
        {activeNav === 'motorcycles' && <MotorcyclesPage motorcycles={motorcycles} maintenanceRecords={maintenanceRecords} documents={motorcycleDocuments} demo={demoWorkspace} onAdd={() => openModal('motorcycle')} onMaintenance={() => openModal('maintenance')} onUploadDocument={uploadMotorcycleDocument} onOpenDocument={openMotorcycleDocument} />}
        {activeNav === 'activity' && <ActivityPage transactions={transactions} loans={loans} premiums={premiums} searchQuery={searchQuery} />}
        {activeNav === 'operations' && <OperationsConsole demo={demoWorkspace} onNotify={notify} />}
        {activeNav === 'support' && <SupportPage demo={demoWorkspace} onToast={notify} />}
        {activeNav === 'settings' && <SettingsPage profileName={profileName} profileRole={profileRole} onSave={(name) => { setProfileName(name); notify('Name updated for this session.'); }} demo={demoWorkspace} />}
      </div>
      <footer className="footer"><span>© 2026 MotoSave</span><span><ShieldCheck size={14} /> Your records, treated with care</span><span>Built for Rwanda <span className="footer-dot">•</span> RWF</span></footer>
    </main>

    <AnimatePresence>{modal && <ActionModal kind={modal} form={form} setForm={setForm} onSubmit={submitModal} onClose={() => setModal(null)} goals={goals} motorcycles={motorcycles} policies={policies} />}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="toast"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss message"><X size={15} /></button></motion.div>}</AnimatePresence>
  </div>;
}

function getSubtitle(nav: NavId) {
  const values: Record<NavId, string> = {
    overview: 'A clearer view of your money goals starts here.', savings: 'Small, consistent steps toward the things that matter.',
    financing: 'Track requests and understand financing terms clearly.', insurance: 'Keep policy records and upcoming premium dates in one place.',
    motorcycles: 'Organize the motorcycles and documents connected to your work.', activity: 'A timeline of recorded financial and account events.',
    operations: 'Review partner queues and record audited operational decisions.', support: 'Find guidance or prepare a question for the support team.', settings: 'Manage your profile preferences and account information.',
  };
  return values[nav];
}

function Overview(props: {
  goals: Goal[]; transactions: SavingsTransaction[]; motorcycles: Motorcycle[]; loans: LoanApplication[]; policies: Policy[]; upcomingPremium?: Premium;
  totalTracked: number; verifiedTotal: number; progress: (goal: Goal) => number; onCreateGoal: () => void; onAddContribution: () => void;
  onApplyLoan: () => void; onQuote: () => void; onPayPremium: (p: Premium) => void; onNavigate: (id: NavId) => void;
}) {
  const { goals, transactions, motorcycles, loans, policies, upcomingPremium, totalTracked, verifiedTotal, progress, onCreateGoal, onAddContribution, onApplyLoan, onQuote, onPayPremium, onNavigate } = props;
  const chartRows = useMemo(() => {
    const groups = new Map<string, number>();
    transactions.forEach((transaction) => {
      const date = new Date(transaction.created_at);
      const key = date.toLocaleDateString('en-RW', { month: 'short', year: '2-digit' });
      groups.set(key, (groups.get(key) || 0) + Number(transaction.amount || 0));
    });
    return Array.from(groups, ([month, amount]) => ({ month, amount })).slice(-6);
  }, [transactions]);
  return <div className="dashboard-grid">
    <motion.section className="welcome-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="welcome-copy"><span className="welcome-kicker"><Sparkles size={14} /> YOUR FINANCIAL JOURNEY</span><h2>Progress today.<br /><span>More freedom tomorrow.</span></h2><p>Bring your goals, bike expenses, and upcoming commitments into focus, one step at a time.</p><button className="button button-white" onClick={onCreateGoal}>Set a savings goal <ArrowRight size={16} /></button></div>
      <div className="welcome-illustration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="illustration-circle"><Bike size={67} strokeWidth={1.2} /></div><div className="floating-chip chip-goal"><span className="chip-icon"><CheckCircle2 size={16} /></span><span><b>Goal in focus</b><small>One step at a time</small></span></div><div className="floating-chip chip-safety"><ShieldCheck size={18} /><span>Plan with confidence</span></div></div>
    </motion.section>

    <div className="metrics-grid">
      <MetricCard label="Tracked contributions" value={fmt(totalTracked)} icon={Wallet} trend="Manual entries included" tone="blue" onClick={() => onNavigate('savings')} />
      <MetricCard label="Provider-verified total" value={fmt(verifiedTotal)} icon={BadgeCheck} trend="Only confirmed partner records" tone="mint" onClick={() => onNavigate('activity')} />
      <MetricCard label="Savings goals" value={String(goals.length).padStart(2, '0')} icon={TrendingUp} trend={goals.length ? 'Keep your plan moving' : 'Create your first goal'} tone="violet" onClick={() => onNavigate('savings')} />
      <MetricCard label="Motorcycles" value={String(motorcycles.length).padStart(2, '0')} icon={Bike} trend={motorcycles.length ? 'Records organized' : 'Add a motorcycle'} tone="amber" onClick={() => onNavigate('motorcycles')} />
    </div>

    <section className="panel chart-panel">
      <div className="panel-heading"><div><h3>Savings activity</h3><p>Contributions recorded over time</p></div><button className="select-button" onClick={() => onNavigate('savings')}>View goals <ArrowRight size={14} /></button></div>
      {chartRows.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartRows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3274e8" stopOpacity={0.18} /><stop offset="95%" stopColor="#3274e8" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eef7" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a96a9', fontSize: 12 }} /><Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ borderRadius: 12, border: '1px solid #e5eaf3', boxShadow: '0 8px 30px #1c37600d' }} /><Area type="monotone" dataKey="amount" name="Recorded contributions" stroke="#3978e8" strokeWidth={2.5} fill="url(#savingsGradient)" activeDot={{ r: 5, strokeWidth: 0 }} /></AreaChart></ResponsiveContainer></div> : <div className="empty-state"><TrendingUp size={25} /><b>Your savings story starts here</b><span>Record contributions to begin building your history.</span><button className="button button-secondary" onClick={onAddContribution}>Record contribution</button></div>}
      <div className="chart-footer"><span className="legend-dot" /> <span>Recorded contributions</span><span className="chart-note">Planning records, not an account balance</span></div>
    </section>

    <section className="panel goals-panel"><div className="panel-heading"><div><h3>Savings goals</h3><p>Keep the next milestone in sight</p></div><button className="icon-button pale-icon" onClick={onCreateGoal} aria-label="Add savings goal"><Plus size={18} /></button></div>
      {goals.slice(0, 3).map((goal, index) => <GoalRow key={goal.id} goal={goal} progress={progress(goal)} index={index} onClick={() => onNavigate('savings')} />)}
      {!goals.length && <div className="compact-empty">No goals yet. Start with one practical target.</div>}
      <button className="panel-link" onClick={() => onNavigate('savings')}>See all goals <ArrowRight size={15} /></button>
    </section>

    <section className="panel commitments-panel"><div className="panel-heading"><div><h3>Upcoming commitments</h3><p>Stay ahead of the next due date</p></div><CalendarDays size={18} className="subtle-icon" /></div>
      {upcomingPremium ? <div className="commitment-item"><div className="commitment-icon insurance-commit"><ShieldCheck size={18} /></div><div className="commitment-text"><b>Insurance premium</b><span>Due {fmtDate(upcomingPremium.due_date)}</span><small>{upcomingPremium.status === 'simulated_confirmed' ? 'Simulated only' : 'Policy premium schedule'}</small></div><div className="commitment-amount"><b>{fmt(Number(upcomingPremium.amount_due))}</b><button onClick={() => onPayPremium(upcomingPremium)}>{upcomingPremium.status === 'simulated_confirmed' ? 'Demo paid' : 'Review'}</button></div></div> : <div className="commitment-empty"><CalendarDays size={24} /><span>No upcoming premiums recorded.</span></div>}
      {loans.find((loan) => ['submitted', 'submitted_demo', 'under_review', 'awaiting_documents'].includes(loan.status)) && <div className="commitment-item"><div className="commitment-icon loan-commit"><Clock3 size={18} /></div><div className="commitment-text"><b>Financing request</b><span>{loans.find((loan) => ['submitted', 'submitted_demo', 'under_review', 'awaiting_documents'].includes(loan.status))?.status.replaceAll('_', ' ')}</span><small>Decision controlled by the lender</small></div><div className="commitment-amount"><button onClick={() => onNavigate('financing')}>View</button></div></div>}
      {!loans.length && !policies.length && <div className="compact-empty">Add an application or insurance quote to see its status here.</div>}
      <button className="panel-link" onClick={() => onNavigate('insurance')}>Review insurance <ArrowRight size={15} /></button>
    </section>

    <section className="panel quick-panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Move your next task forward</p></div><Zap size={18} className="subtle-icon" /></div>
      <div className="quick-actions">
        <button className="quick-action" onClick={onAddContribution}><span className="quick-icon quick-blue"><Plus size={19} /></span><span><b>Record contribution</b><small>Update your goal tracker</small></span><ArrowRight size={15} /></button>
        <button className="quick-action" onClick={onApplyLoan}><span className="quick-icon quick-violet"><HandCoins size={19} /></span><span><b>Apply for financing</b><small>Prepare a partner request</small></span><ArrowRight size={15} /></button>
        <button className="quick-action" onClick={onQuote}><span className="quick-icon quick-mint"><ShieldCheck size={19} /></span><span><b>Request insurance quote</b><small>Start an insurer workflow</small></span><ArrowRight size={15} /></button>
      </div>
    </section>

    <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Latest records in your workspace</p></div><button className="select-button" onClick={() => onNavigate('activity')}>View all <ArrowRight size={14} /></button></div>
      {transactions.slice(0, 3).map((transaction) => <div key={transaction.id} className="activity-row"><div className="activity-icon"><ArrowDownRight size={17} /></div><div className="activity-description"><b>{transaction.note || 'Savings contribution'}</b><span>{fmtDate(transaction.created_at)} · {transaction.verification_status === 'verified' ? 'Verified by provider' : 'Manual record'}</span></div><div className="activity-value"><b>+{fmt(Number(transaction.amount))}</b><small>{transaction.verification_status === 'verified' ? 'Verified' : 'Unverified'}</small></div></div>)}
      {!transactions.length && <div className="compact-empty">No activity yet. Add a savings contribution to begin.</div>}
    </section>

    <section className="insight-banner"><div className="insight-spark"><Sparkles size={21} /></div><div><b>A small plan beats a perfect plan you never start.</b><p>Pick a contribution you can realistically repeat, then adjust it as your work changes.</p></div><button onClick={() => onNavigate('savings')}>Explore savings <ArrowRight size={15} /></button></section>
  </div>;
}

function MetricCard({ label, value, icon: Icon, trend, tone, onClick }: { label: string; value: string; icon: typeof Wallet; trend: string; tone: string; onClick: () => void }) {
  return <button className="metric-card" onClick={onClick}><div className="metric-top"><span>{label}</span><span className={'metric-icon ' + tone}><Icon size={19} /></span></div><strong>{value}</strong><small>{trend}</small></button>;
}
function GoalRow({ goal, progress, index, onClick }: { goal: Goal; progress: number; index: number; onClick: () => void }) {
  const tones = ['blue', 'mint', 'violet'];
  return <button className="goal-row" onClick={onClick}><span className={'goal-icon goal-tone-' + tones[index % tones.length]}>{index === 0 ? <ShieldCheck size={18} /> : index === 1 ? <Wrench size={18} /> : <Bike size={18} />}</span><span className="goal-info"><span className="goal-title-line"><b>{goal.title}</b><small>{progress}%</small></span><span className="progress-track"><span className={'progress-fill fill-' + tones[index % tones.length]} style={{ width: progress + '%' }} /></span><span className="goal-amount">{fmt(goal.target_amount)} target</span></span></button>;
}

function SavingsPage({ goals, transactions, progress, onCreateGoal, onAddContribution, totalTracked, verifiedTotal }: { goals: Goal[]; transactions: SavingsTransaction[]; progress: (goal: Goal) => number; onCreateGoal: () => void; onAddContribution: () => void; totalTracked: number; verifiedTotal: number }) {
  return <div className="section-stack">
    <div className="two-stat-row"><div className="mini-stat"><span>Total tracked contributions</span><b>{fmt(totalTracked)}</b><small>Includes manual entries, which are unverified</small></div><div className="mini-stat"><span>Provider-verified contributions</span><b>{fmt(verifiedTotal)}</b><small>Only records confirmed by a trusted provider</small></div></div>
    <div className="section-toolbar"><div><h3>Your goals <span className="count-pill">{goals.length}</span></h3><p>Track progress toward practical milestones.</p></div><div className="toolbar-actions"><button className="button button-secondary" onClick={onAddContribution}><Plus size={16} /> Record contribution</button><button className="button button-primary" onClick={onCreateGoal}><Plus size={16} /> New goal</button></div></div>
    <div className="goal-grid">{goals.map((goal, index) => {
      const contributions = transactions.filter((tx) => tx.goal_id === goal.id);
      const total = contributions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const remainder = Math.max(0, Number(goal.target_amount) - total);
      return <motion.article layout key={goal.id} className="goal-card"><div className="goal-card-top"><span className={'goal-icon goal-tone-' + ['blue','mint','violet'][index % 3]}>{index % 3 === 0 ? <ShieldCheck size={20} /> : index % 3 === 1 ? <Wrench size={20} /> : <Bike size={20} />}</span><span className="status-pill neutral">{goal.contribution_frequency || 'Flexible'}</span><button className="icon-button tiny-icon" aria-label="Goal options"><MoreHorizontal size={18} /></button></div><h3>{goal.title}</h3><p>{goalPurpose(goal.purpose)}</p><div className="goal-card-progress"><div><span>Progress</span><b>{progress(goal)}%</b></div><div className="progress-track"><span className="progress-fill" style={{ width: progress(goal) + '%' }} /></div></div><div className="goal-card-values"><div><small>Tracked</small><b>{fmt(total)}</b></div><div><small>Target</small><b>{fmt(goal.target_amount)}</b></div></div><div className="goal-card-bottom"><span>{fmt(remainder)} to go</span><button onClick={onAddContribution}>Add contribution <ArrowRight size={14} /></button></div></motion.article>;
    })}</div>
    {goals.length === 0 && <EmptyCard title="Give your next goal a name" description="Create one clear savings target and decide how often you would like to contribute." action="Create a savings goal" onClick={onCreateGoal} />}
    <section className="panel table-panel"><div className="panel-heading"><div><h3>Contribution history</h3><p>Manual entries are shown as unverified until a trusted provider confirms them.</p></div><Receipt size={18} className="subtle-icon" /></div><div className="table-scroll"><table><thead><tr><th>Contribution</th><th>Date</th><th>Source</th><th>Verification</th><th className="right">Amount</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id}><td><b>{tx.note || 'Savings contribution'}</b><small>{goals.find((goal) => goal.id === tx.goal_id)?.title || 'General contribution'}</small></td><td>{fmtDate(tx.created_at)}</td><td><span className="status-pill neutral">{tx.source || 'manual'}</span></td><td><span className={'status-pill ' + (tx.verification_status === 'verified' ? 'success' : 'warning')}>{tx.verification_status === 'verified' ? 'Verified' : 'Unverified'}</span></td><td className="right amount-cell">+{fmt(Number(tx.amount))}</td></tr>)}</tbody></table></div>{!transactions.length && <div className="compact-empty">Your contribution history will appear here.</div>}</section>
  </div>;
}

function FinancingPage({ loans, onApply }: { loans: LoanApplication[]; onApply: () => void }) {
  return <div className="section-stack"><div className="financing-hero"><div><span className="eyebrow light-eyebrow">RESPONSIBLE FINANCING</span><h2>Find a path forward,<br />with the terms in view.</h2><p>Prepare applications, track partner updates, and review the full cost before accepting any offer.</p><button className="button button-white" onClick={onApply}><Plus size={16} /> Start an application</button></div><div className="financing-hero-art"><HandCoins size={88} strokeWidth={1.1} /><span className="floating-number">RWF</span></div></div>
    <div className="info-callout"><ShieldAlert size={19} /><div><b>Applications are not approvals</b><span>A participating lender makes credit decisions and provides binding terms. MotoSave does not guarantee eligibility or approval.</span></div></div>
    <div className="section-toolbar"><div><h3>Your applications <span className="count-pill">{loans.length}</span></h3><p>Track the status of each request.</p></div><button className="button button-primary" onClick={onApply}><Plus size={16} /> New application</button></div>
    {loans.length ? <div className="application-list">{loans.map((loan) => <article className="application-card" key={loan.id}><div className="application-icon"><HandCoins size={22} /></div><div className="application-main"><b>{loanPurpose(loan.purpose)}</b><span>Requested {fmt(Number(loan.requested_amount))} · {loan.term_months} months</span><small>Submitted {fmtDate(loan.created_at)}</small></div><span className={'status-pill ' + statusTone(loan.status)}>{loan.status.replaceAll('_', ' ')}</span><button className="icon-button pale-icon" aria-label="View application"><ArrowRight size={17} /></button></article>)}</div> : <EmptyCard title="No financing requests yet" description="Prepare a request with an amount and a repayment term. A lender will need to assess it." action="Start application" onClick={onApply} />}
    <section className="panel"><div className="panel-heading"><div><h3>Before you accept an offer</h3><p>Look beyond the headline interest rate.</p></div><FileCheck2 size={20} className="subtle-icon" /></div><div className="checklist-grid"><ChecklistItem title="Total repayment" text="Review the full amount you would repay." /><ChecklistItem title="Installment schedule" text="Check each amount and its due date." /><ChecklistItem title="Fees and conditions" text="Understand charges, late payment rules, and exclusions." /><ChecklistItem title="Provider identity" text="Confirm the lender and the official agreement." /></div></section>
  </div>;
}
function ChecklistItem({ title, text }: { title: string; text: string }) { return <div className="checklist-item"><CheckCircle2 size={18} /><div><b>{title}</b><span>{text}</span></div></div>; }

function InsurancePage({ policies, premiums, motorcycles, claims, onQuote, onClaim, onPayPremium }: { policies: Policy[]; premiums: Premium[]; motorcycles: Motorcycle[]; claims: InsuranceClaim[]; onQuote: () => void; onClaim: () => void; onPayPremium: (premium: Premium) => void }) {
  return <div className="section-stack"><div className="insurance-hero"><div className="insurance-hero-icon"><ShieldCheck size={39} /></div><div><span className="eyebrow">PROTECT YOUR LIVELIHOOD</span><h2>Insurance information, without the guesswork.</h2><p>Track policy records and upcoming premiums. Policy status must be confirmed by the responsible insurer.</p></div><div className="toolbar-actions"><button className="button button-secondary" onClick={onClaim}><FileCheck2 size={16} /> Submit a claim</button><button className="button button-primary" onClick={onQuote}><Plus size={16} /> Request a quote</button></div></div>
    <div className="info-callout"><AlertCircle size={19} /><div><b>A payment attempt is not active cover</b><span>Monthly installment schedules are shown only when the insurer supports them. Always confirm policy status and conditions with your insurer.</span></div></div>
    <div className="section-toolbar"><div><h3>Policy records <span className="count-pill">{policies.length}</span></h3><p>Connected records or explicitly labeled demo records.</p></div></div>
    <div className="policy-grid">{policies.map((policy) => <article className="policy-card" key={policy.id}><div className="policy-card-top"><span className="policy-brand"><ShieldCheck size={21} /></span><span className={'status-pill ' + (policy.status === 'active' ? 'success' : policy.status === 'demo_active' ? 'warning' : 'neutral')}>{policy.status.replaceAll('_', ' ')}</span></div><span className="eyebrow">POLICY REFERENCE</span><h3>{policy.policy_number || 'Pending partner reference'}</h3><div className="policy-detail"><span>Motorcycle</span><b>{motorcycles.find((bike) => bike.id === policy.motorcycle_id)?.registration_number || 'Not linked'}</b></div><div className="policy-detail"><span>Coverage end date</span><b>{fmtDate(policy.coverage_end)}</b></div><p className="small muted">Confirm coverage and all exclusions directly with the insurer.</p></article>)}</div>
    {!policies.length && <EmptyCard title="No policy records yet" description="Request a quote from a participating insurer and track the response here." action="Request a quote" onClick={onQuote} />}
    <section className="panel table-panel"><div className="panel-heading"><div><h3>Premium payment schedule</h3><p>Use the insurer's supported payment arrangement and official channel.</p></div><CalendarDays size={18} className="subtle-icon" /></div><div className="table-scroll"><table><thead><tr><th>Policy</th><th>Due date</th><th>Status</th><th className="right">Installment</th><th className="right">Action</th></tr></thead><tbody>{premiums.map((premium) => <tr key={premium.id}><td><b>{policies.find((policy) => policy.id === premium.policy_id)?.policy_number || 'Policy'}</b><small>Premium installment</small></td><td>{fmtDate(premium.due_date)}</td><td><span className={'status-pill ' + statusTone(premium.status)}>{premium.status.replaceAll('_', ' ')}</span></td><td className="right amount-cell">{fmt(Number(premium.amount_due))}</td><td className="right"><button className="table-action" onClick={() => onPayPremium(premium)}>{premium.status === 'simulated_confirmed' ? 'Demo paid' : 'Review payment'}</button></td></tr>)}</tbody></table></div>{!premiums.length && <div className="compact-empty">No premium installments were returned for your account.</div>}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><h3>Insurance claims <span className="count-pill">{claims.length}</span></h3><p>Claims are submitted to the insurer for assessment; status decisions are partner-controlled.</p></div><FileCheck2 size={18} className="subtle-icon" /></div><div className="table-scroll"><table><thead><tr><th>Policy</th><th>Incident date</th><th>Description</th><th>Status</th></tr></thead><tbody>{claims.map((claim) => <tr key={claim.id}><td><b>{policies.find((policy) => policy.id === claim.policy_id)?.policy_number || 'Policy record'}</b></td><td>{fmtDate(claim.incident_date)}</td><td>{claim.description}</td><td><span className={'status-pill ' + statusTone(claim.status)}>{claim.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>{!claims.length && <div className="compact-empty">No insurance claims are recorded for your account.</div>}<div className="panel-actions"><button className="button button-secondary" onClick={onClaim}><Plus size={15} /> Submit a claim</button></div></section>
  </div>;
}

function MotorcyclesPage({ motorcycles, maintenanceRecords, documents, demo, onAdd, onMaintenance, onUploadDocument, onOpenDocument }: { motorcycles: Motorcycle[]; maintenanceRecords: MaintenanceRecord[]; documents: MotorcycleDocument[]; demo: boolean; onAdd: () => void; onMaintenance: () => void; onUploadDocument: (file: File, motorcycleId: string, documentType: string, expiresOn: string) => Promise<void>; onOpenDocument: (document: MotorcycleDocument) => void }) {
  return <div className="section-stack"><div className="section-toolbar"><div><h3>Your motorcycles <span className="count-pill">{motorcycles.length}</span></h3><p>Keep key details organized and easy to find.</p></div><div className="toolbar-actions"><button className="button button-secondary" onClick={onMaintenance}><Wrench size={15} /> Log maintenance</button><button className="button button-primary" onClick={onAdd}><Plus size={16} /> Add motorcycle</button></div></div><div className="motorcycle-grid">{motorcycles.map((bike) => <article className="motorcycle-card" key={bike.id}><div className="motorcycle-image"><span className="motorcycle-image-circle"><Bike size={52} strokeWidth={1.2} /></span><span className="status-pill neutral">{bike.is_electric ? 'Electric' : 'Petrol'}</span></div><div className="motorcycle-card-body"><span className="eyebrow">REGISTRATION NUMBER</span><h3>{bike.registration_number}</h3><p>{bike.make} {bike.model}{bike.model_year ? ' · ' + bike.model_year : ''}</p><div className="motorcycle-card-footer"><span><FileText size={14} /> Document tracking</span><button onClick={onAdd}>Add another <ArrowRight size={14} /></button></div></div></article>)}</div>{!motorcycles.length && <EmptyCard title="Add your first motorcycle" description="Keep registration details, insurance references, and maintenance history linked to one record." action="Add motorcycle" onClick={onAdd} />}<section className="panel"><div className="panel-heading"><div><h3>Keep your records current</h3><p>Use reminders for documents and routine service.</p></div><Wrench size={19} className="subtle-icon" /></div><div className="checklist-grid"><ChecklistItem title="Registration documents" text="Keep document copies private and up to date." /><ChecklistItem title="Insurance expiry" text="Review the date with your insurer." /><ChecklistItem title="Maintenance history" text="Track service dates and repair budgets." /><ChecklistItem title="Safe document uploads" text="Only upload documents the workflow actually needs." /></div></section><MotorcycleDocumentsPanel motorcycles={motorcycles} documents={documents} demo={demo} onUpload={onUploadDocument} onOpen={onOpenDocument} />
    <section className="panel table-panel"><div className="panel-heading"><div><h3>Maintenance history <span className="count-pill">{maintenanceRecords.length}</span></h3><p>Keep repair costs and upcoming service reminders connected to each motorcycle.</p></div><Wrench size={18} className="subtle-icon" /></div><div className="table-scroll"><table><thead><tr><th>Motorcycle</th><th>Service date</th><th>Description</th><th>Next service</th><th className="right">Cost</th></tr></thead><tbody>{maintenanceRecords.map((record) => <tr key={record.id}><td><b>{motorcycles.find((bike) => bike.id === record.motorcycle_id)?.registration_number || 'Motorcycle'}</b></td><td>{fmtDate(record.service_date)}</td><td>{record.description}{record.odometer_km ? <small>Odometer: {Number(record.odometer_km).toLocaleString()} km</small> : null}</td><td>{fmtDate(record.next_service_date)}</td><td className="right amount-cell">{fmt(Number(record.amount))}</td></tr>)}</tbody></table></div>{!maintenanceRecords.length && <div className="compact-empty">No maintenance records yet. Log a service or repair to get started.</div>}<div className="panel-actions"><button className="button button-secondary" onClick={onMaintenance}><Plus size={15} /> Log maintenance</button></div></section></div>;
}

function MotorcycleDocumentsPanel({ motorcycles, documents, demo, onUpload, onOpen }: { motorcycles: Motorcycle[]; documents: MotorcycleDocument[]; demo: boolean; onUpload: (file: File, motorcycleId: string, documentType: string, expiresOn: string) => Promise<void>; onOpen: (document: MotorcycleDocument) => void }) {
  const [motorcycleId, setMotorcycleId] = useState('');
  const [documentType, setDocumentType] = useState('registration');
  const [expiresOn, setExpiresOn] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const selectedBike = motorcycles.find((bike) => bike.id === motorcycleId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!selectedBike) { setError('Select one of your motorcycles.'); return; }
    if (!file) { setError('Choose a document file first.'); return; }
    setUploading(true);
    try {
      await onUpload(file, motorcycleId, documentType, expiresOn);
      setFile(null); setExpiresOn('');
      const input = document.getElementById('motosave-document-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The document could not be uploaded.');
    } finally { setUploading(false); }
  }

  return <section className="panel document-panel">
    <div className="panel-heading"><div><h3>Motorcycle documents</h3><p>Private records for registration, insurance, inspection, and ownership.</p></div><FileText size={18} className="subtle-icon" /></div>
    <div className="document-grid">
      <form className="form-stack document-form" onSubmit={submit}>
        <label>Motorcycle<select value={motorcycleId} onChange={(e) => setMotorcycleId(e.target.value)} required><option value="">Select a motorcycle</option>{motorcycles.map((bike) => <option key={bike.id} value={bike.id}>{bike.registration_number} · {bike.make} {bike.model}</option>)}</select></label>
        <label>Document type<select value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option value="registration">Registration</option><option value="insurance">Insurance</option><option value="inspection">Inspection</option><option value="ownership">Ownership</option><option value="other">Other</option></select></label>
        <label>Expiry date <span className="optional-label">Optional</span><input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} /></label>
        <label>Document file<input id="motosave-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
        <p className="small muted document-note">PDF or image, up to 10 MB. Private uploads only. Do not upload unrelated personal information.</p>
        {demo && <div className="inline-note"><AlertCircle size={15} /> Demo mode saves document metadata only. The selected file is not uploaded.</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <button className="button button-primary" type="submit" disabled={uploading || !motorcycles.length}>{uploading ? 'Saving document…' : 'Save document record'} <ArrowRight size={15} /></button>
      </form>
      <div className="document-list">
        {documents.map((document) => <div className="document-item" key={document.id}><span className="document-icon"><FileText size={18} /></span><span className="document-copy"><b>{document.document_type.replaceAll('_', ' ')}</b><small>{motorcycles.find((bike) => bike.id === document.motorcycle_id)?.registration_number || 'Motorcycle'} · {document.expires_on ? 'Expires ' + fmtDate(document.expires_on) : 'No expiry date'}</small><small>{document.verification_status.replaceAll('_', ' ')}</small></span><button className="table-action" type="button" onClick={() => onOpen(document)}>{demo ? 'Demo' : 'Open'}</button></div>)}
        {!documents.length && <div className="compact-empty">No motorcycle documents saved yet.</div>}
      </div>
    </div>
  </section>;
}

function ActivityPage({ transactions, loans, premiums, searchQuery }: { transactions: SavingsTransaction[]; loans: LoanApplication[]; premiums: Premium[]; searchQuery: string }) {
  const rows = [
    ...transactions.map((tx) => ({ id: tx.id, title: tx.note || 'Savings contribution', kind: 'Savings', amount: Number(tx.amount), status: tx.verification_status, date: tx.created_at })),
    ...loans.map((loan) => ({ id: loan.id, title: loanPurpose(loan.purpose), kind: 'Financing', amount: Number(loan.requested_amount), status: loan.status, date: loan.created_at })),
    ...premiums.map((premium) => ({ id: premium.id, title: 'Insurance premium', kind: 'Insurance', amount: Number(premium.amount_due), status: premium.status, date: premium.due_date })),
  ].filter((row) => (row.title + ' ' + row.kind + ' ' + row.status).toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="section-stack"><div className="info-callout"><Activity size={19} /><div><b>One timeline, clear origins</b><span>Manual records, partner-supplied states, and simulated events are labelled separately.</span></div></div><section className="panel table-panel"><div className="panel-heading"><div><h3>Activity history</h3><p>{rows.length} matching records</p></div><Clock3 size={19} className="subtle-icon" /></div><div className="table-scroll"><table><thead><tr><th>Record</th><th>Type</th><th>Date</th><th>Status</th><th className="right">Amount</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.title}</b></td><td>{row.kind}</td><td>{fmtDate(row.date)}</td><td><span className={'status-pill ' + statusTone(row.status)}>{row.status.replaceAll('_', ' ')}</span></td><td className="right amount-cell">{fmt(row.amount)}</td></tr>)}</tbody></table></div>{!rows.length && <div className="compact-empty">No records match this search yet.</div>}</section></div>;
}

function SupportPage({ demo, onToast }: { demo: boolean; onToast: (message: string) => void }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentReference, setSentReference] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true); setError(''); setSentReference('');
    try {
      if (!subject || message.trim().length < 10) throw new Error('Choose a topic and describe the issue in at least 10 characters.');
      if (supabase && !demo) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Your session has expired. Sign in again.');
        const { data, error: insertError } = await supabase.from('support_tickets').insert({
          user_id: authData.user.id, subject: 'MotoSave support: ' + subject, category: subject, description: message.trim()
        }).select('id').single();
        if (insertError) throw insertError;
        setSentReference(data.id);
        onToast('Support ticket submitted. Keep its reference for follow-up.');
      } else {
        const key = 'motosave.support.tickets';
        let existing: unknown[] = [];
        try { existing = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]; } catch { existing = []; }
        const id = 'DEMO-' + Date.now().toString(36).toUpperCase();
        localStorage.setItem(key, JSON.stringify([{ id, subject, description: message.trim(), created_at: new Date().toISOString(), status: 'draft_demo' }, ...existing]));
        setSentReference(id);
        onToast('Demo support draft saved in this browser only.');
      }
      setSubject(''); setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Support request could not be submitted.');
    } finally { setSending(false); }
  }

  return <div className="support-layout"><section className="support-welcome"><div className="support-icon-large"><LifeBuoy size={35} /></div><span className="eyebrow">WE'RE HERE TO HELP</span><h2>Good support should feel simple.</h2><p>Describe what happened without sharing passwords, payment PINs, or verification codes. The request will remain linked to your account.</p><div className="support-topic"><ShieldCheck size={18} /><div><b>Insurance questions</b><span>Coverage and claims decisions belong to your insurer.</span></div></div><div className="support-topic"><CreditCard size={18} /><div><b>Payment questions</b><span>Keep the provider reference and never share your PIN.</span></div></div></section><section className="panel support-form-panel"><h3>Contact support</h3><p className="muted">{demo ? 'Demo mode stores a fictional support draft in this browser only.' : 'Your request will be saved to your signed-in account.'}</p><form className="form-stack" onSubmit={submit}><label>Topic<select value={subject} onChange={(e) => setSubject(e.target.value)} required><option value="">Select a topic</option><option>Account access</option><option>Savings record</option><option>Loan application</option><option>Insurance policy</option><option>Payment question</option><option>Other</option></select></label><label>What happened?<textarea value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={5000} rows={5} placeholder="Describe the problem without sharing credentials or PINs." /></label>{error && <div className="alert alert-error">{error}</div>}{sentReference && <div className="alert alert-success">Saved reference: {sentReference}</div>}<button className="button button-primary button-wide" disabled={sending} type="submit">{sending ? 'Submitting…' : 'Submit support request'} <ArrowRight size={16} /></button></form></section></div>;
}

function SettingsPage({ profileName, profileRole, onSave, demo }: { profileName: string; profileRole: string; onSave: (name: string) => void; demo: boolean }) {
  const [name, setName] = useState(profileName);
  return <div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Profile and preferences</h3><p>Basic settings for your MotoSave workspace.</p></div><Settings size={18} className="subtle-icon" /></div><form className="form-stack" onSubmit={(e) => { e.preventDefault(); onSave(name.trim() || 'MotoSave rider'); }}><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label><label>Account role<input value={profileRole} disabled /></label><label>Language<select defaultValue="en"><option value="en">English</option><option value="rw">Kinyarwanda (translation review required)</option></select></label><button className="button button-primary" type="submit">Save profile name</button></form></section><section className="panel settings-panel"><div className="panel-heading"><div><h3>Privacy & security</h3><p>Your financial information deserves careful handling.</p></div><ShieldCheck size={18} className="subtle-icon" /></div><div className="security-list"><ChecklistItem title="Account data scope" text="Connected records are protected by Supabase Row Level Security." /><ChecklistItem title="No client-side secrets" text="Only the project URL and publishable key belong in a public client." /><ChecklistItem title="Data exports and deletion" text="Production self-service export/deletion workflows require an approved operational process." /></div><span className={'status-pill ' + (demo ? 'warning' : 'success')}>{demo ? 'Local demo mode' : 'Connected to Supabase'}</span></section></div>;
}

function EmptyCard({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) {
  return <div className="empty-card"><span className="empty-illustration"><Sparkles size={30} /></span><h3>{title}</h3><p>{description}</p><button className="button button-primary" onClick={onClick}>{action} <ArrowRight size={15} /></button></div>;
}

function ActionModal({ kind, form, setForm, onSubmit, onClose, goals, motorcycles, policies }: { kind: Exclude<ModalId, null>; form: FormState; setForm: (form: FormState) => void; onSubmit: (e: FormEvent) => void; onClose: () => void; goals: Goal[]; motorcycles: Motorcycle[]; policies: Policy[] }) {
  const update = (key: keyof FormState, value: string) => setForm({ ...form, [key]: value });
  const titles: Record<Exclude<ModalId, null>, string> = { goal: 'Create a savings goal', contribution: 'Record a contribution', loan: 'Start a financing request', motorcycle: 'Add a motorcycle', quote: 'Request an insurance quote', maintenance: 'Log motorcycle maintenance', claim: 'Submit an insurance claim' };
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><motion.div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }}><div className="modal-heading"><div><span className="eyebrow">MOTOSAVE WORKSPACE</span><h2 id="modal-title">{titles[kind]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div><form className="form-stack modal-form" onSubmit={onSubmit}>
    {kind === 'goal' && <><label>Goal name<input autoFocus value={form.title} onChange={(e) => update('title', e.target.value)} required minLength={2} placeholder="e.g. Emergency reserve" /></label><div className="form-row"><label>Target amount (RWF)<input type="number" min="1" step="1" value={form.target_amount} onChange={(e) => update('target_amount', e.target.value)} required placeholder="500000" /></label><label>Target date<input type="date" value={form.target_date} onChange={(e) => update('target_date', e.target.value)} /></label></div><div className="form-row"><label>Goal purpose<select value={form.purpose} onChange={(e) => update('purpose', e.target.value)}><option value="emergency">Emergency reserve</option><option value="maintenance">Motorcycle maintenance</option><option value="ownership">Motorcycle ownership</option><option value="insurance">Insurance premium</option><option value="business">Business growth</option><option value="custom">Other goal</option></select></label><label>Contribution plan<select value={form.frequency} onChange={(e) => update('frequency', e.target.value)}><option value="flexible">Flexible</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div></>}
    {kind === 'contribution' && <><label>Goal<select value={form.motorcycle_id} onChange={(e) => update('motorcycle_id', e.target.value)}><option value="">General contribution</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></label><label>Amount (RWF)<input type="number" min="1" step="1" autoFocus value={form.amount} onChange={(e) => update('amount', e.target.value)} required placeholder="15000" /></label><label>Note<input value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="Optional reminder for yourself" /></label><div className="inline-note"><AlertCircle size={16} /> This is a manual planning record. It does not prove money was deposited.</div></>}
    {kind === 'motorcycle' && <><label>Registration number<input autoFocus value={form.registration_number} onChange={(e) => update('registration_number', e.target.value)} required placeholder="RAA 123 A" /></label><div className="form-row"><label>Make<input value={form.make} onChange={(e) => update('make', e.target.value)} required placeholder="TVS" /></label><label>Model<input value={form.model} onChange={(e) => update('model', e.target.value)} required placeholder="HLX 125" /></label></div><label>Model year <span className="optional-label">Optional</span><input type="number" min="1980" max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="2023" /></label></>}
    {kind === 'loan' && <><label>Financing purpose<select value={form.loan_purpose} onChange={(e) => update('loan_purpose', e.target.value)}><option value="motorcycle_purchase">Motorcycle purchase</option><option value="electric_motorcycle">Electric motorcycle</option><option value="motorcycle_maintenance">Motorcycle maintenance</option><option value="business_expansion">Business expansion</option><option value="emergency">Emergency financing</option><option value="other">Other permitted purpose</option></select></label><div className="form-row"><label>Amount requested (RWF)<input type="number" min="1" step="1" autoFocus value={form.requested_amount} onChange={(e) => update('requested_amount', e.target.value)} required placeholder="350000" /></label><label>Term (months)<select value={form.term_months} onChange={(e) => update('term_months', e.target.value)}>{[3,6,9,12,18,24,36,48,60].map((n) => <option value={n} key={n}>{n} months</option>)}</select></label></div><label>Additional context <span className="optional-label">Optional</span><textarea rows={3} value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="Describe what the financing is for." /></label><div className="inline-note"><ShieldAlert size={16} /> Submitting a request is not approval. A partner lender must assess the application and issue the real terms.</div></>}
    {kind === 'quote' && <><label>Motorcycle <span className="optional-label">Optional</span><select value={form.motorcycle_id} onChange={(e) => update('motorcycle_id', e.target.value)}><option value="">Choose later / not linked</option>{motorcycles.map((bike) => <option value={bike.id} key={bike.id}>{bike.registration_number} · {bike.make} {bike.model}</option>)}</select></label><label>Anything the insurer should know? <span className="optional-label">Optional</span><textarea rows={4} value={form.quote_notes} onChange={(e) => update('quote_notes', e.target.value)} placeholder="Share only details required to request a quote." /></label><div className="inline-note"><ShieldCheck size={16} /> A quote request is not a policy. The insurer must provide terms and confirm any coverage.</div></>}
    {kind === 'maintenance' && <><label>Motorcycle<select value={form.motorcycle_id} onChange={(e) => update('motorcycle_id', e.target.value)} required><option value="">Select a motorcycle</option>{motorcycles.map((bike) => <option key={bike.id} value={bike.id}>{bike.registration_number} · {bike.make} {bike.model}</option>)}</select></label><div className="form-row"><label>Service date<input type="date" value={form.service_date} onChange={(e) => update('service_date', e.target.value)} required /></label><label>Cost (RWF)<input type="number" min="0" step="1" value={form.service_amount} onChange={(e) => update('service_amount', e.target.value)} placeholder="0" /></label></div><label>Service or repair description<textarea rows={3} value={form.service_description} onChange={(e) => update('service_description', e.target.value)} minLength={3} maxLength={1000} required placeholder="e.g. oil change, brake pads, tire repair" /></label><div className="form-row"><label>Odometer (km) <span className="optional-label">Optional</span><input type="number" min="0" step="1" value={form.odometer_km} onChange={(e) => update('odometer_km', e.target.value)} placeholder="45000" /></label><label>Next service date <span className="optional-label">Optional</span><input type="date" value={form.next_service_date} onChange={(e) => update('next_service_date', e.target.value)} /></label></div></>}
    {kind === 'claim' && <><label>Policy record<select value={form.claim_policy_id} onChange={(e) => update('claim_policy_id', e.target.value)} required><option value="">Select a policy</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.policy_number || policy.status} · {policy.status.replaceAll('_', ' ')}</option>)}</select></label><label>Incident date<input type="date" value={form.incident_date} onChange={(e) => update('incident_date', e.target.value)} required /></label><label>Describe the incident<textarea rows={4} value={form.incident_description} onChange={(e) => update('incident_description', e.target.value)} minLength={10} maxLength={5000} required placeholder="Describe when it happened and what occurred. Do not include unnecessary sensitive information." /></label><div className="inline-note"><ShieldAlert size={16} /> The insurer evaluates claims and decides coverage. This request is not a guarantee of acceptance or payment.</div></>}
    <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit">{kind === 'goal' ? 'Create goal' : kind === 'contribution' ? 'Record entry' : kind === 'motorcycle' ? 'Save motorcycle' : kind === 'loan' ? 'Submit request' : kind === 'maintenance' ? 'Save service record' : kind === 'claim' ? 'Submit claim' : 'Send quote request'} <ArrowRight size={15} /></button></div>
  </form></motion.div></motion.div>;
}

function goalPurpose(value: string) { const labels: Record<string, string> = { emergency: 'Build a little more financial breathing room.', maintenance: 'Prepare for repair and routine service costs.', ownership: 'Plan for motorcycle ownership or a deposit.', insurance: 'Prepare for a permitted insurance premium.', business: 'Build a buffer for business growth.', custom: 'A personal goal you chose.' }; return labels[value] || 'A personal savings target.'; }
function loanPurpose(value: string) { const labels: Record<string, string> = { motorcycle_purchase: 'Motorcycle purchase', electric_motorcycle: 'Electric motorcycle', motorcycle_maintenance: 'Motorcycle maintenance', business_expansion: 'Business expansion', emergency: 'Emergency financing', other: 'Other financing' }; return labels[value] || value.replaceAll('_', ' '); }
function statusTone(value: string) {
  if (['active', 'confirmed', 'verified', 'completed'].includes(value)) return 'success';
  if (['overdue', 'failed', 'rejected', 'suspended', 'expired'].includes(value)) return 'danger';
  if (['under_review', 'submitted', 'submitted_demo', 'pending', 'due', 'awaiting_documents', 'scheduled'].includes(value)) return 'warning';
  return 'neutral';
}
