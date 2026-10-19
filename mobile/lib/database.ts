// Re-exports from clean modules and packages for complete backwards compatibility.
export * from '@core/database';
export * from '@modules/activities';
export * from '@modules/calendar';
export * from '@modules/study';
export * from '@modules/finances';
export * from '@modules/reports';
export * from '@modules/settings';

// Explicit re-exports of specific function aliases to match previous API exactly
export {
  listTodayBlocksUseCase as listTodayBlocks,
  listDueActivityPopupsUseCase as listDueActivityPopups,
  dismissActivityPopupUseCase as dismissActivityPopup,
  listUpcomingBlocksUseCase as listUpcomingBlocks,
  createPlannedActivityUseCase as createPlannedActivity,
  createFlexibleActivityUseCase as createFlexibleActivity,
  listFlexibleActivitiesUseCase as listFlexibleActivities,
  startFlexibleActivityUseCase as startFlexibleActivity,
  attachNotificationUseCase as attachNotification,
  clearBlockRemindersUseCase as clearBlockReminders,
  listActivityReminderBlocksUseCase as listActivityReminderBlocks,
  listFutureReminderBlocksUseCase as listFutureReminderBlocks,
  listFocusSchedulesUseCase as listFocusSchedules,
  startBlockSessionUseCase as startSession,
  stopBlockSessionUseCase as stopSession,
  verifyBlockUseCase as verifyBlock,
  getOccurrenceEditorUseCase as getOccurrenceEditor,
  updateOccurrenceUseCase as updateOccurrence,
  deleteOccurrenceUseCase as deleteOccurrence,
  deleteOccurrenceAtomicUseCase as deleteOccurrenceAtomic,
  setActivityPausedUseCase as setActivityPaused,
  setActivityColorUseCase as setActivityColor,
  listPausedActivitiesUseCase as listPausedActivities,
  listTrashUseCase as listTrash,
  restoreActivityUseCase as restoreActivity,
  listRecoverableBlocksUseCase as listRecoverableBlocks,
  createRecoveryUseCase as createRecovery,
  addProgressUseCase as addProgress,
  listProgressUseCase as listProgress,
  getActivityUseCase as getActivity,
} from '@modules/activities';

export {
  listBlocksForDateUseCase as listBlocksForDate,
  countScheduleConflictsUseCase as countScheduleConflicts,
  getSchedulePreferencesUseCase as getSchedulePreferences,
  saveSchedulePreferencesUseCase as saveSchedulePreferences,
} from '@modules/calendar';

export {
  listSubjectsUseCase as listSubjects,
  addSubjectUseCase as addSubject,
  listStudyContentsUseCase as listStudyContents,
  addStudyContentUseCase as addStudyContent,
  setStudyContentStatusUseCase as setStudyContentStatus,
  getNextStudyContentUseCase as getNextStudyContent,
  getStudyPlanUseCase as getStudyPlan,
  saveStudyPlanUseCase as saveStudyPlan,
  createStudyRequestUseCase as createStudyRequest,
  listStudyRequestsUseCase as listStudyRequests,
  suggestStudySlotsUseCase as suggestStudySlots,
  scheduleStudyRequestUseCase as scheduleStudyRequest,
  startStudyRequestUseCase as startStudyRequest,
  listStudyLinkableActivitiesUseCase as listStudyLinkableActivities,
  ensureActivitySubactivitiesUseCase as ensureActivitySubactivities,
  listActivitySubactivitiesUseCase as listActivitySubactivities,
  addActivitySubactivityUseCase as addActivitySubactivity,
  getStudyActivityTargetUseCase as getStudyActivityTarget,
  saveStudyActivityTargetUseCase as saveStudyActivityTarget,
  ensureStudySubjectForActivityUseCase as ensureStudySubjectForActivity,
  getOpenStudySessionUseCase as getOpenStudySession,
  startStudySessionUseCase as startStudySession,
  startActivityExtraSessionUseCase as startActivityExtraSession,
  addActivityExtraManualUseCase as addActivityExtraManual,
  listActivityStudyProgressUseCase as listActivityStudyProgress,
  startOrResumeActivityProgressUseCase as startOrResumeActivityProgress,
  interruptStudySessionUseCase as interruptStudySession,
  stopStudySessionUseCase as stopStudySession,
  finishStudySessionUseCase as finishStudySession,
  getStudyTimeReportUseCase as getStudyTimeReport,
  getStudyActivityStatsUseCase as getStudyActivityStats,
  getActivityExtraSummaryUseCase as getActivityExtraSummary,
  getScheduledClassMinutesUseCase as getScheduledClassMinutes,
  listRecentStudySessionsUseCase as listRecentStudySessions,
} from '@modules/study';

export {
  createExpenseUseCase as createExpense,
  listTodayExpensesUseCase as listTodayExpenses,
  listExpenseTransactionsUseCase as listExpenseTransactions,
  cancelExpenseUseCase as cancelExpense,
  getExpenseTotalUseCase as getExpenseTotal,
  getExpensePeriodSummaryUseCase as getExpensePeriodSummary,
  listDailyExpenseSummaryUseCase as listDailyExpenseSummary,
  listExpenseHistorySummaryUseCase as listExpenseHistorySummary,
  getEconomicReportUseCase as getEconomicReport,
  listExpenseDefinitionsUseCase as listExpenseDefinitions,
  saveExpenseDefinitionUseCase as saveExpenseDefinition,
  useExpenseDefinitionUseCase as useExpenseDefinition,
  saveMonthlyBudgetUseCase as saveMonthlyBudget,
} from '@modules/finances';

export {
  getDailyReportUseCase as getDailyReport,
  getWeeklySummaryUseCase as getWeeklySummary,
  getActivityOutcomeReportUseCase as getActivityOutcomeReport,
  getActivityOutcomeDetailsUseCase as getActivityOutcomeDetails,
} from '@modules/reports';

export {
  getNotificationPreferencesUseCase as getNotificationPreferences,
  saveNotificationPreferencesUseCase as saveNotificationPreferences,
} from '@modules/settings';
