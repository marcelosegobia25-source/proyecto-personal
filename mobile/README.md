# Mi Día

Prototipo móvil offline-first para planificación y seguimiento personal.

## Flujo implementado

1. Abre **Hoy** y pulsa **Programar actividad**.
2. Indica nombre, fecha, hora y duración.
3. Acepta el permiso para recibir el recordatorio local diez minutos antes.
4. Inicia y detén el temporizador desde **Hoy**.
5. Marca la actividad como hecha, parcial u omitida.
6. Consulta **Informes** para comparar minutos planificados y reales.

## Actividades recurrentes

El formulario permite crear un bloque único, una clase semanal durante un mes
o una clase semanal durante un año. Cada ocurrencia mantiene su propio estado.
También pueden generarse automáticamente bloques de traslado.

## Seguimiento y recuperación

- Desde una actividad se abre su ficha de progreso para registrar tema, páginas,
  ejercicios, concentración, próximo paso y notas.
- La bandeja **Por recuperar** calcula los minutos pendientes y crea un nuevo
  bloque vinculado al original.
- **Estudio** ofrece modos 25/5, 50/10, 60 minutos y cronómetro abierto, con
  materias, objetivos e interrupciones.

## Gastos

Además del registro libre se pueden definir gastos reutilizables —por ejemplo,
pasaje o almuerzo— y un presupuesto mensual.

Los datos se guardan en `gestion-personal.db` mediante Expo SQLite. Cada cambio
relevante crea una operación en `sync_outbox`; todavía no se envía a Supabase.
El prototipo se limita intencionalmente a Android/iOS: SQLite Web usa un worker
experimental que presenta problemas en rutas de Windows con caracteres acentuados.

## Desarrollo

```bash
npm install
npm run typecheck
npm start
```

Si Metro conserva una caché anterior después de actualizar dependencias, usa
`npm run start:clear` una vez.

Las notificaciones deben probarse en Android o iOS. Los recordatorios locales no
requieren conexión después de haber sido programados.
