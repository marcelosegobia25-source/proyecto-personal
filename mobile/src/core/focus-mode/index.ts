import { NativeModules, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listFocusSchedulesUseCase } from '@modules/activities/usecases';

type FocusNative = {
  hasPolicyAccess(): Promise<boolean>;
  openPolicyAccessSettings(): Promise<void>;
  replaceSchedules(items: { id: string; title: string; startMs: number; endMs: number }[]): Promise<void>;
};

const native = NativeModules.NexoFocusMode as FocusNative | undefined;

export async function hasFocusAccess(): Promise<boolean> {
  return Platform.OS === 'android' && native ? native.hasPolicyAccess() : false;
}

export async function requestFocusAccess(): Promise<void> {
  if (Platform.OS === 'android' && native) {
    await native.openPolicyAccessSettings();
  }
}

export async function syncFocusSchedules(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS !== 'android' || !native) return;
  const rows = await listFocusSchedulesUseCase(db);
  await native.replaceSchedules(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      startMs: new Date(row.starts_at).getTime(),
      endMs: new Date(row.ends_at).getTime(),
    }))
  );
}
