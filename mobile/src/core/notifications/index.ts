import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');
let configured = false;

// expoGoConfig también puede existir en un cliente de desarrollo que carga un
// manifiesto de Metro. executionEnvironment distingue correctamente Expo Go.
const isExpoGo = () => Constants.executionEnvironment === 'storeClient';

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  // SDK 57 throws while evaluating expo-notifications inside Expo Go Android.
  // A development/production build contains the complete native module.
  if (Platform.OS === 'web' || isExpoGo()) return null;
  const Notifications = await import('expo-notifications');
  if (!configured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    configured = true;
  }
  return Notifications;
}

export function notificationsRequireDevelopmentBuild(): boolean {
  return Platform.OS !== 'web' && isExpoGo();
}

export async function getNotificationPermissionState(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function prepareNotifications(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('schedule', {
      name: 'Recordatorios de actividades',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300, 180, 450],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function sendTestNotification(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !(await prepareNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Nexo',
      body: 'Las notificaciones del dispositivo funcionan correctamente.',
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 4_000),
      channelId: 'schedule',
    },
  });
  return true;
}

export async function scheduleActivityNotification(title: string, startsAt: Date) {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !(await prepareNotifications())) return null;
  const notificationDate = new Date(Math.max(Date.now() + 5_000, startsAt.getTime() - 10 * 60_000));
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ ${title}`,
      body: 'Empieza en 10 minutos. Toca para abrir tu agenda.',
      data: { url: '/' },
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notificationDate,
      channelId: 'schedule',
    },
  });
}

export function getPriorityDefaultOffsets(priority: 'low' | 'normal' | 'high' | 'critical'): number[] {
  switch (priority) {
    case 'critical':
      // Cada día a partir de 1 semana antes (7d, 6d, 5d, 4d, 3d, 2d, 1d) + avisos del mismo día (2h, 30m, 10m)
      return [
        7 * 1440,
        6 * 1440,
        5 * 1440,
        4 * 1440,
        3 * 1440,
        2 * 1440,
        1 * 1440,
        120,
        30,
        10,
      ];
    case 'high':
      // A partir de 3 días antes cada día (3d, 2d, 1d) + 2h, 30m, 10m
      return [
        3 * 1440,
        2 * 1440,
        1 * 1440,
        120,
        30,
        10,
      ];
    case 'normal':
      return [
        1 * 1440,
        60,
        15,
      ];
    case 'low':
      return [
        15,
        5,
      ];
  }
}

export async function schedulePriorityNotifications(
  title: string,
  startsAt: Date,
  priority: 'low' | 'normal' | 'high' | 'critical',
  configuredOffsets: number[] = [60]
): Promise<string[]> {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !(await prepareNotifications())) return [];
  const priorityOffsets = getPriorityDefaultOffsets(priority);
  const offsets = [...new Set([...priorityOffsets, ...configuredOffsets])]
    .filter((minutes) => minutes > 0)
    .sort((a, b) => b - a);
  const ids: string[] = [];
  for (const minutes of offsets) {
    const date = new Date(startsAt.getTime() - minutes * 60_000);
    if (date <= new Date()) continue;
    const daysLeft = Math.floor(minutes / 1440);
    const hoursLeft = Math.floor((minutes % 1440) / 60);
    const minsLeft = minutes % 60;
    let timeString = '';
    if (daysLeft > 0) timeString = `${daysLeft} día(s)${hoursLeft > 0 ? ` y ${hoursLeft} h` : ''}`;
    else if (hoursLeft > 0) timeString = `${hoursLeft} hora(s)${minsLeft > 0 ? ` y ${minsLeft} min` : ''}`;
    else timeString = `${minsLeft} minutos`;

    let notifTitle = `⏰ ${title}`;
    if (priority === 'critical') notifTitle = `⚠️ [CRÍTICA] ${title}`;
    else if (priority === 'high') notifTitle = `⚡ [ALTA] ${title}`;

    const body = priority === 'critical'
      ? `Faltan ${timeString} para ${title}. Prioridad crítica: ¡revisa tu preparación!`
      : `Faltan ${timeString} para comenzar.`;

    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notifTitle,
          body,
          data: { url: '/' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: 'schedule',
        },
      })
    );
  }
  return ids;
}

export async function cancelScheduledNotifications(ids: string[]): Promise<void> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  for (const id of ids) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}
