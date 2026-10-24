import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const blue = '#2869DF';
const muted = '#8C9AB0';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: blue,
      tabBarInactiveTintColor: muted,
      tabBarStyle: { height: 65, paddingTop: 8, paddingBottom: 8, borderTopColor: '#E8EDF5', backgroundColor: '#FFFFFF' },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="savings" options={{ title: 'Savings', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="financing" options={{ title: 'Financing', tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="insurance" options={{ title: 'Insurance', tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
