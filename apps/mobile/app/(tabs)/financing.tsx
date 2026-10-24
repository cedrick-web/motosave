import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Application = { id: string; application_ref: string; product_id: string | null; purpose: string; requested_amount: number; term_months: number; status: string; created_at: string };
type LoanProduct = { id: string; name: string; description: string | null; min_amount: number | null; max_amount: number | null; min_term_months: number | null; max_term_months: number | null };
type LoanOffer = { id: string; application_id: string; principal_amount: number; interest_rate: number; interest_basis: string; fees: number; term_months: number; payment_frequency: string; total_repayment: number; status: string; expires_at: string | null; created_at: string };
type Installment = { id: string; loan_application_id: string; installment_number: number; due_date: string; total_due: number; amount_paid: number; status: string };
const currency = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value || 0);

export default function FinancingScreen() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('6');
  const [purpose, setPurpose] = useState('motorcycle_maintenance');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [applicationResult, productResult] = await Promise.all([
      supabase.from('loan_applications').select('id,application_ref,product_id,purpose,requested_amount,term_months,status,created_at').order('created_at', { ascending: false }),
      supabase.from('loan_products').select('id,name,description,min_amount,max_amount,min_term_months,max_term_months').order('created_at', { ascending: false }),
    ]);
    if (applicationResult.error) Alert.alert('Could not load applications', applicationResult.error.message);
    if (productResult.error) Alert.alert('Could not load published lender products', productResult.error.message);
    const nextApplications = (applicationResult.data || []) as Application[];
    setApplications(nextApplications);
    setProducts((productResult.data || []) as LoanProduct[]);
    if (productResult.data?.length) setSelectedProductId((current) => current || productResult.data![0].id);
    const ids = nextApplications.map((application) => application.id);
    if (ids.length) {
      const [offersResult, installmentsResult] = await Promise.all([
        supabase.from('loan_offers').select('id,application_id,principal_amount,interest_rate,interest_basis,fees,term_months,payment_frequency,total_repayment,status,expires_at,created_at').in('application_id', ids).order('created_at', { ascending: false }),
        supabase.from('repayment_installments').select('id,loan_application_id,installment_number,due_date,total_due,amount_paid,status').in('loan_application_id', ids).order('due_date', { ascending: true }),
      ]);
      if (offersResult.error) Alert.alert('Could not load lender offers', offersResult.error.message);
      if (installmentsResult.error) Alert.alert('Could not load repayment schedule', installmentsResult.error.message);
      setOffers((offersResult.data || []) as LoanOffer[]);
      setInstallments((installmentsResult.data || []) as Installment[]);
    } else {
      setOffers([]); setInstallments([]);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit() {
    const numeric = Number(amount); const months = Number(term);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isInteger(months) || months < 1 || months > 120) { Alert.alert('Check the application', 'Enter an amount above zero and a term between 1 and 120 months.'); return; }
    const chosenProduct = products.find((product) => product.id === selectedProductId);
    if (selectedProductId && !chosenProduct) { Alert.alert('Product unavailable', 'Refresh the published lender catalog before submitting.'); return; }
    if (chosenProduct && ((chosenProduct.min_amount !== null && numeric < Number(chosenProduct.min_amount)) ||
      (chosenProduct.max_amount !== null && numeric > Number(chosenProduct.max_amount)) ||
      (chosenProduct.min_term_months !== null && months < Number(chosenProduct.min_term_months)) ||
      (chosenProduct.max_term_months !== null && months > Number(chosenProduct.max_term_months)))) {
      Alert.alert('Outside product limits', 'The requested amount or term is outside the selected lender product limits.');
      return;
    }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Configure the Supabase project before submitting a request.'); return; }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('loan_applications').insert({ user_id: auth.user.id, product_id: selectedProductId || null, purpose, requested_amount: numeric, term_months: months, notes: notes.trim() || null });
      if (error) throw error;
      setAmount(''); setNotes(''); await load();
      Alert.alert('Request submitted', 'This is an application, not an approval. The participating lender controls assessment and terms.');
    } catch (error) { Alert.alert('Could not submit', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  }
  async function respondToOffer(offer: LoanOffer, decision: 'accepted' | 'declined') {
    if (offer.status !== 'offered') { Alert.alert('Offer unavailable', 'This offer is no longer available.'); return; }
    if (offer.expires_at && Date.parse(offer.expires_at) <= Date.now()) { Alert.alert('Offer expired', 'Ask the lender whether the offer can be renewed.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Offer decisions require the shared backend.'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('partner-operations', {
        body: { action: 'respond_to_loan_offer', offer_id: offer.id, decision },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      await load();
      Alert.alert(decision === 'accepted' ? 'Offer acceptance recorded' : 'Offer declined',
        decision === 'accepted'
          ? 'The lender still needs to complete agreement and disbursement. No money was moved by accepting this offer.'
          : 'No loan was approved or disbursed.');
    } catch (error) {
      Alert.alert('Could not update offer', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="cash-outline" size={26} color="#E5EEFF" /></View><Text style={styles.kicker}>RESPONSIBLE FINANCING</Text><Text style={styles.title}>See the full commitment before you borrow.</Text><Text style={styles.subtitle}>Submit requests and track partner status. Only a lender can approve credit or issue an offer.</Text></View>
    <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={18} color="#2A6DCA" /><Text style={styles.noticeText}>Review the total repayment, fees, payment frequency, and conditions before accepting any offer.</Text></View>
    {products.length ? <View style={styles.formCard}><Text style={styles.formTitle}>Published lender products</Text><Text style={styles.formHint}>Only verified partners with published products are listed.</Text>{products.map((product) => <Pressable key={product.id} onPress={() => setSelectedProductId(product.id)} style={[styles.productCard, selectedProductId===product.id&&styles.productActive]}><View style={{flex:1}}><Text style={styles.appTitle}>{product.name}</Text><Text style={styles.appMeta}>{product.description || 'Partner financing product'}</Text><Text style={styles.appMeta}>Amount: {product.min_amount?currency(Number(product.min_amount)):'By assessment'} – {product.max_amount?currency(Number(product.max_amount)):'By assessment'}</Text></View><Ionicons name={selectedProductId===product.id?'radio-button-on':'radio-button-off'} size={19} color={selectedProductId===product.id?'#2869DF':'#9CA9BA'}/></Pressable>)}</View> : <View style={styles.notice}><Ionicons name="information-circle-outline" size={18} color="#A06C17"/><Text style={styles.noticeText}>No published lender products are available yet. You can save a general request, but it will not enter a specific lender's queue until a verified product is published and selected.</Text></View>}
    <View style={styles.formCard}><Text style={styles.formTitle}>New financing request</Text><Text style={styles.label}>Purpose</Text><View style={styles.chips}>{[['motorcycle_maintenance','Repairs'],['motorcycle_purchase','Bike purchase'],['electric_motorcycle','Electric bike'],['business_expansion','Business growth'],['emergency','Emergency']].map(([value,label]) => <Pressable key={value} onPress={() => setPurpose(value)} style={[styles.chip,purpose === value && styles.chipActive]}><Text style={[styles.chipText,purpose === value && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Amount requested (RWF)" placeholderTextColor="#96A2B5" />
      <Text style={styles.label}>Preferred term</Text><View style={styles.chips}>{['3','6','9','12','18','24','36'].map((value) => <Pressable key={value} onPress={() => setTerm(value)} style={[styles.chip,term === value && styles.chipActive]}><Text style={[styles.chipText,term === value && styles.chipTextActive]}>{value} months</Text></Pressable>)}</View>
      <TextInput style={[styles.input,styles.notes]} multiline value={notes} onChangeText={setNotes} placeholder="Optional context" placeholderTextColor="#96A2B5" />
      <Pressable style={[styles.button,submitting && { opacity:.6 }]} onPress={submit} disabled={submitting}>{submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit request  →</Text>}</Pressable>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Lender offers</Text><Text style={styles.count}>{offers.length}</Text></View>
    {offers.map(offer=><View key={offer.id} style={styles.offerCard}><View style={styles.offerTop}><Text style={styles.appTitle}>{applications.find(app=>app.id===offer.application_id)?.application_ref || 'Loan offer'}</Text><View style={styles.status}><Text style={styles.statusText}>{offer.status.replaceAll('_',' ')}</Text></View></View><View style={styles.offerGrid}><View><Text style={styles.offerLabel}>Principal</Text><Text style={styles.offerValue}>{currency(Number(offer.principal_amount))}</Text></View><View><Text style={styles.offerLabel}>Total repayment</Text><Text style={styles.offerValue}>{currency(Number(offer.total_repayment))}</Text></View><View><Text style={styles.offerLabel}>Fees</Text><Text style={styles.offerValue}>{currency(Number(offer.fees))}</Text></View><View><Text style={styles.offerLabel}>Term</Text><Text style={styles.offerValue}>{offer.term_months} months</Text></View></View><Text style={styles.offerMeta}>Interest: {offer.interest_rate} · {offer.interest_basis.replaceAll('_',' ')} · {offer.payment_frequency}</Text><Text style={styles.offerMeta}>Expiry: {offer.expires_at || 'Not recorded'}</Text>{offer.status==='offered'&&<View style={styles.offerButtons}><Pressable style={styles.acceptButton} onPress={()=>void respondToOffer(offer,'accepted')}><Text style={styles.acceptButtonText}>Accept offer</Text></Pressable><Pressable style={styles.declineButton} onPress={()=>void respondToOffer(offer,'declined')}><Text style={styles.declineButtonText}>Decline</Text></Pressable></View>}</View>)}
    {!offers.length&&<Text style={styles.emptyText}>No lender offers available yet.</Text>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Repayment schedule</Text><Text style={styles.count}>{installments.length}</Text></View>
    {installments.map(item=><View key={item.id} style={styles.installmentCard}><View style={{flex:1}}><Text style={styles.appTitle}>Installment {item.installment_number}</Text><Text style={styles.appMeta}>Due {item.due_date} · {applications.find(app=>app.id===item.loan_application_id)?.application_ref || 'Application'}</Text><Text style={styles.appMeta}>Paid: {currency(Number(item.amount_paid))}</Text></View><View><Text style={styles.offerValue}>{currency(Number(item.total_due))}</Text><Text style={styles.statusText}>{item.status.replaceAll('_',' ')}</Text></View></View>)}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your applications</Text><Text style={styles.count}>{applications.length}</Text></View>
    {loading ? <ActivityIndicator color="#2869DF" style={{ marginTop: 20 }} /> : applications.map((application) => <View key={application.id} style={styles.appCard}><View style={styles.appIcon}><Ionicons name="document-text-outline" size={20} color="#2869DF" /></View><View style={{ flex: 1 }}><Text style={styles.appTitle}>{application.purpose.replaceAll('_',' ')}</Text><Text style={styles.appMeta}>{application.application_ref} · {application.term_months} months</Text><Text style={styles.appAmount}>{currency(Number(application.requested_amount))}</Text></View><View style={styles.status}><Text style={styles.statusText}>{application.status.replaceAll('_',' ')}</Text></View></View>)}
    {!loading && applications.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>No applications yet</Text><Text style={styles.emptyText}>A submitted request will appear here when Supabase is connected.</Text></View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' }, content: { padding: 18, paddingBottom: 35 },
  hero: { padding: 20, borderRadius: 18, backgroundColor: '#1B437D', marginTop: 14, marginBottom: 15 },
  heroIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#FFFFFF18', marginBottom: 16 },
  kicker: { color: '#C6D9FA', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 9 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 29, letterSpacing: -.5, marginBottom: 10 },
  subtitle: { color: '#D4E2F8', fontSize: 11, lineHeight: 17 },
  notice: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 12, borderRadius: 10, backgroundColor: '#EDF4FF', marginBottom: 17 },
  noticeText: { flex: 1, color: '#6D83A6', fontSize: 10, lineHeight: 15 },
  formCard: { padding: 15, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E6ECF5', marginBottom: 24 },
  formTitle: { color: '#273A57', fontSize: 14, fontWeight: '800', marginBottom: 13 },
  offerCard: { padding: 13, borderRadius: 13, borderWidth: 1, borderColor: '#E2EAF6', backgroundColor: '#fff', marginBottom: 9 },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 11 },
  offerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 9 },
  offerLabel: { color: '#8B98AC', fontSize: 9, marginBottom: 3 }, offerValue: { color: '#2F4260', fontSize: 10, fontWeight: '800' },
  offerMeta: { color: '#8592A7', fontSize: 9, lineHeight: 14, marginTop: 4 },
  offerButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acceptButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9, backgroundColor: '#2869DF' },
  acceptButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  declineButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: '#F0D8DD', backgroundColor: '#FFF5F6' },
  declineButtonText: { color: '#B54E60', fontSize: 10, fontWeight: '800' },
  installmentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E7EDF5', backgroundColor: '#fff', marginBottom: 8 },
  formHint: { color: '#8996AB', fontSize: 10, lineHeight: 15, marginBottom: 12 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: '#E8EDF5', backgroundColor: '#FBFCFF', marginBottom: 8 },
  productActive: { borderColor: '#AAC5F2', backgroundColor: '#F0F5FF' },
  label: { color: '#65758F', fontSize: 10, fontWeight: '800', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  chip: { borderWidth: 1, borderColor: '#E0E8F4', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#A9C6F5', backgroundColor: '#EAF1FF' },
  chipText: { color: '#7A879B', fontSize: 9, fontWeight: '700' },
  chipTextActive: { color: '#2869DF' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#DFE7F2', borderRadius: 10, paddingHorizontal: 12, color: '#283A56', backgroundColor: '#FBFCFE', fontSize: 11, marginBottom: 11 },
  notes: { minHeight: 70, paddingTop: 11, textAlignVertical: 'top' },
  button: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2869DF', marginTop: 2 },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#263954', fontSize: 16, fontWeight: '800' },
  count: { color: '#2869DF', backgroundColor: '#E6EEFF', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800' },
  appCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7EDF5', borderRadius: 13, padding: 12, marginBottom: 9 },
  appIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  appTitle: { color: '#344560', fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'capitalize' },
  appMeta: { color: '#8996A9', fontSize: 9, marginBottom: 4 },
  appAmount: { color: '#3F6EBA', fontSize: 10, fontWeight: '800' },
  status: { maxWidth: 95, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 7, backgroundColor: '#FFF4DF' },
  statusText: { color: '#A27322', fontSize: 8, fontWeight: '800', textTransform: 'capitalize' },
  empty: { alignItems: 'center', padding: 22, backgroundColor: '#FCFDFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCE5F4', borderRadius: 13 },
  emptyTitle: { color: '#354861', fontWeight: '800', fontSize: 12 }, emptyText: { color: '#8996AB', fontSize: 10, textAlign: 'center', marginTop: 5, lineHeight: 15 },
});
