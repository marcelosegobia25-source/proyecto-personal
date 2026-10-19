import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { activityColors, AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppNotice } from '@core/ui/AppNotice';
import { useAppTheme } from '@core/theme';
import { schedulePriorityNotifications } from '@core/notifications';
import { hasFocusAccess, requestFocusAccess, syncFocusSchedules } from '@core/focus-mode';

import {
  attachNotificationUseCase,
  createFlexibleActivityUseCase,
  createPlannedActivityUseCase,
} from '@modules/activities';
import { countScheduleConflictsUseCase } from '@modules/calendar';
import { getNotificationPreferencesUseCase } from '@modules/settings';

const QUICK_DURATIONS = [
  { label: '30 min', value: '30' },
  { label: '45 min', value: '45' },
  { label: '1 h', value: '60' },
  { label: '1 h 30', value: '90' },
  { label: '2 h', value: '120' },
];

const WEEKDAY_NAMES = [
  { day: 1, label: 'L' },
  { day: 2, label: 'M' },
  { day: 3, label: 'M' },
  { day: 4, label: 'J' },
  { day: 5, label: 'V' },
  { day: 6, label: 'S' },
  { day: 0, label: 'D' },
];

export default function NewActivityScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useAppTheme();
  const { showNotice } = useAppNotice();
  const params = useLocalSearchParams<{ startsAt?: string; endsAt?: string }>();

  const initial = useMemo(() => {
    const parsed = params.startsAt ? new Date(params.startsAt) : new Date(Date.now() + 60 * 60_000);
    const d = Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 60 * 60_000) : parsed;
    d.setSeconds(0, 0);
    return d;
  }, [params.startsAt]);

  const [title, setTitle] = useState('');
  const [scheduled, setScheduled] = useState(true);
  const [dateTime, setDateTime] = useState(initial);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(initial);
    d.setMonth(d.getMonth() + 3);
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [picker, setPicker] = useState<'date' | 'time' | 'end' | null>(null);
  const [duration, setDuration] = useState(() =>
    params.endsAt
      ? String(Math.max(5, Math.round((new Date(params.endsAt).getTime() - initial.getTime()) / 60000)))
      : '60'
  );
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekly'>('once');
  const [weekdays, setWeekdays] = useState<number[]>([initial.getDay()]);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [color, setColor] = useState('#2563EB');
  const [focusMode, setFocusMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const colors = {
    text: isDark ? '#F8FAFC' : palette.ink,
    muted: isDark ? '#94A3B8' : palette.muted,
    cardBg: isDark ? '#151D30' : '#FFFFFF',
    border: isDark ? '#26344F' : palette.border,
    inputBg: isDark ? '#0F172A' : '#F8FAFC',
    chipBg: isDark ? '#1E293B' : '#F1F5F9',
    chipActive: palette.primary,
  };

  const dateLabel = new Intl.DateTimeFormat('es-BO', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(dateTime);

  const timeLabel = new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateTime);

  const endDateLabel = new Intl.DateTimeFormat('es-BO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(endDate);

  function changeDateTime(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'set' && value) {
      if (picker === 'end') {
        const next = new Date(value);
        next.setHours(23, 59, 59, 999);
        setEndDate(next);
        return;
      }
      const next = new Date(dateTime);
      if (picker === 'date') {
        next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
      } else {
        next.setHours(value.getHours(), value.getMinutes(), 0, 0);
      }
      setDateTime(next);
    }
  }

  function toggleWeekday(day: number) {
    if (weekdays.includes(day)) {
      if (weekdays.length > 1) {
        setWeekdays(weekdays.filter((d) => d !== day));
      }
    } else {
      setWeekdays([...weekdays, day]);
    }
  }

  async function handleSave(force = false) {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return Alert.alert('Nombre requerido', 'Ingresa el nombre de la actividad o clase.');
    }
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      return Alert.alert('Duración inválida', 'La duración debe estar entre 5 y 1440 minutos.');
    }

    if (!scheduled) {
      setSaving(true);
      try {
        await createFlexibleActivityUseCase(db, {
          title: cleanTitle,
          durationMinutes: minutes,
          kind: 'general',
        });
        showNotice({ title: 'Actividad flexible creada', message: cleanTitle });
        router.back();
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!force) {
      const conflicts = await countScheduleConflictsUseCase(db, {
        startsAt: dateTime,
        endsOn: recurrence === 'once' ? dateTime : endDate,
        durationMinutes: minutes,
        recurrence,
        weekdays,
      });
      if (conflicts > 0) {
        return Alert.alert(
          'Cruce de horario',
          `Esta actividad coincide con ${conflicts} evento(s) ya programado(s). ¿Deseas programarla igualmente?`,
          [
            { text: 'Modificar horario', style: 'cancel' },
            { text: 'Guardar de todos modos', onPress: () => void handleSave(true) },
          ]
        );
      }
    }

    setSaving(true);
    try {
      if (focusMode && Platform.OS === 'android' && !(await hasFocusAccess())) {
        await requestFocusAccess();
      }

      const created = await createPlannedActivityUseCase(db, {
        title: cleanTitle,
        startsAt: dateTime,
        endsOn: recurrence === 'once' ? dateTime : endDate,
        durationMinutes: minutes,
        recurrence,
        weekdays,
        priority,
        color,
        focusMode,
      });

      const prefs = await getNotificationPreferencesUseCase(db);
      for (const occurrence of created.occurrences) {
        const notificationIds = await schedulePriorityNotifications(
          cleanTitle,
          occurrence.startsAt,
          priority,
          prefs.offsets
        );
        for (let i = 0; i < notificationIds.length; i++) {
          const id = notificationIds[i];
          const offset = prefs.offsets[i] ?? 15;
          const remindAt = new Date(occurrence.startsAt.getTime() - offset * 60_000);
          await attachNotificationUseCase(
            db,
            occurrence.blockId,
            id,
            remindAt,
            cleanTitle
          );
        }
      }

      await syncFocusSchedules(db);
      showNotice({
        title: 'Actividad programada',
        message: `${cleanTitle} se guardó correctamente.`,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error al guardar', e instanceof Error ? e.message : 'Revisa los datos');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <PageHeader
            eyebrow="Nueva actividad"
            title="Crear clase o actividad"
            subtitle="Organiza tu horario y haz seguimiento a tus horas de dedicación."
          />

          {/* Nombre */}
          <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Nombre de la actividad o clase</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ej: Álgebra Lineal, Programación, Gimnasio"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
              autoFocus
            />
          </Card>

          {/* Tipo de horario */}
          <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]}>Horario programado en agenda</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>
                  {scheduled
                    ? 'Aparece en tu horario diario con hora de inicio y fin.'
                    : 'Actividad flexible para realizar cuando tengas tiempo.'}
                </Text>
              </View>
              <Switch value={scheduled} onValueChange={setScheduled} />
            </View>
          </Card>

          {scheduled ? (
            <>
              {/* Fecha y Hora */}
              <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.text }]}>Fecha y hora de inicio</Text>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setPicker('date')}
                  >
                    <Text style={[styles.pickerBtnSub, { color: colors.muted }]}>Fecha</Text>
                    <Text style={[styles.pickerBtnText, { color: colors.text }]}>{dateLabel}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.pickerBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    onPress={() => setPicker('time')}
                  >
                    <Text style={[styles.pickerBtnSub, { color: colors.muted }]}>Hora de inicio</Text>
                    <Text style={[styles.pickerBtnText, { color: colors.text }]}>{timeLabel}</Text>
                  </Pressable>
                </View>
              </Card>

              {/* Duración */}
              <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.text }]}>Duración</Text>
                <View style={styles.chipsRow}>
                  {QUICK_DURATIONS.map((q) => (
                    <Pressable
                      key={q.value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: duration === q.value ? palette.primary : colors.chipBg,
                          borderColor: duration === q.value ? palette.primary : colors.border,
                        },
                      ]}
                      onPress={() => setDuration(q.value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: duration === q.value ? '#FFFFFF' : colors.text },
                        ]}
                      >
                        {q.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.customDurationRow}>
                  <Text style={[styles.muted, { color: colors.muted }]}>Minutos exactos:</Text>
                  <TextInput
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="number-pad"
                    style={[
                      styles.smallInput,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg },
                    ]}
                  />
                  <Text style={[styles.muted, { color: colors.muted }]}>min</Text>
                </View>
              </Card>

              {/* Recurrencia */}
              <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.text }]}>Frecuencia</Text>
                <View style={styles.segmented}>
                  {(['once', 'daily', 'weekly'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      style={[
                        styles.segment,
                        {
                          backgroundColor: recurrence === mode ? palette.primary : colors.inputBg,
                        },
                      ]}
                      onPress={() => setRecurrence(mode)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: recurrence === mode ? '#FFFFFF' : colors.muted },
                        ]}
                      >
                        {mode === 'once' ? 'Una vez' : mode === 'daily' ? 'Diario' : 'Semanal'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {recurrence === 'weekly' ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.subLabel, { color: colors.muted }]}>Días de la semana</Text>
                    <View style={styles.weekdaysRow}>
                      {WEEKDAY_NAMES.map((w) => {
                        const selected = weekdays.includes(w.day);
                        return (
                          <Pressable
                            key={w.day}
                            style={[
                              styles.dayCircle,
                              {
                                backgroundColor: selected ? palette.primary : colors.chipBg,
                                borderColor: selected ? palette.primary : colors.border,
                              },
                            ]}
                            onPress={() => toggleWeekday(w.day)}
                          >
                            <Text
                              style={[
                                styles.dayCircleText,
                                { color: selected ? '#FFFFFF' : colors.text },
                              ]}
                            >
                              {w.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Pressable
                      style={[styles.endDateRow, { borderColor: colors.border }]}
                      onPress={() => setPicker('end')}
                    >
                      <Text style={[styles.muted, { color: colors.muted }]}>Repetir hasta:</Text>
                      <Text style={[styles.endDateValue, { color: colors.text }]}>{endDateLabel}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            </>
          ) : (
            <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>Duración estimada</Text>
              <View style={styles.chipsRow}>
                {QUICK_DURATIONS.map((q) => (
                  <Pressable
                    key={q.value}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: duration === q.value ? palette.primary : colors.chipBg,
                        borderColor: duration === q.value ? palette.primary : colors.border,
                      },
                    ]}
                    onPress={() => setDuration(q.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: duration === q.value ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      {q.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          )}

          {/* Color de identificación */}
          <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Color de identificación</Text>
            <View style={styles.colorsRow}>
              {activityColors.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    color === c && styles.colorCircleSelected,
                  ]}
                  onPress={() => setColor(c)}
                >
                  {color === c ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </View>
          </Card>

          {/* Prioridad y Modo Enfoque */}
          <Card style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>Prioridad</Text>
            <View style={styles.segmented}>
              {(['low', 'normal', 'high', 'critical'] as const).map((p) => (
                <Pressable
                  key={p}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: priority === p ? palette.primary : colors.inputBg,
                    },
                  ]}
                  onPress={() => setPriority(p)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: priority === p ? '#FFFFFF' : colors.muted },
                    ]}
                  >
                    {p === 'low' ? 'Baja' : p === 'normal' ? 'Normal' : p === 'high' ? 'Alta' : 'Crítica'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.switchRow, { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subLabel, { color: colors.text }]}>Modo enfoque automático</Text>
                <Text style={[styles.muted, { color: colors.muted, fontSize: 12 }]}>
                  Silencia notificaciones distractivas durante esta actividad.
                </Text>
              </View>
              <Switch value={focusMode} onValueChange={setFocusMode} />
            </View>
          </Card>

          {/* Botón de Guardar */}
          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Guardando…' : '＋ Guardar Actividad'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {picker ? (
        <DateTimePicker
          value={picker === 'end' ? endDate : dateTime}
          mode={picker === 'time' ? 'time' : 'date'}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={changeDateTime}
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  subLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  smallInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    width: 64,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  pickerBtnSub: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pickerBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  customDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    padding: 3,
    backgroundColor: '#0F172A',
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dayCircleText: {
    fontSize: 14,
    fontWeight: '800',
  },
  endDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  endDateValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleSelected: {
    transform: [{ scale: 1.15 }],
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  check: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: palette.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 32,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
