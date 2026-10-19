import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { listTrashUseCase, restoreActivityUseCase } from '@modules/activities';

type Trash = Awaited<ReturnType<typeof listTrashUseCase>>[number];

export default function TrashScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Trash[]>([]);

  const load = useCallback(() => listTrashUseCase(db).then(setItems), [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Papelera"
        title="Actividades eliminadas"
        subtitle="Restaura series y conserva su historial."
      />
      {items.length ? (
        items.map((x) => (
          <Card key={x.activity_id}>
            <Text style={s.title}>{x.title}</Text>
            <Text style={s.muted}>
              Eliminada:{' '}
              {new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(
                new Date(x.deleted_at)
              )}
            </Text>
            <Pressable
              style={s.button}
              onPress={async () => {
                await restoreActivityUseCase(db, x.activity_id);
                await load();
              }}
            >
              <Text style={s.white}>Restaurar</Text>
            </Pressable>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={s.muted}>La papelera está vacía.</Text>
        </Card>
      )}
    </AppScreen>
  );
}

const s = StyleSheet.create({
  title: { color: palette.ink, fontWeight: '800', fontSize: 18 },
  muted: { color: palette.muted },
  button: {
    backgroundColor: palette.primary,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  white: { color: '#FFF', fontWeight: '800' },
});
