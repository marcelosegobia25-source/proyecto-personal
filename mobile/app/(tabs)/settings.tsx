import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppTheme, type ThemeMode } from '@core/theme';
import {
  cancelScheduledNotifications,
  getNotificationPermissionState,
  notificationsRequireDevelopmentBuild,
  prepareNotifications,
  schedulePriorityNotifications,
  sendTestNotification,
} from '@core/notifications';

import {
  attachNotificationUseCase,
  clearBlockRemindersUseCase,
  listFutureReminderBlocksUseCase,
  listPausedActivitiesUseCase,
  setActivityPausedUseCase,
} from '@modules/activities';

import {
  getSchedulePreferencesUseCase,
  saveSchedulePreferencesUseCase,
  type SchedulePreferences,
} from '@modules/calendar';

import {
  getNotificationPreferencesUseCase,
  saveNotificationPreferencesUseCase,
} from '@modules/settings';
import { resetAndSeedRequestedSchedule } from '@core/database/seed';

const defaults: SchedulePreferences = {
  dayStart: '06:00',
  dayEnd: '22:00',
  slotMinutes: 30,
  hidePast: true,
  minFreeMinutes: 15,
  showWeekends: true,
  initialView: 'day',
};

const toDate = (value: string) =>
  new Date(2026, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3)));

export default function SettingsScreen() {
  const { mode, setMode, isDark } = useAppTheme();
  const db = useSQLiteContext();
  const [paused, setPaused] = useState<{ activity_id: string; title: string }[]>([]);
  const [granted, setGranted] = useState(false);
  const [schedule, setSchedule] = useState(defaults);
  const [notificationOffsets, setNotificationOffsets] = useState<number[]>([60, 30, 5]);
  const [timePicker, setTimePicker] = useState<'start' | 'end' | null>(null);
  const requiresBuild = notificationsRequireDevelopmentBuild();

  const check = useCallback(() => {
    void getNotificationPermissionState().then(setGranted);
    void listPausedActivitiesUseCase(db).then(setPaused);
    void getSchedulePreferencesUseCase(db).then(setSchedule);
    void getNotificationPreferencesUseCase(db).then((value) => setNotificationOffsets(value.offsets));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );

  async function saveSchedule() {
    if (schedule.dayEnd <= schedule.dayStart) {
      return Alert.alert('Horario inválido', 'La hora final debe ser posterior a la inicial.');
    }
    if (schedule.minFreeMinutes < 1) {
      return Alert.alert('El espacio mínimo debe ser positivo');
    }
    await saveSchedulePreferencesUseCase(db, schedule);
    Alert.alert('Horario guardado');
  }

  async function enableNotifications() {
    if (!notificationOffsets.length) {
      return Alert.alert('Selecciona un aviso', 'Elige al menos una anticipación.');
    }
    await saveNotificationPreferencesUseCase(db, { offsets: notificationOffsets });
    if (requiresBuild) {
      return Alert.alert('Configuración guardada', 'Se aplicará al instalar la compilación de desarrollo.');
    }
    const ok = await prepareNotifications();
    setGranted(ok);
    if (!ok) {
      return Alert.alert(
        'Permiso pendiente',
        'Permite las notificaciones de Nexo en los ajustes de Android.'
      );
    }
    const blocks = await listFutureReminderBlocksUseCase(db);
    let total = 0;
    for (const block of blocks) {
      await cancelScheduledNotifications(await clearBlockRemindersUseCase(db, block.id));
      for (const notificationId of await schedulePriorityNotifications(
        block.title,
        new Date(block.starts_at),
        block.priority,
        notificationOffsets
      )) {
        await attachNotificationUseCase(
          db,
          block.id,
          notificationId,
          new Date(block.starts_at),
          block.title
        );
        total++;
      }
    }
    Alert.alert(
      'Notificaciones actualizadas',
      `${total} recordatorio(s) programados con la anticipación elegida.`
    );
  }

  async function testNotification() {
    const ok = await sendTestNotification();
    if (!ok) {
      return Alert.alert('No se pudo enviar', 'Activa primero el permiso de notificaciones.');
    }
    Alert.alert(
      'Prueba enviada',
      'Deberías recibir una notificación con sonido en unos segundos.'
    );
  }

  function picked(event: { type: string }, date?: Date) {
    if (Platform.OS === 'android') setTimePicker(null);
    if (event.type !== 'set' || !date || !timePicker) return;
    const value =
      String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    setSchedule((p) => (timePicker === 'start' ? { ...p, dayStart: value } : { ...p, dayEnd: value }));
  }

  return (
    <AppScreen>
      <PageHeader eyebrow="Ajustes" title="Tu aplicación" subtitle="Preferencias locales, horario y permisos." />
      <Card
        style={{
          borderColor: '#3B82F6',
          borderWidth: 2,
          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
          marginBottom: 12,
        }}
      >
        <Text style={[s.title, { color: '#2563EB', fontSize: 18 }]}>
          🎓 Horario Universitario Semestre 2/2026
        </Text>
        <Text style={[s.body, { color: isDark ? '#F1F5F9' : '#1E293B', fontWeight: '500' }]}>
          Carga las 6 materias oficiales (INF111, INF210, INF219, INF308, INF212, MAT202) con sus aulas, horas de estudio por tema y presupuesto de prueba.
        </Text>
        <Pressable
          style={[s.button, { backgroundColor: '#2563EB', marginTop: 10 }]}
          onPress={() => {
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
                    check();
                    Alert.alert(
                      'Éxito',
                      'Se cargaron las 6 materias oficiales, horas de estudio y finanzas del Semestre 2/2026.'
                    );
                  },
                },
              ]
            );
          }}
        >
          <Text style={[s.buttonText, { fontSize: 16, fontWeight: '900' }]}>
            🔄 Recargar Semestre 2/2026
          </Text>
        </Pressable>
      </Card>
      <Card>
        <View style={s.row}>
          <View style={s.flex}>
            <Text style={s.title}>Notificaciones</Text>
            <Text style={s.body}>
              {granted
                ? 'Activas en este dispositivo'
                : requiresBuild
                ? 'Requieren una compilación de desarrollo en Android.'
                : 'Permiso todavía no concedido'}
            </Text>
          </View>
          <Text style={s.badge}>{granted ? 'Activas' : requiresBuild ? 'Build' : 'Inactivas'}</Text>
        </View>
        <Text style={s.body}>
          Selecciona todas las anticipaciones deseadas (selección múltiple):
        </Text>
        <View style={[s.choiceRow, { flexWrap: 'wrap' }]}>
          {[
            { value: 10080, label: '1 semana' },
            { value: 4320, label: '3 días' },
            { value: 1440, label: '1 día (24 h)' },
            { value: 120, label: '2 horas' },
            { value: 60, label: '1 hora' },
            { value: 30, label: '30 min' },
            { value: 10, label: '10 min' },
          ].map((item) => (
            <Choice
              key={item.value}
              selected={notificationOffsets.includes(item.value)}
              label={item.label}
              onPress={() =>
                setNotificationOffsets((current) =>
                  current.includes(item.value)
                    ? current.filter((x) => x !== item.value)
                    : [...current, item.value]
                )
              }
            />
          ))}
        </View>
        <Text style={[s.body, { fontSize: 12, marginTop: 4 }]}>
          💡 En actividades con prioridad crítica, las notificaciones se emiten automáticamente cada día desde una semana antes.
        </Text>
        <Pressable style={s.button} onPress={enableNotifications}>
          <Text style={s.buttonText}>
            {requiresBuild
              ? 'Guardar configuración'
              : granted
              ? 'Guardar y regenerar'
              : 'Guardar y activar'}
          </Text>
        </Pressable>
        {requiresBuild ? (
          <Text style={s.body}>
            La selección se guardará; para recibir avisos reales instala la compilación de desarrollo.
          </Text>
        ) : granted ? (
          <Pressable style={s.testButton} onPress={testNotification}>
            <Text style={s.testText}>Enviar notificación de prueba</Text>
          </Pressable>
        ) : null}
      </Card>
      <Card>
        <Text style={s.title}>Apariencia</Text>
        <View style={s.choiceRow}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((x) => (
            <Choice
              key={x}
              selected={mode === x}
              label={x === 'system' ? 'Sistema' : x === 'light' ? 'Claro' : 'Oscuro'}
              onPress={() => void setMode(x)}
            />
          ))}
        </View>
      </Card>
      <Card>
        <Text style={s.title}>Horario del día</Text>
        <Text style={s.body}>Define el período usado para calcular tiempo ocupado y libre.</Text>
        <View style={s.choiceRow}>
          <TimeBox label="Comienza" value={schedule.dayStart} onPress={() => setTimePicker('start')} />
          <TimeBox label="Termina" value={schedule.dayEnd} onPress={() => setTimePicker('end')} />
        </View>
        {timePicker ? (
          <DateTimePicker
            value={toDate(timePicker === 'start' ? schedule.dayStart : schedule.dayEnd)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={picked}
          />
        ) : null}
        <Text style={s.body}>Intervalo visual</Text>
        <View style={s.choiceRow}>
          {([15, 30, 60] as const).map((x) => (
            <Choice
              key={x}
              selected={schedule.slotMinutes === x}
              label={x + ' min'}
              onPress={() => setSchedule((p) => ({ ...p, slotMinutes: x }))}
            />
          ))}
        </View>
        <Text style={s.body}>Espacio libre mínimo (minutos)</Text>
        <TextInput
          style={s.input}
          value={String(schedule.minFreeMinutes)}
          onChangeText={(x) => setSchedule((p) => ({ ...p, minFreeMinutes: Number(x) || 1 }))}
          keyboardType="number-pad"
        />
        <Toggle
          label="Ocultar actividades anteriores hoy"
          value={schedule.hidePast}
          set={(x) => setSchedule((p) => ({ ...p, hidePast: x }))}
        />
        <Toggle
          label="Mostrar sábados y domingos"
          value={schedule.showWeekends}
          set={(x) => setSchedule((p) => ({ ...p, showWeekends: x }))}
        />
        <Text style={s.body}>Vista inicial</Text>
        <View style={s.choiceRow}>
          <Choice
            selected={schedule.initialView === 'day'}
            label="Día"
            onPress={() => setSchedule((p) => ({ ...p, initialView: 'day' }))}
          />
          <Choice
            selected={schedule.initialView === 'week'}
            label="Semana"
            onPress={() => setSchedule((p) => ({ ...p, initialView: 'week' }))}
          />
        </View>
        <Pressable style={s.button} onPress={saveSchedule}>
          <Text style={s.buttonText}>Guardar horario</Text>
        </Pressable>
      </Card>
      <Card>
        <Text style={s.title}>Modo offline</Text>
        <Text style={s.body}>Activo. La información se guarda primero en SQLite.</Text>
      </Card>
      <Card>
        <Text style={s.title}>Papelera</Text>
        <Link href="/trash" asChild>
          <Pressable style={s.button}>
            <Text style={s.buttonText}>Abrir papelera</Text>
          </Pressable>
        </Link>
      </Card>
      <Card>
        <Text style={s.title}>Series pausadas</Text>
        {paused.length ? (
          paused.map((x) => (
            <View key={x.activity_id} style={s.row}>
              <Text style={[s.body, s.flex]}>{x.title}</Text>
              <Pressable
                onPress={async () => {
                  await setActivityPausedUseCase(db, x.activity_id, false);
                  check();
                }}
              >
                <Text style={s.link}>Reanudar</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={s.body}>No hay series pausadas.</Text>
        )}
      </Card>
    </AppScreen>
  );
}

function Choice({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[s.choice, selected && s.choiceOn]} onPress={onPress}>
      <Text style={selected ? s.choiceTextOn : s.body}>{label}</Text>
    </Pressable>
  );
}

function TimeBox({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.timeBox} onPress={onPress}>
      <Text style={s.body}>{label}</Text>
      <Text style={s.timeText}>{value}</Text>
    </Pressable>
  );
}

function Toggle({
  label,
  value,
  set,
}: {
  label: string;
  value: boolean;
  set: (x: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.body, s.flex]}>{label}</Text>
      <Switch value={value} onValueChange={set} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  title: { color: '#F8FAFC', fontWeight: '800', fontSize: 17 },
  body: { color: '#CBD5E1', lineHeight: 20 },
  badge: { color: '#93C5FD', fontWeight: '800' },
  button: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    padding: 13,
    alignItems: 'center',
  },
  buttonText: { color: '#FFF', fontWeight: '800' },
  testButton: {
    borderWidth: 1,
    borderColor: '#60A5FA',
    borderRadius: 12,
    padding: 13,
    alignItems: 'center',
  },
  testText: { color: '#BFDBFE', fontWeight: '800' },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#24324A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  choiceOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceTextOn: { color: '#FFF', fontWeight: '800' },
  timeBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#64748B',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
  },
  timeText: { color: '#93C5FD', fontWeight: '900', fontSize: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#64748B',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    color: '#F8FAFC',
  },
  link: { color: '#93C5FD', fontWeight: '800' },
});
