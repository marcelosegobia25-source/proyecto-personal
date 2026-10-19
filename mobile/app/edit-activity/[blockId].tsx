import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppTheme } from '@core/theme';
import {
  cancelScheduledNotifications,
  schedulePriorityNotifications,
} from '@core/notifications';
import { hasFocusAccess, requestFocusAccess, syncFocusSchedules } from '@core/focus-mode';

import {
  attachNotificationUseCase,
  clearBlockRemindersUseCase,
  deleteActivityUseCase,
  deleteOccurrenceAtomicUseCase,
  getOccurrenceEditorUseCase,
  listActivityReminderBlocksUseCase,
  setActivityPausedUseCase,
  updateOccurrenceUseCase,
  type OccurrenceEditor,
} from '@modules/activities';
import { getNotificationPreferencesUseCase } from '@modules/settings';

type Scope = 'one' | 'future' | 'all';

export default function EditActivity() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { isDark } = useAppTheme();

  const [item, setItem] = useState<OccurrenceEditor | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(new Date());
  const [duration, setDuration] = useState('60');
  const [priority, setPriority] = useState<OccurrenceEditor['priority']>('normal');
  const [focusMode, setFocusMode] = useState(false);
  const [scope, setScope] = useState<Scope>('one');
  const [showTime, setShowTime] = useState(false);
  const [saving, setSaving] = useState(false);

  const colors = {
    text: isDark ? '#F8FAFC' : palette.ink,
    muted: isDark ? '#94A3B8' : palette.muted,
    cardBg: isDark ? '#151D30' : '#FFFFFF',
    border: isDark ? '#26344F' : palette.border,
    inputBg: isDark ? '#0F172A' : '#F8FAFC',
    chipBg: isDark ? '#1E293B' : '#F1F5F9',
  };

  useEffect(() => {
    void getOccurrenceEditorUseCase(db, blockId).then((x) => {
      if (!x) return;
      setItem(x);
      setTitle(x.title);
      setStart(new Date(x.starts_at));
      setDuration(
        String(Math.round((new Date(x.ends_at).getTime() - new Date(x.starts_at).getTime()) / 60000))
      );
      setPriority(x.priority);
      setFocusMode(Boolean(x.focus_mode));
    });
  }, [blockId, db]);

  if (!item) {
    return (
      <AppScreen>
        <Text style={{ color: colors.muted, padding: 24, textAlign: 'center' }}>Cargando actividad…</Text>
      </AppScreen>
    );
  }

  const input = () => ({
    title: title.trim(),
    startsAt: start,
    durationMinutes: Number(duration),
    priority,
    focusMode,
    preparation: 0,
    travel: 0,
    buffer: 0,
    returnTravel: 0,
  });

  function valid() {
    const x = input();
    return Boolean(x.title) && Number.isInteger(x.durationMinutes) && x.durationMinutes > 0;
  }

  async function syncReminders(activityId: string) {
    const preferences = await getNotificationPreferencesUseCase(db);
    const all = await listActivityReminderBlocksUseCase(db, activityId, true);
    for (const block of all) {
      await cancelScheduledNotifications(await clearBlockRemindersUseCase(db, block.id));
    }
    const active = await listActivityReminderBlocksUseCase(db, activityId);
    for (const block of active) {
      const startsAt = new Date(block.starts_at);
      const notificationIds = await schedulePriorityNotifications(
        block.title,
        startsAt,
        priority,
        preferences.offsets
      );
      for (let i = 0; i < notificationIds.length; i++) {
        const id = notificationIds[i];
        const offset = preferences.offsets[i] ?? 15;
        const remindAt = new Date(startsAt.getTime() - offset * 60_000);
        await attachNotificationUseCase(
          db,
          block.id,
          id,
          remindAt,
          block.title
        );
      }
    }
  }

  async function save() {
    if (!item || !valid()) {
      return Alert.alert('Revisa los datos', 'El nombre y la duración son obligatorios.');
    }
    setSaving(true);
    try {
      await updateOccurrenceUseCase(db, item, input(), scope);
      await syncReminders(item.activity_id);
      await syncFocusSchedules(db);
      Alert.alert('Guardado', 'Los cambios se guardaron correctamente.');
      router.back();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    Alert.alert(
      'Eliminar clase u ocurrencia',
      scope === 'one'
        ? '¿Eliminar solo esta ocurrencia de la agenda?'
        : scope === 'future'
        ? '¿Eliminar esta y todas las ocurrencias futuras?'
        : '¿Eliminar todas las ocurrencias de esta serie?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOccurrenceAtomicUseCase(db, item, scope);
              await syncReminders(item.activity_id);
              await syncFocusSchedules(db);
              router.back();
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  }

  async function removeEntireActivity() {
    if (!item) return;
    Alert.alert(
      'Eliminar actividad completa',
      `¿Deseas eliminar permanentemente "${item.title}" y todos sus bloques de horario?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar actividad',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteActivityUseCase(db, item.activity_id);
              await syncFocusSchedules(db);
              router.replace('/(tabs)');
            } catch (error) {
              Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  }

  async function toggleFocus(value: boolean) {
    setFocusMode(value);
    if (value && Platform.OS === 'android' && !(await hasFocusAccess())) {
      Alert.alert('Permiso necesario', 'Permite a Nexo controlar "No molestar".');
      await requestFocusAccess();
    }
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Editar actividad"
        title={item.title}
        subtitle="Ajusta el horario, duración o prioridad."
      />

      <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <Text style={[s.label, { color: colors.text }]}>Nombre</Text>
        <TextInput
          style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[s.label, { color: colors.text, marginTop: 14 }]}>Hora de inicio</Text>
        <Pressable
          style={[s.selector, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
          onPress={() => setShowTime(true)}
        >
          <Text style={[s.value, { color: colors.text }]}>
            {new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' }).format(start)}
          </Text>
          <Text style={[s.muted, { color: colors.muted }]}>Cambiar hora ›</Text>
        </Pressable>

        {showTime ? (
          <DateTimePicker
            value={start}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(e, d) => {
              if (Platform.OS === 'android') setShowTime(false);
              if (e.type === 'set' && d) {
                const next = new Date(start);
                next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                setStart(next);
              }
            }}
          />
        ) : null}

        <Text style={[s.label, { color: colors.text, marginTop: 14 }]}>Duración (minutos)</Text>
        <TextInput
          style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
        />

        <Text style={[s.label, { color: colors.text, marginTop: 14 }]}>Prioridad</Text>
        <View style={s.row}>
          {(
            [
              ['low', 'Baja'],
              ['normal', 'Normal'],
              ['high', 'Alta'],
              ['critical', 'Crítica'],
            ] as const
          ).map(([x, label]) => (
            <Pressable
              key={x}
              style={[
                s.chip,
                {
                  backgroundColor: priority === x ? palette.primary : colors.chipBg,
                  borderColor: priority === x ? palette.primary : colors.border,
                },
              ]}
              onPress={() => setPriority(x)}
            >
              <Text style={{ color: priority === x ? '#FFFFFF' : colors.text, fontWeight: '700' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[s.focusRow, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.label, { color: colors.text, marginBottom: 0 }]}>Modo No molestar</Text>
            <Text style={[s.muted, { color: colors.muted, fontSize: 12 }]}>
              Silencia notificaciones durante este horario.
            </Text>
          </View>
          <Switch value={focusMode} onValueChange={toggleFocus} trackColor={{ true: palette.primary }} />
        </View>
      </Card>

      <Card style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <Text style={[s.label, { color: colors.text }]}>Aplicar cambios a</Text>
        {(
          [
            ['one', 'Solo esta fecha'],
            ['future', 'Esta y las siguientes'],
            ['all', 'Toda la serie'],
          ] as const
        ).map(([x, label]) => (
          <Pressable
            key={x}
            style={[
              s.scope,
              {
                backgroundColor: scope === x ? (isDark ? '#1E293B' : '#EFF6FF') : 'transparent',
                borderColor: scope === x ? palette.primary : colors.border,
              },
            ]}
            onPress={() => setScope(x)}
          >
            <Text style={{ color: scope === x ? palette.primary : colors.text, fontWeight: '700' }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </Card>

      <Pressable style={[s.save, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
        <Text style={s.saveText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
      </Pressable>

      <Pressable style={s.deleteBtn} onPress={remove}>
        <Text style={s.deleteBtnText}>Eliminar esta ocurrencia</Text>
      </Pressable>

      <Pressable style={s.deleteEntireBtn} onPress={removeEntireActivity}>
        <Text style={s.deleteEntireBtnText}>Eliminar actividad completa</Text>
      </Pressable>
    </AppScreen>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  muted: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  scope: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  save: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  deleteBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginBottom: 10,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  deleteEntireBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  deleteEntireBtnText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
