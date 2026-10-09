# Flujos funcionales revisados

## Planificar y ejecutar

1. El usuario crea una actividad o reutiliza una existente.
2. Define un bloque unico o una regla recurrente.
3. El movil materializa los proximos bloques y agenda notificaciones locales.
4. Al comenzar puede iniciar una sesion; el temporizador usa marcas de tiempo,
   no un contador dependiente de que la aplicacion permanezca abierta.
5. Puede pausar y continuar.
6. Al finalizar verifica: completada, parcial, omitida o reprogramada.
7. Si reprograma, el bloque original conserva su resultado y referencia al nuevo.

## Registrar un gasto

1. Importe y categoria aparecen en la primera pantalla.
2. Cuenta, fecha, nota y comprobante son opcionales o usan valores recientes.
3. El gasto se guarda localmente y actualiza el presupuesto local.
4. Al sincronizar, el servidor valida propiedad, moneda e importe.
5. Una transaccion puede bloquearse; desde entonces se corrige, no se reescribe.

## Revision e informes

1. Al final del dia una notificacion local abre pendientes.
2. El usuario verifica actividades y escribe una reflexion opcional.
3. Los informes comparan minutos planificados y reales, sin premiar sobrecarga.
4. La adherencia es `min(real / planificado, 1) * 100`.
5. Los gastos se comparan con presupuestos por periodo y categoria.

## Casos de fallo contemplados

- Cierre de la aplicacion durante un temporizador.
- Cambio de zona horaria o horario de verano.
- Bloques superpuestos: se detectan, pero se permite guardarlos con advertencia.
- Reintento de una operacion ya sincronizada.
- Ediciones concurrentes desde dos dispositivos.
- Notificacion ya programada para un bloque posteriormente eliminado.
- Sesion abierta durante un cambio de dia.

## Recuperacion y progreso

Una actividad vencida o parcial puede originar un bloque de recuperacion. La
tabla `recovery_links` conserva la relacion y los minutos pendientes para evitar
duplicar objetivos. El contenido producido se registra por separado en
`progress_entries`, de forma que los informes no dependan solo de un check.
