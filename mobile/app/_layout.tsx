import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect } from 'react';
import 'react-native-reanimated';

import { migrateDatabase } from '@core/database';
import { AppThemeProvider, useAppTheme } from '@core/theme';
import { AppNoticeProvider } from '@core/ui/AppNotice';
import '@core/notifications';
import { syncFocusSchedules } from '@core/focus-mode';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <SQLiteProvider databaseName="gestion-personal-demo-v2.db" onInit={migrateDatabase} useSuspense>
      <Suspense fallback={null}>
        <AppThemeProvider>
          <AppNoticeProvider>
            <FocusScheduleSync />
            <ThemedNavigation />
          </AppNoticeProvider>
        </AppThemeProvider>
      </Suspense>
    </SQLiteProvider>
  );
}

function FocusScheduleSync() {
  const db = useSQLiteContext();
  useEffect(() => {
    void syncFocusSchedules(db);
  }, [db]);
  return null;
}

function ThemedNavigation() {
  const { isDark } = useAppTheme();
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0F172A' },
          headerTintColor: '#F8FAFC',
          headerTitleStyle: { color: '#F8FAFC', fontWeight: '800' },
          contentStyle: { backgroundColor: '#0F172A' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="new-activity"
          options={{ title: 'Nueva actividad', presentation: 'modal' }}
        />
        <Stack.Screen name="study" options={{ headerShown: false }} />
        <Stack.Screen name="activity/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="recoveries" options={{ title: 'Por recuperar' }} />
        <Stack.Screen
          name="edit-activity/[blockId]"
          options={{ title: 'Editar actividad' }}
        />
        <Stack.Screen name="trash" options={{ title: 'Papelera' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
