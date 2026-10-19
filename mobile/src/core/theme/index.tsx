import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { ThemeMode } from '@modules/settings/domain/types';

export type { ThemeMode };

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  setMode: async () => {},
});

export function AppThemeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    void db
      .getFirstAsync<{ value: string }>(`SELECT value FROM app_preferences WHERE key='theme_mode'`)
      .then((x) => {
        if (x && ['system', 'light', 'dark'].includes(x.value)) {
          setModeState(x.value as ThemeMode);
        }
      });
  }, [db]);

  async function setMode(next: ThemeMode) {
    await db.runAsync(
      `INSERT INTO app_preferences(key,value) VALUES('theme_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      next
    );
    setModeState(next);
  }

  const value = useMemo(
    () => ({
      mode,
      isDark: mode === 'dark' || (mode === 'system' && system === 'dark'),
      setMode,
    }),
    [mode, system]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);
