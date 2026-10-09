# Modelo de datos

```mermaid
erDiagram
  PROFILES ||--o{ ACTIVITIES : owns
  PROFILES ||--o{ ACCOUNTS : owns
  ACTIVITY_CATEGORIES ||--o{ ACTIVITIES : classifies
  ACTIVITIES ||--o{ ACTIVITY_SCHEDULES : repeats
  ACTIVITIES ||--o{ PLANNED_BLOCKS : plans
  PLANNED_BLOCKS ||--o{ TIME_SESSIONS : measures
  TIME_SESSIONS ||--o{ SESSION_PAUSES : pauses
  PLANNED_BLOCKS ||--o| ACTIVITY_VERIFICATIONS : verifies
  PROFILES ||--o{ GOALS : defines
  GOALS ||--o{ GOAL_PROGRESS : measures
  ACCOUNTS ||--o{ TRANSACTIONS : contains
  FINANCIAL_CATEGORIES ||--o{ TRANSACTIONS : classifies
  FINANCIAL_CATEGORIES ||--o{ BUDGETS : limits
  PLANNED_BLOCKS ||--o{ REMINDERS : schedules
  PROFILES ||--o{ DAILY_REFLECTIONS : writes
  PROFILES ||--o{ DEVICE_INSTALLATIONS : registers
```

## Reglas importantes

- Una actividad es una plantilla; un bloque es una ocurrencia planificada.
- Una sesión registra realidad y puede existir sin bloque para tiempo espontáneo.
- Sólo puede existir una sesión abierta por usuario.
- Cada bloque admite una verificación final.
- Los solapamientos se informan mediante `v_schedule_conflicts`; no se bloquean.
- Los importes son positivos y `kind` expresa su dirección.
- Los movimientos bloqueados se corrigen mediante reversión.
- `deleted_at` permite sincronizar eliminaciones de forma segura.
