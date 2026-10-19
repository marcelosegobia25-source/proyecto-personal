import type { SQLiteDatabase } from 'expo-sqlite';
import { settingsRepository } from '../data/settingsRepository';
import type { NotificationPreferences } from '../domain/types';

export async function getNotificationPreferencesUseCase(
  db: SQLiteDatabase
): Promise<NotificationPreferences> {
  return settingsRepository.getNotificationPreferences(db);
}

export async function saveNotificationPreferencesUseCase(
  db: SQLiteDatabase,
  preferences: NotificationPreferences
): Promise<void> {
  return settingsRepository.saveNotificationPreferences(db, preferences);
}
