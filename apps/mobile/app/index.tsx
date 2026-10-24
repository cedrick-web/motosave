import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Bike, ShieldCheck } from '@expo/vector-icons';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live && data.session) router.replace('/(tabs)');
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/(tabs)');
    });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  async function submit() {
    if (!isSupabaseConfigured) {
      Alert.alert('Connect Supabase', 'Add apps/mobile/.env using apps/mobile/.env.example, then configure your project URL and publishable key.');
      return;
    }
    if (!email.trim() || password.length < 8) {
      Alert.alert('Check your details', 'Enter a valid email address and a password with at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
        if (error) throw error;
        if (!data.session) Alert.alert('Check your email', 'Your account was created. Confirm your email before signing in.');
        else router.replace('/(tabs)');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert('Could not sign in', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}><View style={styles.brandMark}><Bike size={23} color="#fff" /></View><Text style={styles.brand}>MotoSave</Text><View style={styles.beta}><Text style={styles.betaText}>RW</Text></View></View>
        <View style={styles.hero}>
          <View style={styles.eyebrowRow}><ShieldCheck size={15} color="#B7D1FF" /><Text style={styles.eyebrow}>FINANCIAL CONFIDENCE FOR EVERY RIDE</Text></View>
          <Text style={styles.title}>Your hard work deserves a stronger future.</Text>
          <Text style={styles.subtitle}>Save toward what matters, track financing requests, and keep motorcycle records organized.</Text>
          <View style={styles.pill}><View style={styles.pillDot} /><Text style={styles.pillText}>One clear place for your next step</Text></View>
        </View>
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={styles.formSubtitle}>{mode === 'signin' ? 'Sign in to continue with MotoSave.' : 'Create an account to get started.'}</Text>
          {mode === 'signup' && <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#94A1B5" value={name} onChangeText={setName} autoCapitalize="words" />}
          <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#94A1B5" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <TextInput style={styles.input} placeholder="Password (at least 8 characters)" placeholderTextColor="#94A1B5" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, loading && styles.disabled]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'signin' ? 'Sign in' : 'Create account'}  →</Text>}
          </Pressable>
          <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={styles.switchLine}>
            <Text style={styles.switchText}>{mode === 'signin' ? 'New to MotoSave? ' : 'Already have an account? '}<Text style={styles.switchLink}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</Text></Text>
          </Pressable>
          {!isSupabaseConfigured && <View style={styles.configNotice}><Text style={styles.configNoticeText}>Setup required: this mobile app is not connected to a Supabase project yet. No account data is stored until configured.</Text></View>}
        </View>
        <Text style={styles.footer}>Never share your payment PIN, banking password, or verification code.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F8FC' },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#2869DF', alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#182A49', fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  beta: { marginLeft: 'auto', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#E6EEFF' },
  betaText: { color: '#2869DF', fontSize: 10, fontWeight: '800' },
  hero: { borderRadius: 22, padding: 22, marginBottom: 20, backgroundColor: '#173B72' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 },
  eyebrow: { color: '#C9DAF7', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -1.1, lineHeight: 37, marginBottom: 12 },
  subtitle: { color: '#D3E1F7', fontSize: 13, lineHeight: 20 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 19, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#FFFFFF15' },
  pillDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: '#7EE1C1' },
  pillText: { color: '#ECF3FF', fontSize: 10, fontWeight: '700' },
  formCard: { padding: 20, backgroundColor: '#FFFFFF', borderRadius: 19, borderWidth: 1, borderColor: '#E6ECF5' },
  formTitle: { color: '#1F304E', fontSize: 22, fontWeight: '800', letterSpacing: -.5 },
  formSubtitle: { color: '#8794A8', fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 19 },
  input: { height: 49, borderWidth: 1, borderColor: '#DFE7F2', borderRadius: 11, backgroundColor: '#FBFCFE', paddingHorizontal: 13, marginBottom: 11, color: '#233753', fontSize: 12 },
  primaryButton: { height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#2869DF', marginTop: 5 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: .83, transform: [{ scale: .99 }] },
  disabled: { opacity: .6 },
  switchLine: { alignItems: 'center', paddingTop: 17, paddingBottom: 4 },
  switchText: { color: '#7C899F', fontSize: 11 },
  switchLink: { color: '#2869DF', fontWeight: '800' },
  configNotice: { padding: 10, borderRadius: 9, backgroundColor: '#FFF5E1', marginTop: 15 },
  configNoticeText: { color: '#97691B', fontSize: 10, lineHeight: 15 },
  footer: { textAlign: 'center', color: '#9BA7B9', fontSize: 10, lineHeight: 16, marginTop: 19, paddingHorizontal: 10 },
});
