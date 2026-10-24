import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F6F8FC" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F8FC' } }} />
    </SafeAreaProvider>
  );
}
