import { useCallback, useEffect, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { activityColors, AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppNotice } from '@core/ui/AppNotice';
import { useAppTheme } from '@core/theme';

import {
  deleteActivityUseCase,
  getActivityUseCase,
  setActivityColorUseCase,
  updateActivityTitleUseCase,
} from '@modules/activities';

import {
  createManualStudySessionUseCase,
  deleteStudySessionUseCase,
  getOpenStudySessionUseCase,
  getScheduledClassMinutesUseCase,
  getTopicDedicationSummaryUseCase,
  interruptStudySessionUseCase,
  listActivityStudySessionsUseCase,
  startStudySessionUseCase,
  stopStudySessionUseCase,
  updateStudySessionUseCase,
  type DetailedStudySession,
  type OpenStudySession,
  type TopicDedication,
} from '@modules/study';

const duration = (m: number) => {
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours === 0) return `${mins} min`;
  return `${hours} h ${mins} min`;
};

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { showNotice } = useAppNotice();

  // Activity Info
  const [title, setTitle] = useState('Actividad');
  const [activityColor, setActivityColorState] = useState('#2563EB');
  const [classMinutes, setClassMinutes] = useState(0);

  // Topics and Sessions
  const [topics, setTopics] = useState<TopicDedication[]>([]);
  const [sessions, setSessions] = useState<DetailedStudySession[]>([]);
  const [activeSession, setActiveSession] = useState<OpenStudySession | null>(null);

  // Active Timer Local State
  const [clock, setClock] = useState(Date.now());
  const [isPaused, setIsPaused] = useState(false);
  const [pausedElapsed, setPausedElapsed] = useState<number | null>(null);
  const [sessionInterruptions, setSessionInterruptions] = useState(0);
  const [currentTopicInput, setCurrentTopicInput] = useState('');

  // Modals
  const [editTitleModal, setEditTitleModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const [manualModal, setManualModal] = useState(false);
  const [manualTopic, setManualTopic] = useState('');
  const [manualMinutes, setManualMinutes] = useState('45');
  const [manualNote, setManualNote] = useState('');

  const [editSessionModal, setEditSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<DetailedStudySession | null>(null);
  const [editSessionTopic, setEditSessionTopic] = useState('');
  const [editSessionMinutes, setEditSessionMinutes] = useState('');
  const [editSessionNote, setEditSessionNote] = useState('');

  const colors = {
    text: isDark ? '#F8FAFC' : palette.ink,
    muted: isDark ? '#94A3B8' : palette.muted,
    cardBg: isDark ? '#151D30' : '#FFFFFF',
    border: isDark ? '#26344F' : palette.border,
    inputBg: isDark ? '#0F172A' : '#F8FAFC',
    chipBg: isDark ? '#1E293B' : '#F1F5F9',
    surface: isDark ? '#1B2438' : '#F8FAFC',
  };

  const load = useCallback(async () => {
    if (!id) return;
    const [info, openSession, topicSummary, allSessions, scheduledMins] = await Promise.all([
      getActivityUseCase(db, id),
      getOpenStudySessionUseCase(db),
      getTopicDedicationSummaryUseCase(db, id),
      listActivityStudySessionsUseCase(db, id),
      getScheduledClassMinutesUseCase(db, id),
    ]);

    if (info) {
      setTitle(info.title);
      setActivityColorState(info.color);
    }
    setClassMinutes(scheduledMins);
    setTopics(topicSummary);
    setSessions(allSessions);

    if (openSession && openSession.activity_id === id) {
      setActiveSession(openSession);
      setSessionInterruptions(openSession.interruptions);
      if (openSession.topic) setCurrentTopicInput(openSession.topic);
    } else {
      setActiveSession(null);
      setIsPaused(false);
      setPausedElapsed(null);
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!activeSession || isPaused) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeSession, isPaused]);

  // Calculate Running Seconds
  const runningSeconds = activeSession
    ? isPaused && pausedElapsed !== null
      ? pausedElapsed
      : Math.max(0, Math.floor((clock - new Date(activeSession.started_at).getTime()) / 1000))
    : 0;

  const totalDedicatedMinutes = topics.reduce((sum, t) => sum + t.totalMinutes, 0);
  const totalInterruptionsCount = topics.reduce((sum, t) => sum + t.totalInterruptions, 0);

  // START TIMER
  async function handleStartTimer(topicToUse?: string) {
    if (!id) return;
    const chosenTopic = (topicToUse ?? currentTopicInput).trim() || 'Estudio general';
    try {
      const subjectId = id; // use activity as subject anchor
      await startStudySessionUseCase(
        db,
        subjectId,
        chosenTopic,
        'Sesión de estudio',
        'timer',
        null,
        id
      );
      setIsPaused(false);
      setPausedElapsed(null);
      setSessionInterruptions(0);
      await load();
      showNotice({ title: 'Cronómetro iniciado', message: `Tema: ${chosenTopic}` });
    } catch {
      Alert.alert('Sesión ya activa', 'Hay otra sesión en curso. Finalízala antes de iniciar una nueva.');
    }
  }

  // INTERRUPT / PAUSE TIMER
  async function handleTogglePause() {
    if (!activeSession) return;
    if (!isPaused) {
      // Pause and register interruption
      const currentSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000)
      );
      setPausedElapsed(currentSeconds);
      setIsPaused(true);
      const nextCount = sessionInterruptions + 1;
      setSessionInterruptions(nextCount);
      await interruptStudySessionUseCase(db, activeSession.id);
      showNotice({
        title: 'Sesión en pausa',
        message: `Interrupción registrada (#${nextCount}).`,
      });
    } else {
      // Resume
      setIsPaused(false);
      showNotice({ title: 'Sesión reanudada', message: '¡Buen enfoque!' });
    }
  }

  // FINISH & SAVE TIMER
  async function handleFinishTimer() {
    if (!activeSession) return;
    const finalSeconds = isPaused && pausedElapsed !== null
      ? pausedElapsed
      : Math.max(0, Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000));

    const finalMins = Math.round(finalSeconds / 60);
    try {
      await stopStudySessionUseCase(db, activeSession.id, 'Sesión completada con cronómetro');
      // If paused, ensure exact seconds are saved
      if (isPaused && pausedElapsed !== null) {
        await updateStudySessionUseCase(db, {
          id: activeSession.id,
          minutes: Math.max(1, finalMins),
          interruptions: sessionInterruptions,
        });
      }
      setActiveSession(null);
      setIsPaused(false);
      setPausedElapsed(null);
      await load();
      showNotice({
        title: 'Sesión guardada',
        message: `Se registraron ${finalMins} minutos dedicados.`,
      });
    } catch (e) {
      Alert.alert('Error al guardar', e instanceof Error ? e.message : 'No se pudo guardar la sesión');
    }
  }

  // MANUAL LOG
  async function handleSaveManual() {
    if (!id) return;
    const cleanTopic = manualTopic.trim() || 'Estudio general';
    const mins = Number(manualMinutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      return Alert.alert('Tiempo inválido', 'Ingresa una cantidad de minutos mayor a 0.');
    }
    try {
      await createManualStudySessionUseCase(db, {
        activityId: id,
        topic: cleanTopic,
        minutes: mins,
        note: manualNote.trim(),
      });
      setManualModal(false);
      setManualTopic('');
      setManualMinutes('45');
      setManualNote('');
      await load();
      showNotice({ title: 'Tiempo registrado', message: `${mins} min guardados en "${cleanTopic}".` });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }

  // EDIT SESSION
  function openEditSession(session: DetailedStudySession) {
    setEditingSession(session);
    setEditSessionTopic(session.topic);
    setEditSessionMinutes(String(Math.round(session.elapsed_seconds / 60)));
    setEditSessionNote(session.note ?? '');
    setEditSessionModal(true);
  }

  async function handleSaveEditSession() {
    if (!editingSession) return;
    const cleanTopic = editSessionTopic.trim() || 'Estudio general';
    const mins = Number(editSessionMinutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      return Alert.alert('Tiempo inválido', 'Ingresa una cantidad válida de minutos.');
    }
    try {
      await updateStudySessionUseCase(db, {
        id: editingSession.id,
        topic: cleanTopic,
        minutes: mins,
        note: editSessionNote.trim(),
      });
      setEditSessionModal(false);
      setEditingSession(null);
      await load();
      showNotice({ title: 'Sesión actualizada' });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar la sesión');
    }
  }

  // DELETE SESSION
  function handleDeleteSession(sessionId: string) {
    Alert.alert('Eliminar sesión', '¿Estás seguro de eliminar este registro de estudio?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteStudySessionUseCase(db, sessionId);
          await load();
          showNotice({ title: 'Sesión eliminada' });
        },
      },
    ]);
  }

  // EDIT TITLE
  async function handleSaveTitle() {
    if (!id || !newTitle.trim()) return;
    try {
      await updateActivityTitleUseCase(db, id, newTitle.trim());
      setTitle(newTitle.trim());
      setEditTitleModal(false);
      showNotice({ title: 'Nombre actualizado' });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  }

  // DELETE ACTIVITY
  function handleDeleteActivity() {
    if (!id) return;
    Alert.alert(
      'Eliminar actividad',
      `¿Deseas eliminar permanentemente "${title}" y todas sus clases y sesiones?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar actividad',
          style: 'destructive',
          onPress: async () => {
            await deleteActivityUseCase(db, id);
            router.replace('/(tabs)');
          },
        },
      ]
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Header con color de la actividad */}
        <View style={s.topBar}>
          <View style={[s.colorBadge, { backgroundColor: activityColor }]} />
          <View style={{ flex: 1 }}>
            <PageHeader
              eyebrow="Seguimiento de actividad"
              title={title}
              subtitle="Horas de estudio, cronómetro con interrupciones y desglose por tema."
            />
          </View>
          <Pressable
            style={[s.editTitleBtn, { borderColor: colors.border }]}
            onPress={() => {
              setNewTitle(title);
              setEditTitleModal(true);
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Editar</Text>
          </Pressable>
        </View>

        {/* 4 Métricas Clave */}
        <View style={s.metricsGrid}>
          <View style={[s.metricBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Total dedicado</Text>
            <Text style={[s.metricValue, { color: palette.primary }]}>{duration(totalDedicatedMinutes)}</Text>
          </View>
          <View style={[s.metricBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Clases en horario</Text>
            <Text style={[s.metricValue, { color: colors.text }]}>{duration(classMinutes)}</Text>
          </View>
          <View style={[s.metricBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Sesiones</Text>
            <Text style={[s.metricValue, { color: colors.text }]}>{sessions.length}</Text>
          </View>
          <View style={[s.metricBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.metricLabel, { color: colors.muted }]}>Interrupciones</Text>
            <Text style={[s.metricValue, { color: '#F59E0B' }]}>{totalInterruptionsCount}</Text>
          </View>
        </View>

        {/* SECCIÓN DEL CRONÓMETRO */}
        <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>⏱️ Cronómetro de Estudio</Text>
          <Text style={[s.muted, { color: colors.muted, marginBottom: 16 }]}>
            Asigna tiempo a esta actividad con registro de interrupciones.
          </Text>

          {activeSession ? (
            /* Cronómetro Activo */
            <View style={[s.activeTimerBox, { borderColor: activityColor }]}>
              <View style={s.activeTimerHeader}>
                <View style={[s.liveDot, isPaused && { backgroundColor: '#F59E0B' }]} />
                <Text style={[s.liveStatusText, { color: isPaused ? '#F59E0B' : '#10B981' }]}>
                  {isPaused ? 'En pausa por interrupción' : 'Sesión en curso'}
                </Text>
              </View>

              <Text style={[s.activeTopicText, { color: colors.text }]}>
                {activeSession.topic || 'Estudio general'}
              </Text>

              {/* Display de tiempo grande */}
              <Text style={[s.timerDisplay, { color: activityColor }]}>
                {String(Math.floor(runningSeconds / 3600)).padStart(2, '0')}:
                {String(Math.floor((runningSeconds % 3600) / 60)).padStart(2, '0')}:
                {String(runningSeconds % 60).padStart(2, '0')}
              </Text>

              {/* Contador de interrupciones en la sesión */}
              <View style={s.interruptionChip}>
                <Text style={s.interruptionText}>
                  ⚡ {sessionInterruptions} {sessionInterruptions === 1 ? 'interrupción' : 'interrupciones'}
                </Text>
              </View>

              {/* Botones de control */}
              <View style={s.timerControlsRow}>
                <Pressable
                  style={[s.pauseBtn, isPaused && s.resumeBtn]}
                  onPress={() => void handleTogglePause()}
                >
                  <Text style={s.whiteBtnText}>
                    {isPaused ? '▶️ Continuar / Reanudar' : '⏸️ Pausa / Interrupción'}
                  </Text>
                </Pressable>

                <Pressable style={s.finishBtn} onPress={() => void handleFinishTimer()}>
                  <Text style={s.whiteBtnText}>⏹️ Guardar y Finalizar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            /* Formulario para Iniciar Cronómetro */
            <View>
              <Text style={[s.subLabel, { color: colors.text }]}>¿Qué tema vas a estudiar?</Text>
              <TextInput
                value={currentTopicInput}
                onChangeText={setCurrentTopicInput}
                placeholder="Ej: Repaso de Integrales, Ejercicios Capítulo 3..."
                placeholderTextColor={colors.muted}
                style={[
                  s.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
                ]}
              />

              {/* Temas previos rápidos para elegir */}
              {topics.length > 0 ? (
                <View style={s.quickTopicsRow}>
                  <Text style={[s.muted, { color: colors.muted, fontSize: 12, marginRight: 6 }]}>
                    Temas frecuentes:
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {topics.map((t) => (
                      <Pressable
                        key={t.topic}
                        style={[s.quickTopicChip, { backgroundColor: colors.chipBg, borderColor: colors.border }]}
                        onPress={() => setCurrentTopicInput(t.topic)}
                      >
                        <Text style={[s.quickTopicText, { color: colors.text }]}>{t.topic}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <Pressable
                style={[s.startBtn, { backgroundColor: palette.primary }]}
                onPress={() => void handleStartTimer()}
              >
                <Text style={s.startBtnText}>▶️ Iniciar Estudio con Cronómetro</Text>
              </Pressable>

              <Pressable
                style={[s.manualBtn, { borderColor: colors.border }]}
                onPress={() => setManualModal(true)}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  ＋ Registrar tiempo manualmente (sin cronómetro)
                </Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* DESGLOSE DE HORAS POR TEMA */}
        <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>📘 Horas Dedicadas por Tema</Text>
          <Text style={[s.muted, { color: colors.muted, marginBottom: 16 }]}>
            Desglose acumulado de estudio en cada tema de esta materia.
          </Text>

          {topics.length > 0 ? (
            topics.map((t) => {
              const percent = totalDedicatedMinutes > 0
                ? Math.round((t.totalMinutes / totalDedicatedMinutes) * 100)
                : 0;
              return (
                <View key={t.topic} style={[s.topicItem, { borderBottomColor: colors.border }]}>
                  <View style={s.topicHeader}>
                    <Text style={[s.topicTitle, { color: colors.text }]}>{t.topic}</Text>
                    <Text style={[s.topicTime, { color: palette.primary }]}>{duration(t.totalMinutes)}</Text>
                  </View>

                  {/* Barra de progreso */}
                  <View style={[s.progressBarTrack, { backgroundColor: colors.surface }]}>
                    <View
                      style={[
                        s.progressBarFill,
                        { width: `${Math.max(6, percent)}%`, backgroundColor: activityColor },
                      ]}
                    />
                  </View>

                  <View style={s.topicFooter}>
                    <Text style={[s.topicMeta, { color: colors.muted }]}>
                      {t.sessionsCount} {t.sessionsCount === 1 ? 'sesión' : 'sesiones'} · {t.totalInterruptions} {t.totalInterruptions === 1 ? 'interrupción' : 'interrupciones'}
                    </Text>
                    <Text style={[s.topicMeta, { color: colors.muted }]}>{percent}% del total</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[s.emptyText, { color: colors.muted }]}>
              Aún no has registrado sesiones de estudio. Inicia el cronómetro o registra tiempo manual para ver el desglose por temas.
            </Text>
          )}
        </Card>

        {/* HISTORIAL DE SESIONES (CRUD) */}
        <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={s.sessionsHeaderRow}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>📋 Historial de Sesiones</Text>
            <Pressable onPress={() => setManualModal(true)}>
              <Text style={{ color: palette.primary, fontWeight: '700', fontSize: 13 }}>＋ Nueva</Text>
            </Pressable>
          </View>

          {sessions.length > 0 ? (
            sessions.map((sess) => (
              <View key={sess.id} style={[s.sessionRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sessionTopic, { color: colors.text }]}>{sess.topic}</Text>
                  <Text style={[s.sessionMeta, { color: colors.muted }]}>
                    {new Intl.DateTimeFormat('es-BO', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(sess.started_at))} · {duration(Math.round(sess.elapsed_seconds / 60))}
                    {sess.interruptions > 0 ? ` · ${sess.interruptions} interrupciones` : ''}
                  </Text>
                  {sess.note ? (
                    <Text style={[s.sessionNote, { color: colors.muted }]}>{sess.note}</Text>
                  ) : null}
                </View>

                {/* Acciones Editar y Eliminar */}
                <View style={s.sessionActions}>
                  <Pressable style={s.iconActionBtn} onPress={() => openEditSession(sess)}>
                    <Text style={{ fontSize: 15 }}>✏️</Text>
                  </Pressable>
                  <Pressable style={s.iconActionBtn} onPress={() => handleDeleteSession(sess.id)}>
                    <Text style={{ fontSize: 15 }}>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={[s.emptyText, { color: colors.muted }]}>
              No hay sesiones finalizadas aún.
            </Text>
          )}
        </Card>

        {/* Color de la Actividad */}
        <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>🎨 Color de Identificación</Text>
          <View style={s.colorPalette}>
            {activityColors.map((c) => (
              <Pressable
                key={c}
                style={[
                  s.colorCircle,
                  { backgroundColor: c },
                  activityColor === c && s.colorCircleSelected,
                ]}
                onPress={async () => {
                  if (!id) return;
                  await setActivityColorUseCase(db, id, c);
                  setActivityColorState(c);
                  showNotice({ title: 'Color actualizado' });
                }}
              >
                {activityColor === c ? <Text style={s.check}>✓</Text> : null}
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Botón para eliminar actividad completa */}
        <Pressable style={s.deleteActivityBtn} onPress={handleDeleteActivity}>
          <Text style={s.deleteActivityText}>🗑️ Eliminar esta actividad completa</Text>
        </Pressable>
      </ScrollView>

      {/* MODAL REGISTRO MANUAL */}
      <Modal visible={manualModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Registrar Tiempo de Estudio</Text>
            <Text style={[s.muted, { color: colors.muted, marginBottom: 14 }]}>
              Añade horas dedicadas sin haber usado el cronómetro.
            </Text>

            <Text style={[s.label, { color: colors.text }]}>Tema o contenido</Text>
            <TextInput
              value={manualTopic}
              onChangeText={setManualTopic}
              placeholder="Ej: Ejercicios de Vectores, Repaso examen..."
              placeholderTextColor={colors.muted}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>Minutos dedicados</Text>
            <TextInput
              value={manualMinutes}
              onChangeText={setManualMinutes}
              keyboardType="number-pad"
              placeholder="Ej: 60"
              placeholderTextColor={colors.muted}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>Notas (opcional)</Text>
            <TextInput
              value={manualNote}
              onChangeText={setManualNote}
              placeholder="Detalles sobre lo avanzado..."
              placeholderTextColor={colors.muted}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <View style={s.modalButtons}>
              <Pressable
                style={[s.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setManualModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={() => void handleSaveManual()}>
                <Text style={s.whiteBtnText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL EDITAR SESIÓN */}
      <Modal visible={editSessionModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Editar Sesión</Text>

            <Text style={[s.label, { color: colors.text }]}>Tema</Text>
            <TextInput
              value={editSessionTopic}
              onChangeText={setEditSessionTopic}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>Minutos dedicados</Text>
            <TextInput
              value={editSessionMinutes}
              onChangeText={setEditSessionMinutes}
              keyboardType="number-pad"
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <Text style={[s.label, { color: colors.text, marginTop: 12 }]}>Notas</Text>
            <TextInput
              value={editSessionNote}
              onChangeText={setEditSessionNote}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            />

            <View style={s.modalButtons}>
              <Pressable
                style={[s.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditSessionModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={() => void handleSaveEditSession()}>
                <Text style={s.whiteBtnText}>Guardar cambios</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL EDITAR NOMBRE DE ACTIVIDAD */}
      <Modal visible={editTitleModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Cambiar Nombre de Actividad</Text>

            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg, marginTop: 12 }]}
              autoFocus
            />

            <View style={s.modalButtons}>
              <Pressable
                style={[s.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditTitleModal(false)}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={() => void handleSaveTitle()}>
                <Text style={s.whiteBtnText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  colorBadge: {
    width: 14,
    height: 48,
    borderRadius: 7,
  },
  editTitleBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  quickTopicsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  quickTopicChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  quickTopicText: {
    fontSize: 12,
    fontWeight: '600',
  },
  startBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  manualBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  activeTimerBox: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.04)',
  },
  activeTimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  liveStatusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeTopicText: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  timerDisplay: {
    fontSize: 38,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    marginVertical: 8,
  },
  interruptionChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  interruptionText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
  },
  timerControlsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resumeBtn: {
    backgroundColor: '#10B981',
  },
  finishBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  whiteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  topicItem: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  topicTime: {
    fontSize: 15,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  topicFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  topicMeta: {
    fontSize: 12,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
    lineHeight: 18,
  },
  sessionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  sessionTopic: {
    fontSize: 14,
    fontWeight: '700',
  },
  sessionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  sessionNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconActionBtn: {
    padding: 6,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  check: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  deleteActivityBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  deleteActivityText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalSaveBtn: {
    backgroundColor: palette.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
