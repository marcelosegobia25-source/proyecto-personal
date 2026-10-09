# Contrato de sincronizacion

Cada entidad sincronizable contiene `id`, `user_id`, `created_at`, `updated_at`,
`version` y `deleted_at`. El UUID se genera antes de guardar en SQLite.

Una operacion de salida contiene:

```json
{
  "operation_id": "uuid",
  "entity": "planned_blocks",
  "entity_id": "uuid",
  "operation": "upsert",
  "base_version": 3,
  "payload": {},
  "created_at": "2026-09-08T22:00:00Z"
}
```

El servidor debe registrar `operation_id` antes de confirmar. Una repeticion
devuelve el resultado previo. Una version incompatible devuelve `409` con la
fila remota; el cliente aplica la politica descrita en `architecture.md`.

La descarga incremental usa `(updated_at, id)` como cursor estable e incluye
tombstones (`deleted_at`). El cliente no purga una operacion hasta recibir
confirmacion. Se aplican esperas exponenciales con variacion ante fallos.
