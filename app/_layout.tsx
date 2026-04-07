import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { StatusBar } from 'expo-status-bar';
import { useThemeStore } from '../src/stores/themeStore';
import { useAuthStore } from '../src/stores/authStore';
import { startNetworkListener, stopNetworkListener, fullSync } from '../src/sync/syncEngine';

function RootLayoutInner() {
  const mode = useThemeStore((s) => s.mode);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  // Start sync engine when logged in
  useEffect(() => {
    // Restore session on app launch
    useAuthStore.getState().restoreSession();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      startNetworkListener();
      fullSync().catch(console.warn);
      return () => stopNetworkListener();
    }
  }, [isLoggedIn]);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-bill" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="category-manage" options={{ presentation: 'card' }} />
        <Stack.Screen name="ledger-manage" options={{ presentation: 'card' }} />
        <Stack.Screen name="data-manage" options={{ presentation: 'card' }} />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="user-approval" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
