import type { SQLiteDatabase } from 'expo-sqlite';
import type { NotificationPreferences } from '../domain/types';

export const settingsRepository = {
  async getNotificationPreferences(db: SQLiteDatabase): Promise<NotificationPreferences> {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_preferences WHERE key='notification_offsets'`
    );
    const offsets = (row?.value ?? '60,30,5')
      .split(',')
      .map(Number)
      .filter((value) => [60, 30, 5].includes(value));
    return { offsets: offsets.length ? [...new Set(offsets)] : [60] };
  },

  async saveNotificationPreferences(
    db: SQLiteDatabase,
    p: NotificationPreferences
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO app_preferences(key,value) VALUES('notification_offsets',?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      p.offsets.join(',')
    );
  },
};
