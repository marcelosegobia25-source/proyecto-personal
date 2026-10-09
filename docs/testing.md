# Estrategia de pruebas

## PostgreSQL

`supabase test db` comprueba objetos, índices, políticas y triggers con pgTAP.
Además de estas pruebas estructurales, la capa de sincronización debe probar dos
usuarios distintos usando JWT diferentes para confirmar aislamiento RLS.

## SQLite

El esquema y la semilla se pueden cargar en una base en memoria. Deben probarse:

- restricción de una sola sesión abierta;
- rechazo de cambios a transacciones bloqueadas;
- rechazo de cambios desde estados terminales;
- informes locales con y sin datos;
- escritura atómica del registro y su operación `sync_outbox`.

## Aplicación móvil futura

- Unitarias: cálculo de duración, recurrencia, presupuestos y conflictos.
- Integración: repositorios SQLite y sincronizador.
- Componentes: permisos y estados de notificaciones.
- E2E: planificar, cronometrar, verificar y sincronizar tras modo avión.
