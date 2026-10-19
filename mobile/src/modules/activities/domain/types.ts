export type BlockStatus =
  | 'planned'
  | 'late'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'rescheduled'
  | 'cancelled';

export type PlannedBlock = {
  id: string;
  activity_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: BlockStatus;
  elapsed_seconds: number | null;
  active_started_at: string | null;
  scheduled_ends_at?: string;
  shortened_minutes?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  kind?: 'activity' | 'travel' | 'preparation' | 'buffer' | 'return' | 'meal';
  color?: string;
  reason?: string | null;
  description?: string;
};

export type DayScheduleRule = {
  weekday: number;
  hour: number;
  minute: number;
  durationMinutes: number;
  preparationMinutes?: number;
  travelMinutes?: number;
  bufferMinutes?: number;
  returnTravelMinutes?: number;
};

export type CreatePlannedActivityInput = {
  title: string;
  startsAt: Date;
  endsOn?: Date;
  durationMinutes: number;
  recurrence: 'once' | 'daily' | 'weekly' | 'weekly_month' | 'weekly_year';
  weekdays?: number[];
  dayRules?: DayScheduleRule[];
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  color?: string;
  focusMode?: boolean;
  preparationMinutes?: number;
  travelMinutes?: number;
  bufferMinutes?: number;
  returnTravelMinutes?: number;
};

export type OccurrenceEditor = {
  block_id: string;
  activity_id: string;
  schedule_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  focus_mode: number;
  preparation?: number;
  travel?: number;
  buffer?: number;
  return_travel?: number;
};

export type UpdateOccurrenceInput = {
  title: string;
  startsAt: Date;
  durationMinutes: number;
  priority: OccurrenceEditor['priority'];
  focusMode: boolean;
  preparation?: number;
  travel?: number;
  buffer?: number;
  returnTravel?: number;
};

export type FlexibleActivity = {
  id: string;
  activity_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  kind: string;
};

export type DueActivityPopup = {
  id: string;
  activity_id: string;
  title: string;
  starts_at: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
};

export type ReminderBlock = {
  id: string;
  starts_at: string;
  title: string;
  deleted_at: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical';
};

export type FocusSchedule = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

export type RecoverableBlock = PlannedBlock & {
  planned_minutes: number;
  actual_minutes: number;
  pending_minutes: number;
};

export type ProgressEntry = {
  id: string;
  topic: string | null;
  pages_from: number | null;
  pages_to: number | null;
  exercises_done: number | null;
  exercises_correct: number | null;
  concentration: number | null;
  difficulty: string | null;
  next_step: string | null;
  note: string | null;
  created_at: string;
};

export type LinkableActivity = {
  id: string;
  title: string;
};
