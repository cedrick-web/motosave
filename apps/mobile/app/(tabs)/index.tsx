import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type Profile = { full_name: string | null; role: string; preferred_language: string };
type Goal = { id: string; title: string; target_amount: number; purpose: string };
type Motorcycle = { id: string; registration_number: string; make: string; model: string };

const currency = (value: number) => new Intl.NumberFormat('en-RW', { style: 'currency', currency: 'RWF', maximumFractionDigits: 0 }).format(value || 0);

export default function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bikes, setBikes] = useState<Motorcycle[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setError('Connect this app to your Supabase project before using saved records.'); setLoading(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.replace('/'); return; }
    const [profileResult, goalsResult, bikesResult, loansResult] = await Promise.all([
      supabase.from('profiles').select('full_name,role,preferred_language').eq('id', auth.user.id).maybeSingle(),
      supabase.from('savings_goals').select('id,title,target_amount,purpose').eq('status', 'active').order('created_at', { ascending: false }).limit(4),
      supabase.from('motorcycles').select('id,registration_number,make,model').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('loan_applications').select('id,status').not('status', 'in', '(completed,rejected_by_lender,cancelled,withdrawn)'),
    ]);
    if (profileResult.data) setProfile(profileResult.data as Profile);
    if (goalsResult.data) setGoals(goalsResult.data as Goal[]);
    if (bikesResult.data) setBikes(bikesResult.data as Motorcycle[]);
    if (loansResult.data) setPendingCount(loansResult.data.length);
    const failures = [profileResult.error, goalsResult.error, bikesResult.error, loansResult.error].filter(Boolean);
    setError(failures.length ? 'Some records could not be loaded. Check the migration and your account permissions.' : '');
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const firstName = profile?.full_name?.trim().split(' ')[0] || 'Rider';

  async function signOut() { await supabase.auth.signOut(); router.replace('/'); }

  if (loading) return <View style={styles.center}><ActivityIndicator color="#2869DF" /><Text style={styles.muted}>Loading your workspace…</Text></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#2869DF" />}>
      <View style={styles.header}><View><Text style={styles.kicker}>MOTOSAVE WORKSPACE</Text><Text style={styles.greeting}>Good day, {firstName}</Text><Text style={styles.subtitle}>Your financial goals, at a glance.</Text></View><Pressable style={styles.avatar} onPress={signOut} accessibilityLabel="Sign out"><Ionicons name="person-outline" size={20} color="#2869DF" /></Pressable></View>
      {error ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color="#A06C17" /><Text style={styles.noticeText}>{error}</Text></View> : null}
      <View style={styles.hero}><View style={styles.heroTop}><View style={styles.heroIcon}><Ionicons name="sparkles-outline" size={21} color="#E7F0FF" /></View><Text style={styles.heroLabel}>YOUR NEXT STEP</Text></View><Text style={styles.heroTitle}>Build a stronger financial buffer.</Text><Text style={styles.heroSubtitle}>Set a target you can repeat, and adjust it as your work changes.</Text><Pressable style={styles.heroButton} onPress={() => router.push('/(tabs)/savings')}><Text style={styles.heroButtonText}>Explore savings</Text><Ionicons name="arrow-forward" size={16} color="#245FC7" /></Pressable></View>
      <View style={styles.metrics}><Metric icon="wallet-outline" label="Active goals" value={String(goals.length)} tone="blue" /><Metric icon="bicycle-outline" label="Motorcycles" value={String(bikes.length)} tone="mint" /><Metric icon="document-text-outline" label="Open financing" value={String(pendingCount)} tone="violet" /></View>
      <View style={styles.shortcutRow}>
        <Pressable style={styles.shortcutCard} onPress={() => router.push('/(tabs)/profile')}><View style={styles.shortcutIcon}><Ionicons name="person-outline" size={19} color="#2869DF" /></View><View style={{flex:1}}><Text style={styles.shortcutTitle}>Profile & alerts</Text><Text style={styles.shortcutText}>Manage details and notifications</Text></View><Ionicons name="chevron-forward" size={16} color="#8C9AB0" /></Pressable>
        <Pressable style={styles.shortcutCard} onPress={() => router.push('/(tabs)/support')}><View style={[styles.shortcutIcon,{backgroundColor:'#E2F7F1'}]}><Ionicons name="help-buoy-outline" size={19} color="#209B84" /></View><View style={{flex:1}}><Text style={styles.shortcutTitle}>Help & support</Text><Text style={styles.shortcutText}>Create and track a ticket</Text></View><Ionicons name="chevron-forward" size={16} color="#8C9AB0" /></Pressable>
      </View>
      <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Savings goals</Text><Text style={styles.sectionSubtitle}>The targets you are working toward.</Text></View><Pressable onPress={() => router.push('/(tabs)/savings')}><Text style={styles.link}>View all</Text></Pressable></View>
      {goals.length ? goals.map((goal) => <View key={goal.id} style={styles.goalCard}><View style={styles.goalIcon}><Ionicons name="flag-outline" size={19} color="#2869DF" /></View><View style={styles.goalDetails}><Text style={styles.goalTitle}>{goal.title}</Text><Text style={styles.goalCaption}>{goal.purpose.replaceAll('_', ' ')}</Text><Text style={styles.goalTarget}>{currency(Number(goal.target_amount))} target</Text></View><Ionicons name="chevron-forward" size={18} color="#9BA8BB" /></View>) : <View style={styles.empty}><Ionicons name="flag-outline" size={25} color="#7798D3" /><Text style={styles.emptyTitle}>No goals yet</Text><Text style={styles.emptyText}>Start with one practical savings target.</Text><Pressable style={styles.emptyButton} onPress={() => router.push('/(tabs)/savings')}><Text style={styles.emptyButtonText}>Create a goal</Text></Pressable></View>}
      <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Motorcycles</Text><Text style={styles.sectionSubtitle}>Your linked work assets.</Text></View><Pressable onPress={() => router.push('/(tabs)/insurance')}><Text style={styles.link}>Insurance</Text></Pressable></View>
      {bikes.slice(0, 2).map((bike) => <View key={bike.id} style={styles.bikeCard}><View style={styles.bikeIcon}><Ionicons name="bicycle-outline" size={23} color="#2869DF" /></View><View style={{ flex: 1 }}><Text style={styles.goalTitle}>{bike.make} {bike.model}</Text><Text style={styles.goalCaption}>{bike.registration_number}</Text></View><Ionicons name="checkmark-circle-outline" size={19} color="#24A486" /></View>)}
      <Text style={styles.footnote}>Planning records are not bank balances. Loan approval, payment confirmation, and insurance coverage must come from the responsible provider.</Text>
    </ScrollView>
  );
}

function Metric({ icon, label, value, tone }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; tone: string }) {
  return <View style={styles.metricCard}><View style={[styles.metricIcon, tone === 'mint' ? styles.mint : tone === 'violet' ? styles.violet : styles.blue]}><Ionicons name={icon} size={18} color={tone === 'mint' ? '#1A9B83' : tone === 'violet' ? '#8A69D6' : '#2869DF'} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' },
  content: { padding: 19, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F6F8FC' },
  muted: { color: '#8391A8', fontSize: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 20 },
  kicker: { color: '#7486A3', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  greeting: { color: '#1D304F', fontSize: 27, fontWeight: '800', letterSpacing: -.7 },
  subtitle: { color: '#8492A8', fontSize: 12, marginTop: 6 },
  avatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center' },
  hero: { padding: 20, borderRadius: 19, backgroundColor: '#1B437D', marginBottom: 15 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  heroIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFFFFF1C', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { color: '#C8DBFA', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', letterSpacing: -.7, lineHeight: 30, marginBottom: 10 },
  heroSubtitle: { color: '#D2E1F8', fontSize: 12, lineHeight: 18, marginBottom: 17 },
  heroButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 37, borderRadius: 9, backgroundColor: '#FFFFFF' },
  heroButtonText: { color: '#245FC7', fontSize: 11, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 9, marginBottom: 25 },
  metricCard: { flex: 1, minWidth: 0, padding: 12, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EDF5' },
  metricIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  blue: { backgroundColor: '#EAF1FF' }, mint: { backgroundColor: '#E3F7F1' }, violet: { backgroundColor: '#F0EAFF' },
  metricValue: { color: '#243652', fontSize: 21, fontWeight: '800' },
  metricLabel: { color: '#8492A7', fontSize: 9, lineHeight: 13, marginTop: 4 },
  shortcutRow: { gap: 9, marginBottom: 24 },
  shortcutCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EDF5', borderRadius: 13, marginBottom: 8 },
  shortcutIcon: { width: 37, height: 37, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  shortcutTitle: { color: '#344560', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  shortcutText: { color: '#8A97AC', fontSize: 9 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 2 },
  sectionTitle: { color: '#243651', fontSize: 16, fontWeight: '800', letterSpacing: -.3 },
  sectionSubtitle: { color: '#8A96A9', fontSize: 10, marginTop: 4 },
  link: { color: '#2869DF', fontSize: 11, fontWeight: '800' },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: '#E8EDF5', backgroundColor: '#FFFFFF', marginBottom: 9 },
  goalIcon: { width: 41, height: 41, borderRadius: 12, backgroundColor: '#EAF1FF', alignItems: 'center', justifyContent: 'center' },
  goalDetails: { flex: 1 },
  goalTitle: { color: '#344560', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  goalCaption: { color: '#8B98AD', fontSize: 10, marginBottom: 4, textTransform: 'capitalize' },
  goalTarget: { color: '#4B6FAD', fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 24, borderRadius: 14, borderWidth: 1, borderColor: '#E1E9F7', borderStyle: 'dashed', backgroundColor: '#FCFDFF', marginBottom: 23 },
  emptyTitle: { color: '#344862', fontSize: 13, fontWeight: '800', marginTop: 9 },
  emptyText: { color: '#8A96AA', fontSize: 10, marginTop: 5, textAlign: 'center' },
  emptyButton: { marginTop: 13, borderRadius: 9, backgroundColor: '#2869DF', paddingVertical: 10, paddingHorizontal: 14 },
  emptyButtonText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bikeCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 13, borderWidth: 1, borderColor: '#E8EDF5', backgroundColor: '#FFFFFF', marginBottom: 9 },
  bikeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  footnote: { color: '#9AA5B6', fontSize: 9, lineHeight: 15, marginTop: 17 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 10, backgroundColor: '#FFF5E2', marginBottom: 14 },
  noticeText: { flex: 1, color: '#95671D', fontSize: 10, lineHeight: 15 },
});
