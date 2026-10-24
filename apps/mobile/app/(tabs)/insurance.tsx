import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Policy = { id: string; policy_number: string | null; status: string; coverage_end: string | null };
type Premium = { id: string; policy_id: string; amount_due: number; due_date: string; status: string };
type Claim = { id: string; policy_id: string; incident_date: string; description: string; status: string; created_at: string };
type InsuranceProduct = { id: string; name: string; description: string | null; coverage_type: string; supports_monthly_payments: boolean };
type QuoteRequest = { id: string; product_id: string | null; motorcycle_id: string | null; notes: string | null; status: string; quoted_premium: number | null; coverage_duration_months: number | null; quoted_terms: Record<string, unknown>; quote_expires_at: string | null; decision_reason: string | null; created_at: string };
const currency = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value || 0);

export default function InsuranceScreen() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [premiums, setPremiums] = useState<Premium[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [products, setProducts] = useState<InsuranceProduct[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0,10));
  const [incidentDescription, setIncidentDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingClaim, setSendingClaim] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [policyResult, productResult, quoteResult] = await Promise.all([
      supabase.from('insurance_policies').select('id,policy_number,status,coverage_end').order('created_at', { ascending: false }),
      supabase.from('insurance_products').select('id,name,description,coverage_type,supports_monthly_payments').order('created_at', { ascending: false }),
      supabase.from('insurance_quote_requests').select('id,product_id,motorcycle_id,notes,status,quoted_premium,coverage_duration_months,quoted_terms,quote_expires_at,decision_reason,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (policyResult.error) Alert.alert('Could not load policies', policyResult.error.message);
    if (productResult.error) Alert.alert('Could not load published insurance products', productResult.error.message);
    if (quoteResult.error) Alert.alert('Could not load quote requests', quoteResult.error.message);
    const nextPolicies = (policyResult.data || []) as Policy[];
    setPolicies(nextPolicies);
    setProducts((productResult.data || []) as InsuranceProduct[]);
    setQuoteRequests((quoteResult.data || []) as QuoteRequest[]);
    if (productResult.data?.length) setSelectedProductId((current) => current || productResult.data![0].id);
    if (nextPolicies.length) {
      const ids = nextPolicies.map((policy) => policy.id);
      const [premiumResult, claimResult] = await Promise.all([
        supabase.from('insurance_premium_installments').select('id,policy_id,amount_due,due_date,status').in('policy_id', ids).order('due_date', { ascending: true }),
        supabase.from('insurance_claims').select('id,policy_id,incident_date,description,status,created_at').in('policy_id', ids).order('created_at', { ascending: false }),
      ]);
      if (premiumResult.error) Alert.alert('Could not load premium schedule', premiumResult.error.message);
      if (claimResult.error) Alert.alert('Could not load claims', claimResult.error.message);
      setPremiums((premiumResult.data || []) as Premium[]);
      setClaims((claimResult.data || []) as Claim[]);
      if (!selectedPolicyId) setSelectedPolicyId(ids[0]);
    } else {
      setPremiums([]); setClaims([]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function requestQuote() {
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Configure the shared Supabase project before submitting a quote request.'); return; }
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('insurance_quote_requests').insert({ user_id: auth.user.id, product_id: selectedProductId || null, notes: notes.trim() || null });
      if (error) throw error;
      setNotes(''); await load(); Alert.alert('Request submitted', 'A quote request is not a policy. Wait for a participating insurer to provide actual terms.');
    } catch (error) { Alert.alert('Could not submit', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSending(false); }
  }


  async function decideQuote(quote: QuoteRequest, accept: boolean) {
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Quote decisions require the shared backend.'); return; }
    if (quote.status !== 'quote_available') { Alert.alert('Quote unavailable', 'Only quotes issued by an insurer can be accepted or declined.'); return; }
    if (quote.quote_expires_at && Date.parse(quote.quote_expires_at) <= Date.now()) { Alert.alert('Quote expired', 'Request a fresh quote from the insurer.'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('partner-operations', {
        body: accept
          ? { action: 'accept_insurance_quote', quote_request_id: quote.id, reason: 'Applicant accepted the issued insurance quote.' }
          : { action: 'decline_insurance_quote', quote_request_id: quote.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      await load();
      Alert.alert(accept ? 'Quote accepted' : 'Quote declined', accept
        ? 'A pending-payment policy record was created. Coverage is not active until insurer issuance and payment are confirmed.'
        : 'The quote was declined. You can request another quote.');
    } catch (error) {
      Alert.alert('Could not update quote', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function submitClaim() {
    if (!selectedPolicyId) { Alert.alert('Choose a policy', 'A claim must be linked to an insurer-issued policy record.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate) || Number.isNaN(Date.parse(incidentDate))) { Alert.alert('Check the incident date', 'Enter the incident date in YYYY-MM-DD format.'); return; }
    if (incidentDescription.trim().length < 10) { Alert.alert('Add more detail', 'Describe the incident in at least 10 characters.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Claims need the shared Supabase backend.'); return; }
    setSendingClaim(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('insurance_claims').insert({
        user_id: auth.user.id, policy_id: selectedPolicyId, incident_date: incidentDate, description: incidentDescription.trim(),
      });
      if (error) throw error;
      setIncidentDescription('');
      await load();
      Alert.alert('Claim submitted', 'Your claim has been recorded. The insurer controls assessment, acceptance, and settlement.');
    } catch(error) {
      Alert.alert('Could not submit claim', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSendingClaim(false); }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="shield-checkmark-outline" size={28} color="#2869DF" /></View><Text style={styles.kicker}>PROTECT YOUR WORK</Text><Text style={styles.title}>Insurance information, made easier to track.</Text><Text style={styles.subtitle}>See policy records and upcoming premium dates. An insurer must confirm actual coverage.</Text></View>
    <View style={styles.notice}><Ionicons name="alert-circle-outline" size={19} color="#A06B1B" /><Text style={styles.noticeText}>A payment attempt is not proof of cover. Monthly installments are supported only when allowed by the actual insurer and policy.</Text></View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Published insurance products</Text><Text style={styles.count}>{products.length}</Text></View>
    {products.length ? <View style={styles.formCard}>{products.map(product=><Pressable key={product.id} onPress={()=>setSelectedProductId(product.id)} style={[styles.productCard,selectedProductId===product.id&&styles.productActive]}><View style={{flex:1}}><Text style={styles.policyTitle}>{product.name}</Text><Text style={styles.policyMeta}>{product.description || product.coverage_type.replaceAll('_',' ')}</Text><Text style={styles.policyMeta}>{product.supports_monthly_payments?'Monthly options supported by insurer':'Ask insurer about payment options'}</Text></View><Ionicons name={selectedProductId===product.id?'radio-button-on':'radio-button-off'} size={19} color={selectedProductId===product.id?'#2869DF':'#9CA9BA'}/></Pressable>)}</View> : <View style={styles.notice}><Ionicons name="information-circle-outline" size={18} color="#A06C17"/><Text style={styles.noticeText}>No verified insurer has published a product yet. A general request can be saved, but it will not enter a specific insurer queue until you select a published product.</Text></View>}
    <View style={styles.formCard}><Text style={styles.formTitle}>Request a quote</Text><Text style={styles.formHint}>Ask a participating insurer to provide terms. No policy is issued by submitting this form.</Text><TextInput style={[styles.input,styles.notes]} value={notes} onChangeText={setNotes} placeholder="Optional information for the insurer" placeholderTextColor="#95A2B6" multiline maxLength={1000} /><Pressable style={[styles.button,sending && { opacity:.6 }]} onPress={requestQuote} disabled={sending}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request quote  →</Text>}</Pressable></View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Quote requests</Text><Text style={styles.count}>{quoteRequests.length}</Text></View>
    {quoteRequests.map(quote=><View key={quote.id} style={styles.policyCard}><View style={styles.policyIcon}><Ionicons name="document-text-outline" size={20} color="#2869DF"/></View><View style={{flex:1}}><Text style={styles.policyTitle}>{products.find(p=>p.id===quote.product_id)?.name || 'General quote request'}</Text><Text style={styles.policyMeta}>{quote.quoted_premium ? currency(Number(quote.quoted_premium))+' · '+quote.coverage_duration_months+' months' : 'Premium not quoted yet'}</Text><Text style={styles.policyMeta}>{quote.status.replaceAll('_',' ')}{quote.quote_expires_at ? ' · Expires '+quote.quote_expires_at.slice(0,10) : ''}</Text>{quote.decision_reason ? <Text style={styles.policyMeta}>{quote.decision_reason}</Text> : null}{quote.status==='quote_available'&&<View style={styles.quoteButtons}><Pressable style={styles.quoteAccept} onPress={()=>void decideQuote(quote,true)}><Text style={styles.quoteAcceptText}>Accept quote</Text></Pressable><Pressable style={styles.quoteDecline} onPress={()=>void decideQuote(quote,false)}><Text style={styles.quoteDeclineText}>Decline</Text></Pressable></View>}</View></View>)}
    {!quoteRequests.length&&<Text style={styles.footerNote}>No quote requests yet.</Text>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Policy records</Text><Text style={styles.count}>{policies.length}</Text></View>
    {loading ? <ActivityIndicator color="#2869DF" style={{ marginTop: 20 }} /> : policies.map((policy) => <View key={policy.id} style={styles.policyCard}><View style={styles.policyIcon}><Ionicons name="shield-checkmark-outline" size={21} color="#2869DF" /></View><View style={{ flex: 1 }}><Text style={styles.policyTitle}>{policy.policy_number || 'Pending insurer reference'}</Text><Text style={styles.policyMeta}>Coverage ends {policy.coverage_end || 'not recorded'}</Text></View><View style={styles.status}><Text style={styles.statusText}>{policy.status.replaceAll('_',' ')}</Text></View></View>)}
    {!loading && policies.length === 0 && <View style={styles.empty}><Ionicons name="shield-outline" size={25} color="#7095D2" /><Text style={styles.emptyTitle}>No policy records yet</Text><Text style={styles.emptyText}>A participating insurer must provide the quote and issue any actual policy.</Text></View>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Premium schedule</Text><Text style={styles.count}>{premiums.length}</Text></View>
    {premiums.map((premium) => <View key={premium.id} style={styles.premiumCard}><View style={{ flex: 1 }}><Text style={styles.policyTitle}>{currency(Number(premium.amount_due))}</Text><Text style={styles.policyMeta}>Due {premium.due_date}</Text></View><View style={styles.status}><Text style={styles.statusText}>{premium.status.replaceAll('_',' ')}</Text></View></View>)}
    {!premiums.length && <Text style={styles.footerNote}>Premium schedules will appear only after a supported policy record and installment schedule are supplied by the insurer.</Text>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Submit an insurance claim</Text><Text style={styles.count}>{claims.length}</Text></View>
    <View style={styles.formCard}><Text style={styles.formHint}>Only submit claims for an actual policy issued by the insurer. Submission does not mean the claim has been accepted.</Text>
      <Text style={styles.label}>Policy record</Text><View style={styles.chips}>{policies.map((policy) => <Pressable key={policy.id} onPress={() => setSelectedPolicyId(policy.id)} style={[styles.chip,selectedPolicyId===policy.id&&styles.chipActive]}><Text style={[styles.chipText,selectedPolicyId===policy.id&&styles.chipTextActive]}>{policy.policy_number || policy.status}</Text></Pressable>)}</View>
      <TextInput style={styles.input} value={incidentDate} onChangeText={setIncidentDate} placeholder="Incident date (YYYY-MM-DD)" placeholderTextColor="#95A2B6" maxLength={10}/>
      <TextInput style={[styles.input,styles.claimDescription]} value={incidentDescription} onChangeText={setIncidentDescription} placeholder="Describe the incident and damage..." placeholderTextColor="#95A2B6" multiline maxLength={5000}/>
      <Pressable style={[styles.button,sendingClaim&&{opacity:.6}]} onPress={submitClaim} disabled={sendingClaim}>{sendingClaim?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>Submit claim  →</Text>}</Pressable>
    </View>
    {claims.map(claim=><View key={claim.id} style={styles.policyCard}><Text style={styles.policyTitle}>Claim · {claim.incident_date}</Text><Text style={styles.policyMeta}>{policies.find(policy=>policy.id===claim.policy_id)?.policy_number || 'Policy'} · {claim.status.replaceAll('_',' ')}</Text><Text style={styles.claimText}>{claim.description}</Text></View>)}
    {!claims.length&&<Text style={styles.footerNote}>No claims recorded for your policy records.</Text>}
    <Text style={styles.footerNote}>Real premium payments are not connected in this build. Use the insurer's official approved payment channel until a provider integration is implemented.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' }, content: { padding: 18, paddingBottom: 35 },
  hero: { padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#E2EAF9', backgroundColor: '#EEF4FF', marginTop: 14, marginBottom: 14 },
  heroIcon: { width: 47, height: 47, borderRadius: 14, backgroundColor: '#DDEAFF', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  kicker: { color: '#6682B0', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 },
  title: { color: '#1F3558', fontSize: 23, fontWeight: '800', letterSpacing: -.5, lineHeight: 28, marginBottom: 9 },
  subtitle: { color: '#7186A8', fontSize: 11, lineHeight: 17 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#FFF5E3', padding: 12, borderRadius: 10, marginBottom: 16 },
  noticeText: { flex: 1, color: '#926E36', fontSize: 10, lineHeight: 15 },
  formCard: { padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6ECF5', marginBottom: 24 },
  formHint: { color: '#8996AB', fontSize: 10, lineHeight: 15, marginBottom: 12 },
  formTitle: { color: '#273A57', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E8EDF5', backgroundColor: '#FBFCFF', marginBottom: 8 },
  productActive: { borderColor: '#AAC5F2', backgroundColor: '#F0F5FF' },
  quoteButtons: { flexDirection: 'row', gap: 7, marginTop: 8 },
  quoteAccept: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2869DF' },
  quoteAcceptText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  quoteDecline: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F0D8DD', backgroundColor: '#FFF5F6' },
  quoteDeclineText: { color: '#B54E60', fontSize: 9, fontWeight: '800' },
  label: { color: '#65758F', fontSize: 10, fontWeight: '800', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  chip: { borderWidth: 1, borderColor: '#E0E8F4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#A9C6F5', backgroundColor: '#EAF1FF' },
  chipText: { color: '#7A879B', fontSize: 9, fontWeight: '700' },
  chipTextActive: { color: '#2869DF' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#DFE7F2', borderRadius: 10, paddingHorizontal: 12, color: '#283A56', backgroundColor: '#FBFCFE', fontSize: 11, marginBottom: 11 },
  claimDescription: { minHeight: 100, paddingTop: 11, textAlignVertical: 'top' },
  claimText: { color: '#7E8BA0', fontSize: 10, lineHeight: 15, marginTop: 9 },
  notes: { minHeight: 72, paddingTop: 11, textAlignVertical: 'top' },
  button: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2869DF' },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#263954', fontSize: 16, fontWeight: '800' },
  count: { color: '#2869DF', backgroundColor: '#E6EEFF', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800' },
  policyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: '#E7EDF5', backgroundColor: '#fff', marginBottom: 9 },
  policyIcon: { width: 41, height: 41, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  policyTitle: { color: '#344560', fontSize: 11, fontWeight: '800', marginBottom: 5 },
  policyMeta: { color: '#8A97AC', fontSize: 9 },
  status: { maxWidth: 96, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 7, backgroundColor: '#FFF4DF' },
  statusText: { color: '#A27322', fontSize: 8, fontWeight: '800', textTransform: 'capitalize' },
  premiumCard: { flexDirection: 'row', alignItems: 'center', padding: 13, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E7EDF5', marginBottom: 9 },
  empty: { alignItems: 'center', padding: 24, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCE5F4', backgroundColor: '#FCFDFF' },
  emptyTitle: { color: '#354861', fontWeight: '800', fontSize: 12, marginTop: 9 }, emptyText: { color: '#8996AB', fontSize: 10, textAlign: 'center', marginTop: 5, lineHeight: 15 },
  footerNote: { color: '#9AA5B6', fontSize: 9, lineHeight: 15, marginTop: 14 },
});
