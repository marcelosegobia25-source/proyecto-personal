import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppTheme } from '@core/theme';
import type { LinkableActivity } from '@modules/activities';
import {
  getActivityExtraSummaryUseCase,
  getOpenStudySessionUseCase,
  getScheduledClassMinutesUseCase,
  interruptStudySessionUseCase,
  listStudyLinkableActivitiesUseCase,
  stopStudySessionUseCase,
  type OpenStudySession,
} from '@modules/study';

const duration = (m: number) => {
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours > 0 && mins > 0) return `${hours} h ${mins} min`;
  if (hours > 0) return `${hours} h`;
  return `${mins} min`;
};

const formatSeconds = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function Study() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useAppTheme();

  const [activities, setActivities] = useState<LinkableActivity[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<Record<string, number>>({});
  const [active, setActive] = useState<OpenStudySession | null>(null);
  const [clock, setClock] = useState(Date.now());

  const load = useCallback(async () => {
    const rows = await listStudyLinkableActivitiesUseCase(db);
    setActivities(rows);
    const activeSession = await getOpenStudySessionUseCase(db);
    setActive(activeSession);
    const [extraSums, classSums] = await Promise.all([
      Promise.all(
        rows.map(async (x) => [
          x.id,
          (await getActivityExtraSummaryUseCase(db, x.id)).reduce((sum, row) => sum + row.minutes, 0),
        ])
      ),
      Promise.all(rows.map(async (x) => [x.id, await getScheduledClassMinutesUseCase(db, x.id)])),
    ]);
    setTotals(Object.fromEntries(extraSums));
    setClasses(Object.fromEntries(classSums));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const runningSeconds = active
    ? Math.max(0, Math.floor((clock - new Date(active.started_at).getTime()) / 1000))
    : 0;

  const colors = {
    text: isDark ? '#FFFFFF' : '#101828',
    muted: isDark ? '#94A3B8' : '#475467',
    surface: isDark ? '#172033' : '#FFFFFF',
    border: isDark ? '#334155' : '#D0D5DD',
    soft: isDark ? '#1E293B' : '#F1F5F9',
    accent: isDark ? '#93C5FD' : '#1D4ED8',
  };
  const card = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Horas de dedicación"
        title="Cronómetro de estudio"
        subtitle="Asigna horas de estudio por tema con cronómetro, interrupciones y seguimiento."
      />

      {/* Banner / Card de sesión activa en vivo */}
      {active ? (
        <Card style={s.activeCard}>
          <View style={s.activeHeader}>
            <View style={s.activePulseDot} />
            <Text style={s.activeBadgeText}>CRONÓMETRO EN MARCHA</Text>
          </View>

          <Text style={s.activeSubject}>{active.subject_name}</Text>
          <Text style={s.activeTopic}>
            Tema: {active.topic || 'Estudio general'}
          </Text>

          <View style={s.timerBox}>
            <Text style={s.timerDisplay}>{formatSeconds(runningSeconds)}</Text>
            {active.interruptions > 0 ? (
              <Text style={s.interruptionCount}>
                ⚠️ {active.interruptions} {active.interruptions === 1 ? 'interrupción registrada' : 'interrupciones registradas'}
              </Text>
            ) : null}
          </View>

          <View style={s.activeActionsRow}>
            <Pressable
              style={s.interruptBtn}
              onPress={async () => {
                await interruptStudySessionUseCase(db, active.id);
                await load();
              }}
            >
              <Text style={s.interruptBtnText}>⏸ Registrar interrupción</Text>
            </Pressable>

            <Pressable
              style={s.stopBtn}
              onPress={async () => {
                await stopStudySessionUseCase(db, active.id);
                await load();
              }}
            >
              <Text style={s.stopBtnText}>⏹ Finalizar y guardar</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <View style={s.listHeader}>
        <Text style={[s.listTitle, { color: colors.text }]}>Tus actividades y materias</Text>
        <Text style={[s.listCount, { color: colors.muted }]}>
          {activities.length} disponibles
        </Text>
      </View>

      {activities.length ? (
        activities.map((activity) => {
          const classMins = classes[activity.id] ?? 0;
          const studyMins = totals[activity.id] ?? 0;

          return (
            <Card key={activity.id} style={[card, s.activityCard]}>
              <View style={s.activityHeading}>
                <View style={s.activityMark} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>
                    {activity.title.trim() || 'Actividad sin nombre'}
                  </Text>
                </View>
              </View>

              <View style={[s.statsRow, { backgroundColor: colors.soft }]}>
                <View style={s.statBox}>
                  <Text style={[s.statLabel, { color: colors.muted }]}>Clases programadas</Text>
                  <Text style={[s.statValue, { color: colors.text }]}>
                    {duration(classMins)}
                  </Text>
                </View>

                <View style={[s.statBox, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
                  <Text style={[s.statLabel, { color: colors.muted }]}>Horas dedicadas</Text>
                  <Text style={[s.statValue, { color: '#60A5FA' }]}>
                    {duration(studyMins)}
                  </Text>
                </View>
              </View>

              <Pressable
                style={s.openButton}
                onPress={() =>
                  router.push({ pathname: '/activity/[id]', params: { id: activity.id } })
                }
              >
                <Text style={s.openButtonText}>⏱ Abrir cronómetro y horas por tema ›</Text>
              </Pressable>
            </Card>
          );
        })
      ) : (
        <Card style={card}>
          <Text style={[s.title, { color: colors.text }]}>Aún no tienes actividades o clases</Text>
          <Text style={[s.muted, { color: colors.muted, marginTop: 8 }]}>
            Crea una actividad o clase desde el botón inferior para comenzar a registrar tus horas de estudio dedicadas por tema.
          </Text>
          <Link href="/new-activity" asChild>
            <Pressable style={StyleSheet.flatten([s.openButton, { marginTop: 14 }])}>
              <Text style={s.openButtonText}>＋ Crear actividad / clase</Text>
            </Pressable>
          </Link>
        </Card>
      )}
    </AppScreen>
  );
}

const s = StyleSheet.create({
  activeCard: {
    backgroundColor: '#0F2342',
    borderColor: '#3B82F6',
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  activeBadgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeSubject: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  activeTopic: {
    color: '#BFDBFE',
    fontSize: 15,
  },
  timerBox: {
    backgroundColor: '#172554',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  timerDisplay: {
    color: '#60A5FA',
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  interruptionCount: {
    color: '#FCD34D',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  activeActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  interruptBtn: {
    flex: 1,
    backgroundColor: '#B45309',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  interruptBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  stopBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  stopBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 6,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  listCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  activityCard: {
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
  },
  activityHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityMark: {
    width: 5,
    height: 28,
    borderRadius: 3,
    backgroundColor: palette.primary,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    padding: 10,
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  openButton: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  openButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  muted: {
    lineHeight: 20,
  },
});
