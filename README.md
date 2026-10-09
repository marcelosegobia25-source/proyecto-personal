# Gestion personal - base de datos

Base de datos para una aplicacion movil *offline-first* que compara lo
planificado con lo realizado y registra tiempo, objetivos y finanzas.

## Estructura

- `supabase/migrations/`: esquema PostgreSQL, funciones, triggers, vistas y RLS.
- `supabase/seed.sql`: datos ficticios reproducibles.
- `supabase/tests/`: pruebas pgTAP.
- `mobile-database/`: esquema SQLite local y datos de demostracion.
- `mobile/`: prototipo Android/iOS construido con Expo.
- `docs/`: arquitectura, flujos, sincronizacion y modelo ER.

## Puesta en marcha con Supabase CLI

```bash
supabase init
supabase start
supabase db reset
supabase test db
```

`supabase db reset` aplica las migraciones y luego `supabase/seed.sql`.
Las claves del servidor nunca deben incluirse en la aplicacion movil.

## Decisiones principales

- Los UUID se generan en el movil para poder crear registros sin conexion.
- Todos los instantes se guardan en UTC; `profiles.timezone` define su presentacion.
- El dispositivo usa SQLite y una bandeja `sync_outbox` para sincronizacion posterior.
- Los recordatorios normales son notificaciones locales; las push son opcionales.
- Los informes se calculan con vistas, sin duplicar totales mediante triggers.

Consulta [la arquitectura](docs/architecture.md), [los flujos](docs/flows.md),
[el modelo ER](docs/erd.md) y [el contrato de sincronizacion](docs/sync-contract.md).

## Ejecutar la aplicacion

```bash
cd mobile
npm start
```

Escanea el QR con Expo Go o usa `npm run android` con un emulador disponible.
