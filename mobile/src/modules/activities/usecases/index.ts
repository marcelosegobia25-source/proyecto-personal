import type { SQLiteDatabase } from 'expo-sqlite';
import { activitiesRepository } from '../data/activitiesRepository';
import type {
  CreatePlannedActivityInput,
  DueActivityPopup,
  FlexibleActivity,
  FocusSchedule,
  OccurrenceEditor,
  PlannedBlock,
  ProgressEntry,
  RecoverableBlock,
  ReminderBlock,
  UpdateOccurrenceInput,
} from '../domain/types';

export async function createPlannedActivityUseCase(
  db: SQLiteDatabase,
  input: CreatePlannedActivityInput
) {
  return activitiesRepository.createPlannedActivity(db, input);
}

export async function listTodayBlocksUseCase(db: SQLiteDatabase): Promise<PlannedBlock[]> {
  return activitiesRepository.listTodayBlocks(db);
}

export async function listUpcomingBlocksUseCase(db: SQLiteDatabase): Promise<PlannedBlock[]> {
  return activitiesRepository.listUpcomingBlocks(db);
}

export async function listDueActivityPopupsUseCase(db: SQLiteDatabase): Promise<DueActivityPopup[]> {
  return activitiesRepository.listDueActivityPopups(db);
}

export async function dismissActivityPopupUseCase(db: SQLiteDatabase, blockId: string): Promise<void> {
  return activitiesRepository.dismissActivityPopup(db, blockId);
}

export async function startBlockSessionUseCase(db: SQLiteDatabase, block: PlannedBlock): Promise<void> {
  return activitiesRepository.startSession(db, block);
}

export async function stopBlockSessionUseCase(db: SQLiteDatabase, blockId: string): Promise<void> {
  return activitiesRepository.stopSession(db, blockId);
}

export async function verifyBlockUseCase(
  db: SQLiteDatabase,
  blockId: string,
  result: 'completed' | 'partial' | 'skipped' | 'cancelled',
  reason?: string,
  shortenedMinutes?: number
): Promise<void> {
  return activitiesRepository.verifyBlock(db, blockId, result, reason, shortenedMinutes);
}

export async function getOccurrenceEditorUseCase(
  db: SQLiteDatabase,
  blockId: string
): Promise<OccurrenceEditor | null> {
  return activitiesRepository.getOccurrenceEditor(db, blockId);
}

export async function updateOccurrenceUseCase(
  db: SQLiteDatabase,
  item: OccurrenceEditor,
  input: UpdateOccurrenceInput,
  scope: 'one' | 'future' | 'all'
): Promise<void> {
  return activitiesRepository.updateOccurrence(db, item, input, scope);
}

export async function deleteOccurrenceUseCase(
  db: SQLiteDatabase,
  item: OccurrenceEditor,
  scope: 'one' | 'future' | 'all'
): Promise<void> {
  return activitiesRepository.deleteOccurrence(db, item, scope);
}

export async function deleteOccurrenceAtomicUseCase(
  db: SQLiteDatabase,
  item: OccurrenceEditor,
  scope: 'one' | 'future' | 'all'
): Promise<void> {
  return activitiesRepository.deleteOccurrenceAtomic(db, item, scope);
}

export async function setActivityPausedUseCase(
  db: SQLiteDatabase,
  activityId: string,
  paused: boolean
): Promise<void> {
  return activitiesRepository.setActivityPaused(db, activityId, paused);
}

export async function setActivityColorUseCase(
  db: SQLiteDatabase,
  activityId: string,
  color: string
): Promise<void> {
  return activitiesRepository.setActivityColor(db, activityId, color);
}

export async function listPausedActivitiesUseCase(
  db: SQLiteDatabase
): Promise<{ activity_id: string; title: string }[]> {
  return activitiesRepository.listPausedActivities(db);
}

export async function listTrashUseCase(
  db: SQLiteDatabase
): Promise<{ activity_id: string; title: string; deleted_at: string }[]> {
  return activitiesRepository.listTrash(db);
}

export async function restoreActivityUseCase(db: SQLiteDatabase, activityId: string): Promise<void> {
  return activitiesRepository.restoreActivity(db, activityId);
}

export async function createFlexibleActivityUseCase(
  db: SQLiteDatabase,
  input: { title: string; description?: string; durationMinutes: number; kind?: string }
): Promise<string> {
  return activitiesRepository.createFlexibleActivity(db, input);
}

export async function listFlexibleActivitiesUseCase(
  db: SQLiteDatabase,
  kind?: string
): Promise<FlexibleActivity[]> {
  return activitiesRepository.listFlexibleActivities(db, kind);
}

export async function startFlexibleActivityUseCase(
  db: SQLiteDatabase,
  item: FlexibleActivity
): Promise<string> {
  return activitiesRepository.startFlexibleActivity(db, item);
}

export async function listRecoverableBlocksUseCase(db: SQLiteDatabase): Promise<RecoverableBlock[]> {
  return activitiesRepository.listRecoverableBlocks(db);
}

export async function createRecoveryUseCase(
  db: SQLiteDatabase,
  original: PlannedBlock,
  startsAt: Date
): Promise<string> {
  return activitiesRepository.createRecovery(db, original, startsAt);
}

export async function addProgressUseCase(
  db: SQLiteDatabase,
  activityId: string,
  blockId: string | null,
  input: Omit<ProgressEntry, 'id' | 'created_at'>
): Promise<void> {
  return activitiesRepository.addProgress(db, activityId, blockId, input);
}

export async function listProgressUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<ProgressEntry[]> {
  return activitiesRepository.listProgress(db, activityId);
}

export async function getActivityUseCase(
  db: SQLiteDatabase,
  id: string
): Promise<{ id: string; title: string; color: string } | null> {
  return activitiesRepository.getActivity(db, id);
}

export async function attachNotificationUseCase(
  db: SQLiteDatabase,
  blockId: string,
  notificationId: string,
  remindAt: Date,
  title: string
): Promise<void> {
  return activitiesRepository.attachNotification(db, blockId, notificationId, remindAt, title);
}

export async function clearBlockRemindersUseCase(
  db: SQLiteDatabase,
  blockId: string
): Promise<string[]> {
  return activitiesRepository.clearBlockReminders(db, blockId);
}

export async function listActivityReminderBlocksUseCase(
  db: SQLiteDatabase,
  activityId: string,
  includeDeleted = false
): Promise<ReminderBlock[]> {
  return activitiesRepository.listActivityReminderBlocks(db, activityId, includeDeleted);
}

export async function listFutureReminderBlocksUseCase(db: SQLiteDatabase): Promise<ReminderBlock[]> {
  return activitiesRepository.listFutureReminderBlocks(db);
}

export async function listFocusSchedulesUseCase(db: SQLiteDatabase): Promise<FocusSchedule[]> {
  return activitiesRepository.listFocusSchedules(db);
}

export async function purgeTravelBlocksUseCase(db: SQLiteDatabase): Promise<void> {
  return activitiesRepository.purgeTravelBlocks(db);
}

export async function deleteActivityUseCase(db: SQLiteDatabase, activityId: string): Promise<void> {
  return activitiesRepository.deleteActivity(db, activityId);
}

export async function updateActivityTitleUseCase(
  db: SQLiteDatabase,
  activityId: string,
  title: string
): Promise<void> {
  return activitiesRepository.updateActivityTitle(db, activityId, title);
}

