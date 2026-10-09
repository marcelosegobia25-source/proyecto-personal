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
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    configured = true;
  }
  return Notifications;
}

export function notificationsRequireDevelopmentBuild() {
  return Platform.OS !== 'web' && isExpoGo();
}

export async function getNotificationPermissionState() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function prepareNotifications() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('schedule', {
      name: 'Recordatorios de actividades', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300, 180, 450], enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function sendTestNotification() {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !(await prepareNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: '🔔 Mi Día', body: 'Las notificaciones del dispositivo funcionan correctamente.', sound: true, priority: Notifications.AndroidNotificationPriority.MAX },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 4_000), channelId: 'schedule' },
  });
  return true;
}

export async function scheduleActivityNotification(title: string, startsAt: Date) {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !(await prepareNotifications())) return null;
  const notificationDate = new Date(Math.max(Date.now() + 5_000, startsAt.getTime() - 10 * 60_000));
  return Notifications.scheduleNotificationAsync({
    content: { title: `⏰ ${title}`, body: 'Empieza en 10 minutos. Toca para abrir tu agenda.', data: { url: '/' }, sound: true, priority: Notifications.AndroidNotificationPriority.MAX },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notificationDate, channelId: 'schedule' },
  });
}

export async function schedulePriorityNotifications(title:string,startsAt:Date,priority:'low'|'normal'|'high'|'critical',configuredOffsets:number[]=[60]){
  const Notifications=await getNotificationsModule();if(!Notifications||!(await prepareNotifications()))return [];
  const offsets=[...new Set(configuredOffsets)].filter(minutes=>minutes>0).sort((a,b)=>b-a);
  const ids:string[]=[];for(const minutes of offsets){const date=new Date(startsAt.getTime()-minutes*60_000);if(date<=new Date())continue;ids.push(await Notifications.scheduleNotificationAsync({content:{title:priority==='critical'?`⚠️ ${title}`:`⏰ ${title}`,body:`Faltan ${minutes>=1440?`${Math.round(minutes/1440)} día(s)`:minutes>=60?`${Math.round(minutes/60)} hora(s)`:`${minutes} minutos`}.`,data:{url:'/'},sound:true,priority:Notifications.AndroidNotificationPriority.MAX},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date,channelId:'schedule'}}))}return ids;
}
export async function cancelScheduledNotifications(ids:string[]){const Notifications=await getNotificationsModule();if(!Notifications)return;for(const id of ids)await Notifications.cancelScheduledNotificationAsync(id)}
