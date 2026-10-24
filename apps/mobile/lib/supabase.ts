import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT_REF') && !key.includes('REPLACE_ME'));

const CHUNK_SIZE = 1800;
type Meta = { parts: number };
const secureSessionStorage = {
  async getItem(storageKey: string) {
    const raw = await SecureStore.getItemAsync(storageKey + ':meta');
    if (!raw) return null;
    try {
      const meta = JSON.parse(raw) as Meta;
      const chunks = await Promise.all(Array.from({ length: meta.parts }, (_, index) => SecureStore.getItemAsync(storageKey + ':part:' + index)));
      if (chunks.some((part) => part === null)) return null;
      return chunks.join('');
    } catch {
      return null;
    }
  },
  async setItem(storageKey: string, value: string) {
    const oldRaw = await SecureStore.getItemAsync(storageKey + ':meta');
    let oldParts = 0;
    try { oldParts = oldRaw ? (JSON.parse(oldRaw) as Meta).parts : 0; } catch { oldParts = 0; }
    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK_SIZE) chunks.push(value.slice(index, index + CHUNK_SIZE));
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(storageKey + ':part:' + index, chunk)));
    await SecureStore.setItemAsync(storageKey + ':meta', JSON.stringify({ parts: chunks.length }));
    await Promise.all(Array.from({ length: Math.max(0, oldParts - chunks.length) }, (_, index) => SecureStore.deleteItemAsync(storageKey + ':part:' + (chunks.length + index))));
  },
  async removeItem(storageKey: string) {
    const raw = await SecureStore.getItemAsync(storageKey + ':meta');
    let parts = 0;
    try { parts = raw ? (JSON.parse(raw) as Meta).parts : 0; } catch { parts = 0; }
    await Promise.all([
      SecureStore.deleteItemAsync(storageKey + ':meta'),
      ...Array.from({ length: parts }, (_, index) => SecureStore.deleteItemAsync(storageKey + ':part:' + index)),
    ]);
  },
};

export const supabase = createClient(
  url || 'https://motosave-unconfigured.supabase.co',
  key || 'missing-publishable-key',
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-application-name': 'motosave-mobile' } },
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
