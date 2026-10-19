export const DEMO_USER_ID = '10000000-0000-0000-0000-000000000001';

export const nowIso = (): string => new Date().toISOString();

export function todayBounds(): readonly [string, string] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()] as const;
}
