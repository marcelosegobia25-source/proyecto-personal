# Arquitectura movil offline-first

## Stack propuesto

| Capa | Tecnologia | Responsabilidad |
|---|---|---|
| Aplicacion | React Native, Expo y TypeScript | UI Android/iOS |
| Navegacion | Expo Router | Rutas y enlaces profundos |
| Datos locales | Expo SQLite | Lectura y escritura sin internet |
| Consultas | TanStack Query | Cache y coordinacion de consultas |
| Validacion | Zod | Validar formularios y respuestas |
| Nube | Supabase/PostgreSQL | Respaldo, autenticacion, sincronizacion e informes |
| Archivos | Supabase Storage | Comprobantes opcionales |
| Procesos online | Edge Functions | Push, exportaciones y tareas privilegiadas |
| Pruebas DB | pgTAP | Esquema, seguridad y reglas |

## Limites de cada entorno

El movil escribe primero en SQLite dentro de una transaccion. En esa misma
transaccion agrega una operacion a `sync_outbox`. La interfaz nunca espera a
internet para crear actividades, sesiones, verificaciones o gastos.

Al recuperar conectividad, el sincronizador envia operaciones por lotes y
descarga cambios posteriores al cursor local. PostgreSQL es la copia compartida
y autoritativa entre dispositivos, pero no bloquea el uso diario sin red.

## Funciones sin internet

- Ver y modificar agenda ya descargada.
- Crear actividades y bloques.
- Usar temporizador.
- Verificar una actividad.
- Registrar ingresos y gastos.
- Consultar informes calculados con datos locales.
- Programar y recibir notificaciones locales.

## Funciones que requieren internet

- Crear cuenta e iniciar una sesion nueva.
- Sincronizar entre dispositivos y realizar copias remotas.
- Recuperar comprobantes no descargados.
- Recibir notificaciones push del servidor.
- Compartir informes o exportaciones alojadas.

## Notificaciones

Las notificaciones de inicio, fin y revision diaria se programan en el propio
dispositivo al crear o modificar un bloque. Por ello siguen funcionando sin
internet. Se guarda `local_notification_id` para cancelarlas al reprogramar.

Las push se usan solo para cambios provenientes de otro dispositivo, informes
listos o avisos del servidor. Los tokens push se guardan por instalacion, pueden
revocarse y nunca forman parte de los datos exportados.

## Conflictos de sincronizacion

- Actividades, bloques, objetivos y preferencias: gana la version con
  `updated_at` mas reciente; una modificacion sobrescrita queda en auditoria.
- Transacciones bloqueadas: son inmutables. Una correccion crea un movimiento
  inverso y otro correcto.
- Sesiones: el servidor garantiza una sola sesion activa por usuario. Si dos
  dispositivos crean una, la segunda queda marcada para resolucion manual.
- Eliminaciones: se usa `deleted_at` para propagar borrados antes de purgarlos.
- El servidor confirma cada `operation_id`, haciendo los reintentos idempotentes.

## Seguridad

Cada tabla expuesta activa RLS y restringe filas a `auth.uid()`. El rol anonimo
no recibe acceso a datos personales. La clave `service_role` solo puede vivir en
funciones del servidor. Los comprobantes deben almacenarse en rutas privadas.
