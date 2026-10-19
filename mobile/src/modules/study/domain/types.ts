export type StudySubject = {
  id: string;
  name: string;
  color: string;
};

export type StudyContent = {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  material_reference: string;
  position: number;
  status: 'pending' | 'in_progress' | 'completed';
};

export type StudyPlan = {
  weekly_target_minutes: number;
  session_minutes: number;
};

export type StudyRequest = {
  id: string;
  activity_id: string;
  subject_id: string;
  content_id: string | null;
  activity_title: string;
  topic: string;
  objective: string;
  duration_minutes: number;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  completed_minutes: number;
  remaining_minutes: number;
};

export type StudySlot = {
  startsAt: string;
  endsAt: string;
};

export type ActivitySubactivity = {
  id: string;
  name: string;
};

export type ActivityStudyProgress = {
  id: string;
  subactivity_id: string;
  subactivity_name: string;
  section_name: string;
  target_seconds: number | null;
  elapsed_seconds: number;
  status: 'paused' | 'in_progress' | 'completed' | 'cancelled';
  updated_at: string;
};

export type OpenStudySession = {
  id: string;
  subject_id: string;
  subject_name: string;
  topic: string | null;
  objective: string | null;
  mode: string;
  target_seconds: number | null;
  started_at: string;
  interruptions: number;
  progress_id: string | null;
  activity_id: string | null;
  progress_elapsed_seconds: number | null;
  progress_target_seconds: number | null;
};

export type StudyTimeReport = {
  name: string;
  minutes: number;
  sessions: number;
};

export type StudyActivityStats = {
  week_minutes: number;
  month_minutes: number;
  total_minutes: number;
  sessions: number;
};

export type ActivityExtraSummary = {
  name: string;
  minutes: number;
  sessions: number;
};

export type RecentStudySession = {
  id: string;
  topic: string;
  started_at: string;
  elapsed_seconds: number;
};

export const DEFAULT_SUBACTIVITIES = [
  'Clase presencial',
  'Estudio individual',
  'Resolver ejercicios',
  'Leer material',
  'Proyecto / tarea',
  'Repaso para examen',
] as const;

export type TopicDedication = {
  topic: string;
  totalMinutes: number;
  sessionsCount: number;
  totalInterruptions: number;
  lastStudiedAt: string;
};

export type DetailedStudySession = {
  id: string;
  topic: string;
  started_at: string;
  ended_at: string | null;
  elapsed_seconds: number;
  interruptions: number;
  note: string | null;
  mode: string;
};

export type CreateStudySessionInput = {
  activityId: string;
  topic: string;
  minutes: number;
  interruptions?: number;
  note?: string;
  date?: string;
};

export type UpdateStudySessionInput = {
  id: string;
  topic?: string;
  minutes?: number;
  interruptions?: number;
  note?: string;
};

export type GlobalTopicDedication = {
  activity_id: string;
  activity_title: string;
  topic: string;
  total_minutes: number;
  total_sessions: number;
  total_interruptions: number;
  last_studied_at: string;
};

