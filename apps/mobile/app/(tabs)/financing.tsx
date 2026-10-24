import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Application = { id: string; application_ref: string; purpose: string; requested_amount: number; term_months: number; status: string; created_at: string };
const currency = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value || 0);

export default function FinancingScreen() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('6');
  const [purpose, setPurpose] = useState('motorcycle_maintenance');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data, error } = await supabase.from('loan_applications').select('id,application_ref,purpose,requested_amount,term_months,status,created_at').order('created_at', { ascending: false });
    if (error) Alert.alert('Could not load applications', error.message);
    setApplications((data || []) as Application[]); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit() {
    const numeric = Number(amount); const months = Number(term);
    if (!Number.isFinite(numeric) || numeric <= 0 || !Number.isInteger(months) || months < 1 || months > 120) { Alert.alert('Check the application', 'Enter an amount above zero and a term between 1 and 120 months.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Configure the Supabase project before submitting a request.'); return; }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('loan_applications').insert({ user_id: auth.user.id, purpose, requested_amount: numeric, term_months: months, notes: notes.trim() || null });
      if (error) throw error;
      setAmount(''); setNotes(''); await load();
      Alert.alert('Request submitted', 'This is an application, not an approval. The participating lender controls assessment and terms.');
    } catch (error) { Alert.alert('Could not submit', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="cash-outline" size={26} color="#E5EEFF" /></View><Text style={styles.kicker}>RESPONSIBLE FINANCING</Text><Text style={styles.title}>See the full commitment before you borrow.</Text><Text style={styles.subtitle}>Submit requests and track partner status. Only a lender can approve credit or issue an offer.</Text></View>
    <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={18} color="#2A6DCA" /><Text style={styles.noticeText}>Review the total repayment, fees, payment frequency, and conditions before accepting any offer.</Text></View>
    <View style={styles.formCard}><Text style={styles.formTitle}>New financing request</Text><Text style={styles.label}>Purpose</Text><View style={styles.chips}>{[['motorcycle_maintenance','Repairs'],['motorcycle_purchase','Bike purchase'],['electric_motorcycle','Electric bike'],['business_expansion','Business growth'],['emergency','Emergency']].map(([value,label]) => <Pressable key={value} onPress={() => setPurpose(value)} style={[styles.chip,purpose === value && styles.chipActive]}><Text style={[styles.chipText,purpose === value && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Amount requested (RWF)" placeholderTextColor="#96A2B5" />
      <Text style={styles.label}>Preferred term</Text><View style={styles.chips}>{['3','6','9','12','18','24','36'].map((value) => <Pressable key={value} onPress={() => setTerm(value)} style={[styles.chip,term === value && styles.chipActive]}><Text style={[styles.chipText,term === value && styles.chipTextActive]}>{value} months</Text></Pressable>)}</View>
      <TextInput style={[styles.input,styles.notes]} multiline value={notes} onChangeText={setNotes} placeholder="Optional context" placeholderTextColor="#96A2B5" />
      <Pressable style={[styles.button,submitting && { opacity:.6 }]} onPress={submit} disabled={submitting}>{submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit request  →</Text>}</Pressable>
    </View>
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
