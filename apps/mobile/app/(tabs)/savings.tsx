import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Goal = { id: string; title: string; purpose: string; target_amount: number; target_date: string | null; contribution_frequency: string; status: string };
type Transaction = { id: string; goal_id: string | null; amount: number; note: string | null; source: string; verification_status: string; created_at: string };
const currency = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value || 0);

export default function SavingsScreen() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('emergency');
  const [frequency, setFrequency] = useState('weekly');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contributionGoalId, setContributionGoalId] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionNote, setContributionNote] = useState('');
  const [contributionSaving, setContributionSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [goalResult, transactionResult] = await Promise.all([
      supabase.from('savings_goals').select('*').order('created_at', { ascending: false }),
      supabase.from('savings_transactions').select('id,goal_id,amount,note,source,verification_status,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (goalResult.error) Alert.alert('Could not load goals', goalResult.error.message);
    if (transactionResult.error) Alert.alert('Could not load contributions', transactionResult.error.message);
    setGoals((goalResult.data || []) as Goal[]);
    setTransactions((transactionResult.data || []) as Transaction[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createGoal() {
    const target = Number(amount);
    if (!title.trim() || !Number.isFinite(target) || target <= 0) { Alert.alert('Check your goal', 'Enter a goal name and a target amount greater than zero.'); return; }
    if (!isSupabaseConfigured) { Alert.alert('Connect Supabase', 'Add your Supabase project URL and publishable key before saving goals.'); return; }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('savings_goals').insert({ user_id: auth.user.id, title: title.trim(), purpose, target_amount: target, contribution_frequency: frequency });
      if (error) throw error;
      setTitle(''); setAmount('');
      await load();
      Alert.alert('Goal created', 'Your savings target is ready. Contributions remain planning records unless confirmed by a provider.');
    } catch (error) { Alert.alert('Could not create goal', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  }


  async function submitContribution() {
    const numericAmount = Number(contributionAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check the amount', 'Enter a contribution greater than zero.');
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert('Connect Supabase', 'Configure the shared Supabase project before saving contribution records.');
      return;
    }
    setContributionSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { error } = await supabase.from('savings_transactions').insert({
        user_id: auth.user.id,
        goal_id: contributionGoalId || null,
        amount: numericAmount,
        note: contributionNote.trim() || null,
      });
      if (error) throw error;
      setContributionAmount(''); setContributionNote('');
      await load();
      Alert.alert('Contribution recorded', 'This is a manual planning entry and remains unverified until a trusted provider confirms a real transaction.');
    } catch (error) {
      Alert.alert('Could not record contribution', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setContributionSaving(false);
    }
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>SAVE WITH A PLAN</Text><Text style={styles.title}>Savings goals</Text><Text style={styles.subtitle}>Set a target you can keep returning to. Tracked contributions are not a bank balance.</Text>
    <View style={styles.formCard}><Text style={styles.formTitle}>Create a new goal</Text><TextInput value={title} onChangeText={setTitle} placeholder="Goal name" placeholderTextColor="#95A2B6" style={styles.input} maxLength={120} /><TextInput value={amount} onChangeText={setAmount} placeholder="Target amount in RWF" keyboardType="numeric" placeholderTextColor="#95A2B6" style={styles.input} />
      <Text style={styles.label}>Purpose</Text><View style={styles.chips}>{[['emergency','Emergency'],['maintenance','Repairs'],['ownership','Ownership'],['insurance','Insurance']].map(([value,label]) => <Pressable key={value} onPress={() => setPurpose(value)} style={[styles.chip,purpose === value && styles.chipActive]}><Text style={[styles.chipText,purpose === value && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <Text style={styles.label}>Contribution plan</Text><View style={styles.chips}>{['flexible','daily','weekly','monthly'].map((value) => <Pressable key={value} onPress={() => setFrequency(value)} style={[styles.chip,frequency === value && styles.chipActive]}><Text style={[styles.chipText,frequency === value && styles.chipTextActive]}>{value.charAt(0).toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
      <Pressable onPress={createGoal} disabled={saving} style={[styles.button,saving && { opacity: .6 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create savings goal  →</Text>}</Pressable>
    </View>
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Record a contribution</Text>
      <Text style={styles.formHint}>Manual planning entry only. This does not deposit money or change a bank balance.</Text>
      <View style={styles.chips}>
        <Pressable onPress={() => setContributionGoalId('')} style={[styles.chip, !contributionGoalId && styles.chipActive]}><Text style={[styles.chipText, !contributionGoalId && styles.chipTextActive]}>General</Text></Pressable>
        {goals.map((goal) => <Pressable key={goal.id} onPress={() => setContributionGoalId(goal.id)} style={[styles.chip, contributionGoalId === goal.id && styles.chipActive]}><Text style={[styles.chipText, contributionGoalId === goal.id && styles.chipTextActive]}>{goal.title}</Text></Pressable>)}
      </View>
      <TextInput value={contributionAmount} onChangeText={setContributionAmount} keyboardType="numeric" placeholder="Contribution amount (RWF)" placeholderTextColor="#95A2B6" style={styles.input} />
      <TextInput value={contributionNote} onChangeText={setContributionNote} placeholder="Optional note" placeholderTextColor="#95A2B6" style={styles.input} maxLength={240} />
      <Pressable onPress={submitContribution} disabled={contributionSaving} style={[styles.button, contributionSaving && { opacity: .6 }]}>{contributionSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record manual entry  →</Text>}</Pressable>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your goals</Text><Text style={styles.count}>{goals.length}</Text></View>
    {loading ? <ActivityIndicator color="#2869DF" style={{ marginTop: 25 }} /> : goals.map((goal) => <View key={goal.id} style={styles.goalCard}><View style={styles.goalIcon}><Ionicons name="flag-outline" size={20} color="#2869DF" /></View><View style={{ flex: 1 }}><Text style={styles.goalTitle}>{goal.title}</Text><Text style={styles.goalMeta}>{goal.purpose.replaceAll('_',' ')} · {goal.contribution_frequency}</Text><Text style={styles.goalAmount}>{currency(Number(goal.target_amount))} target</Text></View><View style={styles.status}><Text style={styles.statusText}>{goal.status}</Text></View></View>)}
    {!loading && goals.length === 0 && <View style={styles.empty}><Ionicons name="wallet-outline" size={25} color="#6D91D0" /><Text style={styles.emptyTitle}>No saved goals yet</Text><Text style={styles.emptyText}>Create a goal above. Only your account can access it.</Text></View>}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Contribution history</Text><Text style={styles.count}>{transactions.length}</Text></View>
    {transactions.map((transaction) => <View key={transaction.id} style={styles.historyCard}><View style={styles.goalIcon}><Ionicons name="arrow-down-outline" size={18} color="#2869DF" /></View><View style={{ flex: 1 }}><Text style={styles.goalTitle}>{transaction.note || 'Savings contribution'}</Text><Text style={styles.goalMeta}>{transaction.source || 'manual'} · {transaction.verification_status || 'unverified'}</Text><Text style={styles.goalAmount}>{currency(Number(transaction.amount))}</Text></View></View>)}
    {!transactions.length && <Text style={styles.footerNote}>No contribution entries yet.</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' }, content: { padding: 18, paddingBottom: 35 },
  kicker: { marginTop: 14, marginBottom: 7, color: '#7486A3', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#1D304F', fontSize: 28, fontWeight: '800', letterSpacing: -.7 },
  subtitle: { color: '#8391A7', fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 19 },
  formCard: { borderRadius: 17, borderWidth: 1, borderColor: '#E6ECF5', backgroundColor: '#FFF', padding: 16, marginBottom: 25 },
  formTitle: { color: '#273A57', fontSize: 14, fontWeight: '800', marginBottom: 13 },
  input: { height: 45, borderWidth: 1, borderColor: '#DFE7F2', borderRadius: 10, backgroundColor: '#FBFCFE', paddingHorizontal: 12, color: '#273A57', fontSize: 11, marginBottom: 11 },
  label: { color: '#65758F', fontSize: 10, fontWeight: '800', marginTop: 4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E9F4', backgroundColor: '#fff' },
  chipActive: { borderColor: '#A9C5F5', backgroundColor: '#EAF1FF' },
  chipText: { color: '#75849A', fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
  chipTextActive: { color: '#2869DF' },
  button: { minHeight: 45, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: '#2869DF', marginTop: 6 },
  buttonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#263954', fontSize: 16, fontWeight: '800' },
  count: { color: '#2869DF', backgroundColor: '#E6EEFF', overflow: 'hidden', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800' },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff', borderColor: '#E7EDF5', borderWidth: 1, marginBottom: 8 },
  footerNote: { color: '#9AA5B6', fontSize: 9, lineHeight: 15, marginTop: 10 },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: '#fff', borderColor: '#E7EDF5', borderWidth: 1, marginBottom: 9 },
  goalIcon: { width: 41, height: 41, borderRadius: 12, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  goalTitle: { color: '#344560', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  goalMeta: { color: '#8A97AC', fontSize: 9, textTransform: 'capitalize', marginBottom: 5 },
  goalAmount: { color: '#4670B4', fontSize: 10, fontWeight: '700' },
  status: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6, backgroundColor: '#EAF7F2' },
  statusText: { color: '#24866E', fontSize: 8, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 25, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, borderColor: '#DCE5F4', backgroundColor: '#FCFDFF' },
  emptyTitle: { color: '#354861', fontWeight: '800', fontSize: 13, marginTop: 9 }, emptyText: { color: '#8A97AB', fontSize: 10, textAlign: 'center', marginTop: 5, lineHeight: 15 },
});
