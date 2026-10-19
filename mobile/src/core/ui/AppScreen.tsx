import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@core/theme';

export const palette = {
  ink: '#172033',
  muted: '#667085',
  background: '#F5F7FB',
  card: '#FFFFFF',
  primary: '#3157D5',
  primarySoft: '#E9EEFF',
  green: '#16845B',
  orange: '#F97316',
  border: '#E5E7EB',
};

// Primarios y secundarios contrastados para distinguir actividades rápidamente.
export const activityColors = [
  '#2563EB',
  '#DC2626',
  '#16A34A',
  '#F59E0B',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#EA580C',
  '#4F46E5',
  '#059669',
  '#BE123C',
  '#0F766E',
  '#9333EA',
  '#0369A1',
  '#65A30D',
  '#C2410C',
] as const;

export function AppScreen({
  children,
  compactTop = false,
}: PropsWithChildren<{ compactTop?: boolean }>) {
  const { isDark } = useAppTheme();
  return (
    <SafeAreaView
      style={[styles.safe, isDark && styles.safeDark]}
      edges={compactTop ? ['left', 'right'] : ['top', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={[styles.content, compactTop && { paddingTop: 4 }]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const { isDark } = useAppTheme();
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { isDark } = useAppTheme();
  return <View style={[styles.card, isDark && styles.cardDark, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  safeDark: { backgroundColor: '#0F172A' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 44, gap: 16 },
  header: { gap: 5, paddingBottom: 4 },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 21 },
  titleDark: { color: '#F8FAFC' },
  subtitleDark: { color: '#CBD5E1' },
  card: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
  },
  cardDark: { backgroundColor: '#172033', borderColor: '#334155' },
});
