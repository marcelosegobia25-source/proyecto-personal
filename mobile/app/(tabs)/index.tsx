import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppNotice } from '@core/ui/AppNotice';
import { useAppTheme } from '@core/theme';
import { syncFocusSchedules } from '@core/focus-mode';
import { resetAndSeedRequestedSchedule } from '@core/database/seed';

import {
  listTodayBlocksUseCase,
  listFlexibleActivitiesUseCase,
  startFlexibleActivityUseCase,
  startBlockSessionUseCase,
  stopBlockSessionUseCase,
  verifyBlockUseCase,
  type FlexibleActivity,
  type PlannedBlock,
} from '@modules/activities';

import {
  getOpenStudySessionUseCase,
  stopStudySessionUseCase,
  type OpenStudySession,
} from '@modules/study';

const formatTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const formatSeconds = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? `${h.toString().padStart(2, '0')}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const SUSPENSION_REASONS = [
  { id: 'docente', label: '👨‍🏫 Falta de docente', desc: 'El docente no asistió o avisó con retraso' },
  { id: 'personal', label: '🚶 No asistencia / Motivo personal', desc: 'Salud, trabajo, imprevisto personal' },
  { id: 'feriado', label: '🏛 Feriado / Suspensión de clases', desc: 'Tolerancia o día no lectivo institucional' },
  { id: 'transporte', label: '🛑 Bloqueo / Problema de transporte', desc: 'Imposibilidad de llegar a la universidad' },
  { id: 'temprano', label: '⏱ Concluyó antes de tiempo', desc: 'Se avanzó parte y se liberaron minutos' },
  { id: 'otro', label: '✏️ Otro motivo', desc: 'Escribe un motivo específico' },
] as const;

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { showNotice } = useAppNotice();

  const [blocks, setBlocks] = useState<PlannedBlock[]>([]);
  const [flexible, setFlexible] = useState<FlexibleActivity[]>([]);
  const [activeStudy, setActiveStudy] = useState<OpenStudySession | null>(null);
  const [clock, setClock] = useState(Date.now());

  // Estado para el modal de suspensión / omisión con motivo
  const [suspendingBlock, setSuspendingBlock] = useState<PlannedBlock | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('👨‍🏫 Falta de docente');
  const [customReason, setCustomReason] = useState<string>('');
  const [shortenedMinutes, setShortenedMinutes] = useState<number>(30);

  const load = useCallback(async () => {
    const [todayBlocks, flex, studySession] = await Promise.all([
      listTodayBlocksUseCase(db),
      listFlexibleActivitiesUseCase(db),
      getOpenStudySessionUseCase(db),
    ]);
    const cleanBlocks = todayBlocks.filter(
      (b) => !b.title.startsWith('Traslado') && !b.title.startsWith('Regreso de')
    );
    setBlocks(cleanBlocks);
    setFlexible(flex);
    setActiveStudy(studySession);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const hasRunningBlock = blocks.some(
    (b) => b.status === 'in_progress' && Boolean(b.active_started_at)
  );
  const hasRunningStudy = Boolean(activeStudy);

  useEffect(() => {
    if (!hasRunningBlock && !hasRunningStudy) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningBlock, hasRunningStudy]);

  const completedCount = useMemo(
    () => blocks.filter((b) => b.status === 'completed').length,
    [blocks]
  );

  async function begin(block: PlannedBlock) {
    try {
      await startBlockSessionUseCase(db, block);
      await load();
    } catch {
      Alert.alert('Ya existe una sesión activa', 'Finalízala antes de comenzar otra.');
    }
  }

  async function finish(block: PlannedBlock) {
    await stopBlockSessionUseCase(db, block.id);
    await load();
  }

  async function markCompletedNormally(block: PlannedBlock) {
    await verifyBlockUseCase(db, block.id, 'completed', undefined, 0);
    await syncFocusSchedules(db);
    showNotice({
      title: 'Actividad realizada con normalidad',
      message: `${block.title} ha sido confirmada como completada.`,
    });
    await load();
  }

  async function confirmSuspension() {
    if (!suspendingBlock) return;
    const isEarly = selectedReason.includes('Concluyó antes');
    const isOther = selectedReason.includes('Otro motivo');
    const finalReason = isOther
      ? (customReason.trim() || 'Otro motivo')
      : selectedReason;

    const result = isEarly ? 'partial' : 'skipped';
    await verifyBlockUseCase(
      db,
      suspendingBlock.id,
      result,
      finalReason,
      isEarly ? shortenedMinutes : undefined
    );
    await syncFocusSchedules(db);

    showNotice({
      title: isEarly ? 'Actividad finalizada antes' : 'Actividad suspendida',
      message: isEarly
        ? `Se registraron ${shortenedMinutes} min liberados. Motivo: ${finalReason}.`
        : `Motivo: ${finalReason}. Estas horas no se sumarán a lo realizado.`,
    });

    setSuspendingBlock(null);
    setSelectedReason('👨‍🏫 Falta de docente');
    setCustomReason('');
    await load();
  }

  const c = {
    text: isDark ? '#F8FAFC' : palette.ink,
    muted: isDark ? '#94A3B8' : palette.muted,
    surface: isDark ? '#172033' : '#FFFFFF',
    border: isDark ? '#334155' : palette.border,
    soft: isDark ? '#1E293B' : '#F1F5F9',
  };

  const todayStr = useMemo(() => {
    const raw = new Intl.DateTimeFormat('es-BO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, []);

  async function reloadSemesterData() {
    Alert.alert(
      'Cargar datos del semestre 2/2026',
      '¿Deseas restablecer y cargar tus 6 materias oficiales con sus aulas, horas de estudio y gastos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recargar Semestre 2/2026',
          style: 'destructive',
          onPress: async () => {
            await resetAndSeedRequestedSchedule(db, true);
            await load();
            showNotice('Se cargaron las 6 materias oficiales del semestre 2/2026');
          },
        },
      ]
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow={todayStr}
        title="Tu día de actividades"
        subtitle={`${blocks.length} actividades programadas · ${completedCount} completadas`}
      />

      {/* Barra de acciones principales */}
      <View style={s.topActions}>
        <Link href="/new-activity" asChild>
          <Pressable style={s.primaryAction}>
            <Text style={s.primaryActionText}>＋ Programar actividad / clase</Text>
          </Pressable>
        </Link>
        <View style={s.secondaryActionsRow}>
          <Link href="/study" asChild>
            <Pressable
              style={StyleSheet.flatten([
                s.actionButton,
                { backgroundColor: c.soft, borderColor: c.border },
              ])}
            >
              <Text style={[s.actionButtonText, { color: c.text }]}>⏱ Cronómetro de estudio</Text>
            </Pressable>
          </Link>
          <Link href="/calendar" asChild>
            <Pressable
              style={StyleSheet.flatten([
                s.actionButton,
                { backgroundColor: c.soft, borderColor: c.border },
              ])}
            >
              <Text style={[s.actionButtonText, { color: c.text }]}>📅 Ver agenda</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {/* Hero card si hay cronómetro de estudio activo */}
      {activeStudy ? (
        <Card style={s.activeHeroCard}>
          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              <View style={s.liveBadge}>
                <View style={s.pulseDot} />
                <Text style={s.liveBadgeText}>CRONÓMETRO DE ESTUDIO ACTIVO</Text>
              </View>
              <Text style={s.heroTitle}>{activeStudy.subject_name}</Text>
              <Text style={s.heroTopic}>
                Tema: {activeStudy.topic || 'Estudio general'}
              </Text>
            </View>
            <Pressable
              style={s.heroStopButton}
              onPress={async () => {
                await stopStudySessionUseCase(db, activeStudy.id);
                await load();
              }}
            >
              <Text style={s.heroStopText}>⏹ Detener y guardar</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* Lista limpia de actividades del día */}
      <View style={s.sectionHeader}>
        <View>
          <Text style={[s.sectionTitle, { color: c.text }]}>Agenda de hoy</Text>
          <Text style={[s.sectionCount, { color: c.muted }]}>
            {completedCount} de {blocks.length} realizadas
          </Text>
        </View>
        <Pressable
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: c.soft }}
          onPress={reloadSemesterData}
        >
          <Text style={{ color: '#60A5FA', fontSize: 13, fontWeight: '800' }}>🔄 Recargar 2/2026</Text>
        </Pressable>
      </View>

      {blocks.length === 0 ? (
        <Card style={{ backgroundColor: c.surface, borderColor: c.border, alignItems: 'center', padding: 22 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🎓</Text>
          <Text style={[s.emptyTitle, { color: c.text, textAlign: 'center' }]}>
            No tienes clases programadas hoy (Domingo)
          </Text>
          <Text style={[s.emptySubtitle, { color: c.muted, textAlign: 'center' }]}>
            Tus 6 materias oficiales se dictan de Lunes a Sábado. Puedes ver el horario completo en la pestaña Agenda o recargar los datos del semestre aquí.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' }}>
            <Link href="/calendar" asChild style={{ flex: 1 }}>
              <Pressable style={s.primaryAction}>
                <Text style={[s.primaryActionText, { fontSize: 13 }]}>📅 Ver Agenda Semanal</Text>
              </Pressable>
            </Link>
            <Pressable
              style={[s.primaryAction, { flex: 1, backgroundColor: '#2563EB' }]}
              onPress={reloadSemesterData}
            >
              <Text style={[s.primaryActionText, { fontSize: 13 }]}>🔄 Recargar Semestre 2/2026</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {blocks.map((block) => {
        const isActive = block.status === 'in_progress' && Boolean(block.active_started_at);
        const isCompleted = block.status === 'completed';
        const isSuspended = block.status === 'skipped' || block.status === 'cancelled';
        const isPartial = block.status === 'partial';

        const runningSec =
          isActive && block.active_started_at
            ? Math.max(0, Math.floor((clock - new Date(block.active_started_at).getTime()) / 1000))
            : 0;

        return (
          <Card
            key={block.id}
            style={[
              s.blockCard,
              { backgroundColor: c.surface, borderColor: isActive ? '#3B82F6' : c.border },
              isActive && s.activeCardBorder,
            ]}
          >
            {/* Header del bloque */}
            <View style={s.blockHeaderRow}>
              <View style={[s.timeBadge, { backgroundColor: c.soft }]}>
                <Text style={s.timeText}>
                  {formatTime(block.starts_at)} – {formatTime(block.ends_at)}
                </Text>
              </View>

              {/* Status Badge */}
              {isCompleted ? (
                <View style={[s.statusBadge, { backgroundColor: '#064E3B', borderColor: '#059669' }]}>
                  <Text style={[s.statusBadgeText, { color: '#34D399' }]}>✓ Realizada</Text>
                </View>
              ) : isSuspended ? (
                <View style={[s.statusBadge, { backgroundColor: '#451A1A', borderColor: '#DC2626' }]}>
                  <Text style={[s.statusBadgeText, { color: '#F87171' }]}>✕ Suspendida</Text>
                </View>
              ) : isPartial ? (
                <View style={[s.statusBadge, { backgroundColor: '#451A03', borderColor: '#D97706' }]}>
                  <Text style={[s.statusBadgeText, { color: '#FBBF24' }]}>◐ Concluyó antes</Text>
                </View>
              ) : isActive ? (
                <View style={[s.statusBadge, { backgroundColor: '#1E3A8A', borderColor: '#2563EB' }]}>
                  <Text style={[s.statusBadgeText, { color: '#60A5FA' }]}>▶ En curso</Text>
                </View>
              ) : (
                <View style={[s.statusBadge, { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                  <Text style={[s.statusBadgeText, { color: '#94A3B8' }]}>⏳ Programada</Text>
                </View>
              )}
            </View>

            {/* Título de la actividad */}
            <View style={s.titleRow}>
              {block.color ? <View style={[s.colorIndicator, { backgroundColor: block.color }]} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[s.blockTitleText, { color: c.text }]} numberOfLines={2}>
                  {block.title}
                </Text>
                {block.description ? (
                  <Text style={[s.blockRoomText, { color: c.muted }]}>{block.description}</Text>
                ) : null}
              </View>
            </View>

            {/* Si fue suspendida con motivo, mostrarlo claramente en los datos */}
            {isSuspended && block.reason ? (
              <View style={s.reasonNoticeBox}>
                <Text style={s.reasonNoticeLabel}>MOTIVO DE SUSPENSIÓN:</Text>
                <Text style={s.reasonNoticeText}>{block.reason}</Text>
                <Text style={s.reasonNoticeSub}>
                  Las horas de esta clase no se contabilizaron en lo realizado.
                </Text>
              </View>
            ) : null}

            {/* Si concluyó antes */}
            {isPartial ? (
              <View style={[s.reasonNoticeBox, { borderColor: '#D97706', backgroundColor: '#3B1E08' }]}>
                <Text style={[s.reasonNoticeLabel, { color: '#FBBF24' }]}>FINALIZÓ ANTICIPADAMENTE:</Text>
                <Text style={[s.reasonNoticeText, { color: '#FEF3C7' }]}>
                  {block.shortened_minutes ? `${block.shortened_minutes} min liberados` : ''} · {block.reason || 'Concluyó antes'}
                </Text>
              </View>
            ) : null}

            {/* Segundero si está activa */}
            {isActive ? (
              <View style={s.timerContainer}>
                <Text style={s.timerLabel}>TIEMPO EN CURSO</Text>
                <Text style={s.timerDisplay}>{formatSeconds(runningSec)}</Text>
              </View>
            ) : null}

            {/* Acciones principales de la actividad */}
            <View style={s.cardActionsRow}>
              {isActive ? (
                <Pressable style={s.stopBtn} onPress={() => finish(block)}>
                  <Text style={s.btnWhiteText}>⏹ Pausar sesión</Text>
                </Pressable>
              ) : ['planned', 'paused', 'late'].includes(block.status) ? (
                <Pressable style={s.startBtn} onPress={() => begin(block)}>
                  <Text style={s.btnWhiteText}>
                    {block.status === 'paused' ? '▶ Reanudar' : '▶ Iniciar clase'}
                  </Text>
                </Pressable>
              ) : null}

              {/* Botón para marcar normalidad o suspender sobre la hora */}
              {['in_progress', 'planned', 'paused', 'late'].includes(block.status) ? (
                <View style={s.outcomeBtnGroup}>
                  <Pressable
                    style={s.normalCompleteBtn}
                    onPress={() => markCompletedNormally(block)}
                  >
                    <Text style={s.btnWhiteText}>✓ Normal</Text>
                  </Pressable>
                  <Pressable
                    style={s.suspendBtn}
                    onPress={() => setSuspendingBlock(block)}
                  >
                    <Text style={s.btnWhiteText}>✕ Suspender</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Enlaces de gestión: Ver Horas por Tema & Editar CRUD */}
            <View style={[s.managementRow, { borderTopColor: c.border }]}>
              <Link
                href={{ pathname: '/activity/[id]', params: { id: block.activity_id, blockId: block.id } }}
                asChild
              >
                <Pressable style={s.manageLink}>
                  <Text style={s.manageLinkText}>⏱ Horas por tema y cronómetro ›</Text>
                </Pressable>
              </Link>
              <Link
                href={{ pathname: '/edit-activity/[blockId]', params: { blockId: block.id } }}
                asChild
              >
                <Pressable style={s.editLink}>
                  <Text style={[s.editLinkText, { color: c.muted }]}>Editar / Eliminar</Text>
                </Pressable>
              </Link>
            </View>
          </Card>
        );
      })}

      {/* Actividades flexibles / sin horario asignado */}
      {flexible.length > 0 ? (
        <>
          <View style={[s.sectionHeader, { marginTop: 24 }]}>
            <Text style={[s.sectionTitle, { color: c.text }]}>Actividades pendientes sin horario</Text>
            <Text style={[s.sectionCount, { color: c.muted }]}>{flexible.length}</Text>
          </View>
          {flexible.map((item) => (
            <Card key={item.id} style={[s.flexCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.flexTitle, { color: c.text }]}>{item.title}</Text>
                <Text style={[s.flexMeta, { color: c.muted }]}>
                  {item.duration_minutes} min de duración
                </Text>
              </View>
              <Pressable
                style={s.flexAddBtn}
                onPress={async () => {
                  await startFlexibleActivityUseCase(db, item);
                  await load();
                }}
              >
                <Text style={s.btnWhiteText}>＋ Iniciar hoy</Text>
              </Pressable>
            </Card>
          ))}
        </>
      ) : null}

      {/* Modal para suspender / omitir actividad con motivo */}
      <Modal
        visible={Boolean(suspendingBlock)}
        transparent
        animationType="slide"
        onRequestClose={() => setSuspendingBlock(null)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>Suspender u omitir actividad</Text>
            <Text style={[s.modalSubtitle, { color: c.muted }]}>
              {suspendingBlock?.title}
            </Text>
            <Text style={[s.modalHint, { color: c.muted }]}>
              Selecciona el motivo sobre la hora. La clase no se contará en tus horas realizadas o se ajustará si concluyó antes.
            </Text>

            <ScrollView style={{ maxHeight: 280, marginVertical: 12 }}>
              {SUSPENSION_REASONS.map((r) => {
                const isSelected = selectedReason === r.label;
                return (
                  <Pressable
                    key={r.id}
                    style={[
                      s.reasonItem,
                      { borderColor: isSelected ? '#3B82F6' : c.border },
                      isSelected && { backgroundColor: isDark ? '#172554' : '#EFF6FF' },
                    ]}
                    onPress={() => setSelectedReason(r.label)}
                  >
                    <Text style={[s.reasonItemTitle, { color: c.text }]}>{r.label}</Text>
                    <Text style={[s.reasonItemDesc, { color: c.muted }]}>{r.desc}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Selector de minutos si concluyó antes */}
            {selectedReason.includes('Concluyó antes') ? (
              <View style={s.earlyBox}>
                <Text style={[s.earlyLabel, { color: c.text }]}>¿Cuántos minutos antes concluyó?</Text>
                <View style={s.chipsRow}>
                  {[15, 30, 45, 60].map((mins) => (
                    <Pressable
                      key={mins}
                      style={[
                        s.chip,
                        { borderColor: shortenedMinutes === mins ? '#3B82F6' : c.border },
                        shortenedMinutes === mins && { backgroundColor: '#2563EB' },
                      ]}
                      onPress={() => setShortenedMinutes(mins)}
                    >
                      <Text
                        style={[
                          s.chipText,
                          { color: shortenedMinutes === mins ? '#FFFFFF' : c.text },
                        ]}
                      >
                        {mins} min
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Campo de texto si eligió otro motivo */}
            {selectedReason.includes('Otro motivo') ? (
              <TextInput
                style={[
                  s.input,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    color: c.text,
                    borderColor: c.border,
                  },
                ]}
                placeholder="Describe el motivo de la suspensión..."
                placeholderTextColor={c.muted}
                value={customReason}
                onChangeText={setCustomReason}
              />
            ) : null}

            <View style={s.modalActions}>
              <Pressable
                style={[s.modalBtn, s.cancelModalBtn]}
                onPress={() => setSuspendingBlock(null)}
              >
                <Text style={s.cancelModalText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, s.confirmModalBtn]}
                onPress={confirmSuspension}
              >
                <Text style={s.btnWhiteText}>Confirmar suspensión</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const s = StyleSheet.create({
  topActions: {
    gap: 10,
    marginBottom: 16,
  },
  primaryAction: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  activeHeroCard: {
    backgroundColor: '#0F2342',
    borderColor: '#3B82F6',
    borderWidth: 2,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveBadgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  heroTopic: {
    color: '#BFDBFE',
    fontSize: 14,
    marginTop: 2,
  },
  heroStopButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  heroStopText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  blockCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  activeCardBorder: {
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  colorIndicator: {
    width: 5,
    height: 32,
    borderRadius: 3,
    marginTop: 2,
  },
  blockTitleText: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  blockRoomText: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  reasonNoticeBox: {
    backgroundColor: '#371515',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  reasonNoticeLabel: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  reasonNoticeText: {
    color: '#FECACA',
    fontSize: 14,
    fontWeight: '800',
  },
  reasonNoticeSub: {
    color: '#FCA5A5',
    fontSize: 11,
    marginTop: 2,
  },
  timerContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  timerLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timerDisplay: {
    color: '#60A5FA',
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  startBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  stopBtn: {
    flex: 1,
    backgroundColor: '#D97706',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnWhiteText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  outcomeBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  normalCompleteBtn: {
    backgroundColor: '#059669',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  suspendBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  managementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  manageLink: {
    paddingVertical: 4,
  },
  manageLinkText: {
    color: '#60A5FA',
    fontWeight: '800',
    fontSize: 13,
  },
  editLink: {
    paddingVertical: 4,
  },
  editLinkText: {
    fontWeight: '600',
    fontSize: 12,
  },
  flexCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 12,
  },
  flexTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  flexMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  flexAddBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  modalSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  modalHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  reasonItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 2,
  },
  reasonItemTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  reasonItemDesc: {
    fontSize: 12,
  },
  earlyBox: {
    marginVertical: 6,
    gap: 6,
  },
  earlyLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    marginVertical: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelModalBtn: {
    backgroundColor: '#334155',
  },
  cancelModalText: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  confirmModalBtn: {
    backgroundColor: '#DC2626',
  },
});
