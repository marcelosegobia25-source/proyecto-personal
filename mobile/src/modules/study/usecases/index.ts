import type { SQLiteDatabase } from 'expo-sqlite';
import type { LinkableActivity } from '@modules/activities/domain/types';
import { studyRepository } from '../data/studyRepository';
import type {
  ActivityExtraSummary,
  ActivityStudyProgress,
  ActivitySubactivity,
  CreateStudySessionInput,
  DetailedStudySession,
  OpenStudySession,
  RecentStudySession,
  StudyActivityStats,
  StudyContent,
  StudyPlan,
  StudyRequest,
  StudySlot,
  StudySubject,
  StudyTimeReport,
  TopicDedication,
  UpdateStudySessionInput,
  GlobalTopicDedication,
} from '../domain/types';

export async function listSubjectsUseCase(db: SQLiteDatabase): Promise<StudySubject[]> {
  return studyRepository.listSubjects(db);
}

export async function addSubjectUseCase(db: SQLiteDatabase, name: string): Promise<string> {
  return studyRepository.addSubject(db, name);
}

export async function listStudyContentsUseCase(
  db: SQLiteDatabase,
  subjectId: string
): Promise<StudyContent[]> {
  return studyRepository.listStudyContents(db, subjectId);
}

export async function addStudyContentUseCase(
  db: SQLiteDatabase,
  subjectId: string,
  title: string,
  description: string,
  materialReference: string
): Promise<string> {
  return studyRepository.addStudyContent(db, subjectId, title, description, materialReference);
}

export async function setStudyContentStatusUseCase(
  db: SQLiteDatabase,
  id: string,
  status: StudyContent['status']
): Promise<void> {
  return studyRepository.setStudyContentStatus(db, id, status);
}

export async function getNextStudyContentUseCase(
  db: SQLiteDatabase,
  subjectId: string
): Promise<StudyContent | null> {
  return studyRepository.getNextStudyContent(db, subjectId);
}

export async function getStudyPlanUseCase(
  db: SQLiteDatabase,
  subjectId: string
): Promise<StudyPlan | null> {
  return studyRepository.getStudyPlan(db, subjectId);
}

export async function saveStudyPlanUseCase(
  db: SQLiteDatabase,
  subjectId: string,
  weeklyMinutes: number,
  sessionMinutes: number
): Promise<void> {
  return studyRepository.saveStudyPlan(db, subjectId, weeklyMinutes, sessionMinutes);
}

export async function createStudyRequestUseCase(
  db: SQLiteDatabase,
  input: {
    activityId: string;
    subjectId: string;
    contentId?: string;
    topic: string;
    objective: string;
    durationMinutes: number;
    preferredDate?: string;
    preferredTime?: string;
  }
): Promise<string> {
  return studyRepository.createStudyRequest(db, input);
}

export async function listStudyRequestsUseCase(db: SQLiteDatabase): Promise<StudyRequest[]> {
  return studyRepository.listStudyRequests(db);
}

export async function suggestStudySlotsUseCase(
  db: SQLiteDatabase,
  durationMinutes: number,
  preferredDate?: string | null,
  preferredTime?: string | null
): Promise<StudySlot[]> {
  return studyRepository.suggestStudySlots(db, durationMinutes, preferredDate, preferredTime);
}

export async function scheduleStudyRequestUseCase(
  db: SQLiteDatabase,
  request: StudyRequest,
  start: Date
): Promise<string> {
  return studyRepository.scheduleStudyRequest(db, request, start);
}

export async function startStudyRequestUseCase(
  db: SQLiteDatabase,
  request: StudyRequest,
  targetMinutes?: number
): Promise<string> {
  return studyRepository.startStudyRequest(db, request, targetMinutes);
}

export async function listStudyLinkableActivitiesUseCase(
  db: SQLiteDatabase
): Promise<LinkableActivity[]> {
  return studyRepository.listStudyLinkableActivities(db);
}

export async function ensureActivitySubactivitiesUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<void> {
  return studyRepository.ensureActivitySubactivities(db, activityId);
}

export async function listActivitySubactivitiesUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<ActivitySubactivity[]> {
  return studyRepository.listActivitySubactivities(db, activityId);
}

export async function addActivitySubactivityUseCase(
  db: SQLiteDatabase,
  activityId: string,
  name: string
): Promise<string> {
  return studyRepository.addActivitySubactivity(db, activityId, name);
}

export async function getStudyActivityTargetUseCase(
  db: SQLiteDatabase,
  subjectId: string
): Promise<{ activity_id: string; weekly_target_minutes: number } | null> {
  return studyRepository.getStudyActivityTarget(db, subjectId);
}

export async function saveStudyActivityTargetUseCase(
  db: SQLiteDatabase,
  subjectId: string,
  activityId: string,
  weeklyMinutes: number
): Promise<void> {
  return studyRepository.saveStudyActivityTarget(db, subjectId, activityId, weeklyMinutes);
}

export async function ensureStudySubjectForActivityUseCase(
  db: SQLiteDatabase,
  activity: LinkableActivity
): Promise<string> {
  return studyRepository.ensureStudySubjectForActivity(db, activity);
}

export async function getOpenStudySessionUseCase(
  db: SQLiteDatabase
): Promise<OpenStudySession | null> {
  return studyRepository.getOpenStudySession(db);
}

export async function startStudySessionUseCase(
  db: SQLiteDatabase,
  subjectId: string,
  topic: string,
  objective: string,
  mode: string,
  targetSeconds: number | null,
  activityId?: string,
  contentId?: string,
  subactivityId?: string,
  progressId?: string
): Promise<string> {
  return studyRepository.startStudySession(
    db,
    subjectId,
    topic,
    objective,
    mode,
    targetSeconds,
    activityId,
    contentId,
    subactivityId,
    progressId
  );
}

export async function startActivityExtraSessionUseCase(
  db: SQLiteDatabase,
  activity: LinkableActivity,
  subactivity: ActivitySubactivity
): Promise<string> {
  return studyRepository.startActivityExtraSession(db, activity, subactivity);
}

export async function addActivityExtraManualUseCase(
  db: SQLiteDatabase,
  activity: LinkableActivity,
  subactivity: ActivitySubactivity,
  minutes: number
): Promise<string> {
  return studyRepository.addActivityExtraManual(db, activity, subactivity, minutes);
}

export async function listActivityStudyProgressUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<ActivityStudyProgress[]> {
  return studyRepository.listActivityStudyProgress(db, activityId);
}

export async function startOrResumeActivityProgressUseCase(
  db: SQLiteDatabase,
  activity: LinkableActivity,
  subactivity: ActivitySubactivity,
  sectionName: string,
  targetMinutes?: number
): Promise<string> {
  return studyRepository.startOrResumeActivityProgress(
    db,
    activity,
    subactivity,
    sectionName,
    targetMinutes
  );
}

export async function interruptStudySessionUseCase(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  return studyRepository.interruptStudySession(db, id);
}

export async function stopStudySessionUseCase(
  db: SQLiteDatabase,
  id: string,
  note = ''
): Promise<void> {
  return studyRepository.stopStudySession(db, id, note);
}

export async function finishStudySessionUseCase(
  db: SQLiteDatabase,
  id: string,
  note = ''
): Promise<void> {
  return studyRepository.finishStudySession(db, id, note);
}

export async function getStudyTimeReportUseCase(
  db: SQLiteDatabase,
  days = 7
): Promise<StudyTimeReport[]> {
  return studyRepository.getStudyTimeReport(db, days);
}

export async function getStudyActivityStatsUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<StudyActivityStats> {
  return studyRepository.getStudyActivityStats(db, activityId);
}

export async function getActivityExtraSummaryUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<ActivityExtraSummary[]> {
  return studyRepository.getActivityExtraSummary(db, activityId);
}

export async function getScheduledClassMinutesUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<number> {
  return studyRepository.getScheduledClassMinutes(db, activityId);
}

export async function listRecentStudySessionsUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<RecentStudySession[]> {
  return studyRepository.listRecentStudySessions(db, activityId);
}

export async function getTopicDedicationSummaryUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<TopicDedication[]> {
  return studyRepository.getTopicDedicationSummary(db, activityId);
}

export async function listActivityStudySessionsUseCase(
  db: SQLiteDatabase,
  activityId: string
): Promise<DetailedStudySession[]> {
  return studyRepository.listActivityStudySessions(db, activityId);
}

export async function createManualStudySessionUseCase(
  db: SQLiteDatabase,
  input: CreateStudySessionInput
): Promise<string> {
  return studyRepository.createManualStudySession(db, input);
}

export async function updateStudySessionUseCase(
  db: SQLiteDatabase,
  input: UpdateStudySessionInput
): Promise<void> {
  return studyRepository.updateStudySession(db, input);
}

export async function deleteStudySessionUseCase(
  db: SQLiteDatabase,
  sessionId: string
): Promise<void> {
  return studyRepository.deleteStudySession(db, sessionId);
}

export async function getAllTopicDedicationsUseCase(
  db: SQLiteDatabase
): Promise<GlobalTopicDedication[]> {
  return studyRepository.getAllTopicDedications(db);
}

export type { GlobalTopicDedication };


