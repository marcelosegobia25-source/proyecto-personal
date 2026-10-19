import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { DEMO_USER_ID, nowIso } from './types';

export const CURRENT_SEED_VERSION = 'semester-2-2026-v2';

export async function resetAndSeedRequestedSchedule(db: SQLiteDatabase, force = false): Promise<void> {
  const current = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key=?',
    'seed_version'
  );
  if (!force && current?.value === CURRENT_SEED_VERSION) return;

  let seedStep = 'limpieza';
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      // 1. Limpieza total de datos existentes
      const tables = [
        'change_audit',
        'reminders',
        'activity_popup_dismissals',
        'schedule_exceptions',
        'schedule_rules',
        'schedule_occurrences',
        'auxiliary_blocks',
        'recovery_links',
        'progress_entries',
        'activity_verifications',
        'time_sessions',
        'study_request_sessions',
        'study_requests',
        'planned_blocks',
        'activity_schedules',
        'flexible_activities',
        'activity_details',
        'study_session_links',
        'study_sessions',
        'activity_study_progress',
        'study_activity_targets',
        'study_plans',
        'study_activity_subjects',
        'study_contents',
        'study_subjects',
        'activity_subactivities',
        'expense_definitions',
        'budgets',
        'transactions',
        'sync_outbox',
        'activity_options',
        'activities',
      ];
      for (const table of tables) {
        await tx.execAsync(`DELETE FROM ${table};`);
      }

      seedStep = 'actividades y materias';
      const timestamp = nowIso();

      // Definición de las 6 materias oficiales del usuario para el semestre 2/2026
      const subjectDefinitions = [
        {
          id: 'act-inf111',
          subjectId: 'subj-inf111',
          code: 'INF111',
          group: 'I1',
          title: 'Arquitectura de Computadores',
          color: '#2563EB', // Azul
          priority: 'high' as const,
          focusMode: 0,
          slots: [
            { weekday: 1, startHour: 17, startMinute: 30, duration: 90, room: '236-34' }, // Lu 17:30-19:00
            { weekday: 3, startHour: 17, startMinute: 30, duration: 90, room: '236-34' }, // Mi 17:30-19:00
            { weekday: 5, startHour: 17, startMinute: 30, duration: 90, room: '236-34' }, // Vi 17:30-19:00
          ],
          studySessions: [
            { topic: 'Compuertas lógicas y circuitos combinacionales', minutes: 60, interruptions: 0 },
            { topic: 'Arquitectura Von Neumann y buses', minutes: 75, interruptions: 1 },
            { topic: 'Jerarquía de memoria y caché L1/L2', minutes: 90, interruptions: 0 },
          ],
        },
        {
          id: 'act-inf210',
          subjectId: 'subj-inf210',
          code: 'INF210',
          group: 'SA',
          title: 'Programación II',
          color: '#16A34A', // Verde
          priority: 'critical' as const,
          focusMode: 1,
          slots: [
            { weekday: 2, startHour: 13, startMinute: 45, duration: 135, room: '236-16' }, // Ma 13:45-16:00
            { weekday: 4, startHour: 13, startMinute: 45, duration: 135, room: '236-46' }, // Ju 13:45-16:00
          ],
          studySessions: [
            { topic: 'Punteros y aritmética de punteros en C++', minutes: 90, interruptions: 1 },
            { topic: 'Gestión de memoria dinámica (new/delete)', minutes: 80, interruptions: 0 },
            { topic: 'Clases abstractas, interfaces y polimorfismo', minutes: 120, interruptions: 2 },
            { topic: 'Recursividad y árboles binarios de búsqueda', minutes: 105, interruptions: 0 },
          ],
        },
        {
          id: 'act-inf219',
          subjectId: 'subj-inf219',
          code: 'INF219',
          group: 'SC',
          title: 'Ingeniería de Requisitos y Modelado',
          color: '#7C3AED', // Púrpura
          priority: 'high' as const,
          focusMode: 0,
          slots: [
            { weekday: 1, startHour: 7, startMinute: 0, duration: 90, room: '236-45' }, // Lu 07:00-08:30
            { weekday: 3, startHour: 7, startMinute: 0, duration: 90, room: '236-43' }, // Mi 07:00-08:30
            { weekday: 5, startHour: 7, startMinute: 0, duration: 90, room: '236-25' }, // Vi 07:00-08:30
          ],
          studySessions: [
            { topic: 'Levantamiento de requisitos funcionales y no funcionales', minutes: 60, interruptions: 0 },
            { topic: 'Diagramas de casos de uso y especificaciones', minutes: 90, interruptions: 1 },
            { topic: 'Diagramas de secuencia y robustez', minutes: 80, interruptions: 0 },
          ],
        },
        {
          id: 'act-inf308',
          subjectId: 'subj-inf308',
          code: 'INF308',
          group: 'SA',
          title: 'Legislación Informática y Ética',
          color: '#D97706', // Ámbar
          priority: 'normal' as const,
          focusMode: 0,
          slots: [
            { weekday: 3, startHour: 14, startMinute: 30, duration: 135, room: '236-22' }, // Mi 14:30-16:45
            { weekday: 6, startHour: 14, startMinute: 30, duration: 135, room: '236-21' }, // Sa 14:30-16:45
          ],
          studySessions: [
            { topic: 'Leyes bolivianas de delitos informáticos', minutes: 60, interruptions: 0 },
            { topic: 'Propiedad intelectual y licencias de software (GPL, MIT, Apache)', minutes: 75, interruptions: 1 },
          ],
        },
        {
          id: 'act-inf212',
          subjectId: 'subj-inf212',
          code: 'INF212',
          group: 'SB',
          title: 'Base de Datos II',
          color: '#0891B2', // Cian
          priority: 'critical' as const,
          focusMode: 1,
          slots: [
            { weekday: 3, startHour: 10, startMinute: 45, duration: 135, room: '236-23' }, // Mi 10:45-13:00
            { weekday: 5, startHour: 10, startMinute: 45, duration: 135, room: '236-46' }, // Vi 10:45-13:00
          ],
          studySessions: [
            { topic: 'Álgebra relacional y cálculo relacional', minutes: 90, interruptions: 0 },
            { topic: 'Normalización (1FN, 2FN, 3FN y BCNF)', minutes: 120, interruptions: 1 },
            { topic: 'Optimización de consultas complejas SQL con JOINs', minutes: 110, interruptions: 2 },
          ],
        },
        {
          id: 'act-mat202',
          subjectId: 'subj-mat202',
          code: 'MAT202',
          group: 'SD',
          title: 'Probabilidad y Estadística I',
          color: '#DC2626', // Rojo
          priority: 'high' as const,
          focusMode: 0,
          slots: [
            { weekday: 2, startHour: 18, startMinute: 15, duration: 135, room: '236-12' }, // Ma 18:15-20:30
            { weekday: 4, startHour: 18, startMinute: 15, duration: 135, room: '236-33' }, // Ju 18:15-20:30
          ],
          studySessions: [
            { topic: 'Probabilidad condicional y Teorema de Bayes', minutes: 90, interruptions: 1 },
            { topic: 'Variables aleatorias discretas: Binomial y Poisson', minutes: 85, interruptions: 0 },
            { topic: 'Variables continuas y Distribución Normal Estándar', minutes: 100, interruptions: 1 },
          ],
        },
      ];

      // Insertar cada actividad, opción y materia de estudio
      for (const item of subjectDefinitions) {
        await tx.runAsync(
          `INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?)`,
          item.id,
          DEMO_USER_ID,
          '20000000-0000-0000-0000-000000000001',
          item.title,
          item.slots[0].duration,
          timestamp,
          timestamp
        );

        await tx.runAsync(
          `INSERT INTO activity_options(activity_id,priority,is_paused,color,focus_mode)
           VALUES(?,?,?,?,?)`,
          item.id,
          item.priority,
          0,
          item.color,
          item.focusMode
        );

        const roomDesc = item.slots.map((s) => `Aula ${s.room}`).join(' · ');
        await tx.runAsync(
          `INSERT INTO activity_details(activity_id,description) VALUES(?,?)`,
          item.id,
          `${item.code} - Grupo ${item.group} · Presencial · ${roomDesc}`
        );

        // Schedule maestro
        const scheduleId = `sched-${item.id}`;
        await tx.runAsync(
          `INSERT INTO activity_schedules(id,user_id,activity_id,recurrence,starts_on,ends_on,local_start_time,duration_minutes,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          scheduleId,
          DEMO_USER_ID,
          item.id,
          'weekly',
          '2026-09-01',
          '2026-12-20',
          `${String(item.slots[0].startHour).padStart(2, '0')}:${String(item.slots[0].startMinute).padStart(2, '0')}`,
          item.slots[0].duration,
          timestamp,
          timestamp
        );

        for (const slot of item.slots) {
          await tx.runAsync(
            `INSERT INTO schedule_rules(id,user_id,schedule_id,weekday,local_start_time,duration_minutes,preparation_minutes,travel_out_minutes,buffer_minutes,travel_return_minutes)
             VALUES(?,?,?,?,?,?,0,0,0,0)`,
            Crypto.randomUUID(),
            DEMO_USER_ID,
            scheduleId,
            slot.weekday,
            `${String(slot.startHour).padStart(2, '0')}:${String(slot.startMinute).padStart(2, '0')}`,
            slot.duration
          );
        }

        // Crear materia para el cronómetro de estudio
        await tx.runAsync(
          `INSERT INTO study_subjects(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)`,
          item.subjectId,
          DEMO_USER_ID,
          item.title,
          item.color,
          timestamp
        );

        await tx.runAsync(
          `INSERT INTO study_activity_subjects(activity_id,subject_id,user_id) VALUES(?,?,?)`,
          item.id,
          item.subjectId,
          DEMO_USER_ID
        );
      }

      seedStep = 'generar bloques de clases';
      // Rango de fechas: Desde el lunes 5 de octubre de 2026 hasta el domingo 15 de noviembre de 2026
      // (6 semanas de clases para un calendario completo y realista)
      const startDate = new Date(2026, 9, 5, 0, 0, 0, 0); // 5 Oct 2026
      const endDate = new Date(2026, 10, 15, 23, 59, 59, 0); // 15 Nov 2026
      const nowDate = new Date(2026, 9, 18, 21, 30, 0, 0); // Momento actual (18 Octubre 2026)

      let blockCount = 0;
      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        const weekday = cursor.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const day = cursor.getDate();

        for (const item of subjectDefinitions) {
          const matchingSlots = item.slots.filter((s) => s.weekday === weekday);
          for (const slot of matchingSlots) {
            blockCount++;
            const blockId = `block-${item.code.toLowerCase()}-${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}-${slot.startHour}`;
            const blockStart = new Date(year, month, day, slot.startHour, slot.startMinute, 0, 0);
            const blockEnd = new Date(blockStart.getTime() + slot.duration * 60_000);

            let status = 'planned';
            let reason: string | null = null;
            let actualEnd = blockEnd.toISOString();
            let shortenedMinutes = 0;
            let completionPercent = 100;

            const isPast = blockEnd.getTime() <= nowDate.getTime();

            if (isPast) {
              // Simulamos casos realistas de suspensión y conclusión anticipada para probar el sistema:
              if (item.code === 'INF111' && day === 16 && month === 9) {
                // Viernes 16 de Octubre: Suspensión por falta de docente
                status = 'skipped';
                reason = 'Falta de docente';
                completionPercent = 0;
                actualEnd = blockStart.toISOString();
                shortenedMinutes = slot.duration;
              } else if (item.code === 'INF308' && day === 10 && month === 9) {
                // Sábado 10 de Octubre: No asistencia / Motivo personal
                status = 'skipped';
                reason = 'No asistencia / Motivo personal';
                completionPercent = 0;
                actualEnd = blockStart.toISOString();
                shortenedMinutes = slot.duration;
              } else if (item.code === 'MAT202' && day === 15 && month === 9) {
                // Jueves 15 de Octubre: Concluyó antes
                status = 'partial';
                reason = 'Concluyó antes';
                completionPercent = 65;
                shortenedMinutes = 45;
                actualEnd = new Date(blockEnd.getTime() - 45 * 60_000).toISOString();
              } else {
                // En caso de no haber marcado nada en el pasado, se considera realizada con normalidad
                status = 'completed';
                reason = null;
                completionPercent = 100;
                actualEnd = blockEnd.toISOString();
                shortenedMinutes = 0;
              }
            }

            await tx.runAsync(
              `INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?)`,
              blockId,
              DEMO_USER_ID,
              item.id,
              blockStart.toISOString(),
              blockEnd.toISOString(),
              status,
              timestamp,
              timestamp
            );

            await tx.runAsync(
              `INSERT INTO schedule_occurrences(schedule_id,block_id) VALUES(?,?)`,
              `sched-${item.id}`,
              blockId
            );

            if (isPast) {
              await tx.runAsync(
                `INSERT INTO activity_verifications(id,user_id,planned_block_id,result,completion_percent,reason,actual_end_at,shortened_minutes,verified_at,created_at,updated_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
                `verif-${blockId}`,
                DEMO_USER_ID,
                blockId,
                status,
                completionPercent,
                reason,
                actualEnd,
                shortenedMinutes,
                timestamp,
                timestamp,
                timestamp
              );
            }
          }
        }
      }

      seedStep = 'sesiones de estudio por tema';
      let sessionIndex = 1;
      for (const item of subjectDefinitions) {
        for (const session of item.studySessions) {
          const sessId = `study-sess-${item.code.toLowerCase()}-${sessionIndex++}`;
          // Distribuir sesiones en los últimos 12 días
          const daysAgo = (sessionIndex % 10) + 1;
          const sessEnd = new Date(nowDate.getTime() - daysAgo * 24 * 60 * 60_000);
          sessEnd.setHours(20, 0, 0, 0);
          const sessStart = new Date(sessEnd.getTime() - session.minutes * 60_000);

          await tx.runAsync(
            `INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at,ended_at,elapsed_seconds,interruptions,note)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            sessId,
            DEMO_USER_ID,
            item.subjectId,
            session.topic,
            `Dedicación a ${session.topic}`,
            'duration',
            session.minutes * 60,
            sessStart.toISOString(),
            sessEnd.toISOString(),
            session.minutes * 60,
            session.interruptions,
            session.interruptions > 0 ? `Se tuvieron ${session.interruptions} interrupciones durante la sesión.` : 'Sesión continua y enfocada.'
          );

          await tx.runAsync(
            `INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id) VALUES(?,?,?,?)`,
            sessId,
            item.id,
            null,
            null
          );
        }
      }

      seedStep = 'finanzas y gastos';
      // Cuentas de dinero
      await tx.runAsync(
        `INSERT OR REPLACE INTO accounts(id,user_id,name,currency_code,opening_balance,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        'acc-efectivo',
        DEMO_USER_ID,
        'Efectivo',
        'BOB',
        350.0,
        timestamp,
        timestamp
      );

      await tx.runAsync(
        `INSERT OR REPLACE INTO accounts(id,user_id,name,currency_code,opening_balance,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        'acc-debito',
        DEMO_USER_ID,
        'Tarjeta Débito BNB',
        'BOB',
        1450.0,
        timestamp,
        timestamp
      );

      // Presupuesto mensual
      const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
      const monthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0);
      await tx.runAsync(
        `INSERT INTO budgets(id,user_id,category_id,period_start,period_end,amount,currency_code)
         VALUES(?,?,?,?,?,?,?)`,
        'budget-mensual-oct',
        DEMO_USER_ID,
        '90000000-0000-0000-0000-000000000001',
        monthStart.toISOString().slice(0, 10),
        monthEnd.toISOString().slice(0, 10),
        950.0,
        'BOB'
      );

      // Gastos reales para probar el módulo económico
      const expenses = [
        { id: 'exp-1', daysAgo: 12, account: 'acc-debito', category: '90000000-0000-0000-0000-000000000014', amount: 85.0, note: 'Libro digital Arquitectura de Computadores' },
        { id: 'exp-2', daysAgo: 10, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000014', amount: 18.0, note: 'Fotocopias Álgebra Relacional - BD II' },
        { id: 'exp-3', daysAgo: 8, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000012', amount: 25.0, note: 'Almuerzo en comedor universitario' },
        { id: 'exp-4', daysAgo: 7, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000014', amount: 30.0, note: 'Pasajes transporte público semanal' },
        { id: 'exp-5', daysAgo: 6, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000014', amount: 22.0, note: 'Cuaderno espiral 100 hojas INF210' },
        { id: 'exp-6', daysAgo: 5, account: 'acc-debito', category: '90000000-0000-0000-0000-000000000014', amount: 20.0, note: 'Recarga de saldo y datos móviles campus' },
        { id: 'exp-7', daysAgo: 4, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000011', amount: 12.0, note: 'Desayuno café con empanada' },
        { id: 'exp-8', daysAgo: 3, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000012', amount: 26.0, note: 'Almuerzo menú estudiantil' },
        { id: 'exp-9', daysAgo: 2, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000014', amount: 15.0, note: 'Impresión de guía laboratorio Requisitos' },
        { id: 'exp-10', daysAgo: 1, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000013', amount: 22.0, note: 'Cena rápida cerca del campus' },
        { id: 'exp-11', daysAgo: 0, account: 'acc-efectivo', category: '90000000-0000-0000-0000-000000000012', amount: 25.0, note: 'Almuerzo del día' },
      ];

      for (const exp of expenses) {
        const expDate = new Date(nowDate.getTime() - exp.daysAgo * 24 * 60 * 60_000);
        expDate.setHours(13, 15, 0, 0);
        await tx.runAsync(
          `INSERT INTO transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,note,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          exp.id,
          DEMO_USER_ID,
          exp.account,
          exp.category,
          'expense',
          exp.amount,
          'BOB',
          expDate.toISOString(),
          exp.note,
          timestamp,
          timestamp
        );
      }

      // Guardar versión de semilla
      await tx.runAsync(
        `INSERT INTO app_meta(key,value) VALUES('seed_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        CURRENT_SEED_VERSION
      );
    });
  } catch (error) {
    throw new Error(
      `Carga de horario universitario falló en ${seedStep}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
