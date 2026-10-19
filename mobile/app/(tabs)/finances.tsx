import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppScreen, Card, PageHeader, palette } from '@core/ui/AppScreen';
import { useAppNotice } from '@core/ui/AppNotice';
import { useAppTheme } from '@core/theme';
import {
  cancelExpenseUseCase,
  EXPENSE_CATEGORIES,
  getExpensePeriodSummaryUseCase,
  getExpenseTotalUseCase,
  listExpenseTransactionsUseCase,
  listExpenseDefinitionsUseCase,
  listTodayExpensesUseCase,
  saveExpenseDefinitionUseCase,
  useExpenseDefinitionUseCase,
  type ExpenseDefinition,
  type ExpenseHistoryPeriod,
  type ExpensePeriodSummary,
  type ExpenseTransaction,
} from '@modules/finances';

export default function Expenses() {
  const db = useSQLiteContext();
  const { isDark } = useAppTheme();
  const { showNotice } = useAppNotice();

  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<ExpenseDefinition[]>([]);
  const [history, setHistory] = useState<ExpenseTransaction[]>([]);
  const [week, setWeek] = useState<ExpensePeriodSummary>({ total: 0, top_name: null, top_count: 0 });
  const [month, setMonth] = useState<ExpensePeriodSummary>({ total: 0, top_name: null, top_count: 0 });
  const [expenseHistory, setExpenseHistory] = useState<ExpenseTransaction[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<ExpenseHistoryPeriod>('week');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('Soda');
  const [amount, setAmount] = useState('6');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[3].id);

  const load = useCallback(async () => {
    const [t, defs, today, w, m, txs] = await Promise.all([
      getExpenseTotalUseCase(db),
      listExpenseDefinitionsUseCase(db),
      listTodayExpensesUseCase(db),
      getExpensePeriodSummaryUseCase(db, 7),
      getExpensePeriodSummaryUseCase(db, 30),
      listExpenseTransactionsUseCase(db, historyPeriod),
    ]);
    setTotal(t);
    setItems(defs);
    setHistory(today);
    setWeek(w);
    setMonth(m);
    setExpenseHistory(txs);
  }, [db, historyPeriod]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const c = {
    text: isDark ? '#F8FAFC' : palette.ink,
    muted: isDark ? '#CBD5E1' : palette.muted,
    surface: isDark ? '#172033' : '#FFF',
    soft: isDark ? '#24324A' : '#F2F4F7',
    border: isDark ? '#475569' : palette.border,
  };

  async function add() {
    const value = Number(amount.replace(',', '.'));
    if (!name.trim() || value <= 0) {
      return showNotice({ title: 'Completa nombre y monto', tone: 'error' });
    }
    await saveExpenseDefinitionUseCase(db, name.trim(), value, 'manual', category);
    setEditing(false);
    showNotice({ title: 'Tarjeta de gasto guardada' });
    await load();
  }

  async function register(item: ExpenseDefinition) {
    await useExpenseDefinitionUseCase(db, item.id);
    showNotice({ title: 'Gasto registrado', message: `${item.name} · Bs ${item.amount.toFixed(2)}` });
    await load();
  }

  function confirmCancel(item: ExpenseTransaction) {
    Alert.alert('Anular gasto', '¿Deseas quitarlo del total y del historial activo?', [
      { text: 'Cancelar' },
      {
        text: 'Anular',
        style: 'destructive',
        onPress: async () => {
          await cancelExpenseUseCase(db, item.id);
          showNotice({ title: 'Gasto anulado', tone: 'info' });
          await load();
        },
      },
    ]);
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Gastos"
        title="Un toque para registrar"
        subtitle="Configura cada gasto una vez y después pulsa su tarjeta."
      />
      <Card style={{ backgroundColor: c.surface, borderColor: c.border }}>
        <Text style={{ color: c.muted }}>Gastado hoy</Text>
        <Text style={[s.total, { color: c.text }]}>Bs {total.toFixed(2)}</Text>
      </Card>
      <View style={s.periods}>
        <Period title="Últimos 7 días" item={week} colors={c} />
        <Period title="Últimos 30 días" item={month} colors={c} />
      </View>
      <Card style={{ backgroundColor: c.surface, borderColor: c.border }}>
        <View style={s.heading}>
          <View>
            <Text style={[s.title, { color: c.text }]}>Desglose de gastos</Text>
            <Text style={{ color: c.muted }}>
              {expenseHistory.length} {expenseHistory.length === 1 ? 'movimiento' : 'movimientos'} · Bs{' '}
              {expenseHistory.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.historyFilters}
        >
          {(
            [
              ['week', 'Semana actual'],
              [30, '30 días'],
              [90, '90 días'],
              [365, '1 año'],
            ] as const
          ).map(([period, label]) => (
            <Pressable
              key={period}
              style={[
                s.historyFilter,
                { backgroundColor: historyPeriod === period ? palette.primary : c.soft },
              ]}
              onPress={() => setHistoryPeriod(period)}
            >
              <Text style={{ color: historyPeriod === period ? '#FFF' : c.text, fontWeight: '800' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {expenseHistory.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={272}
            decelerationRate="fast"
            contentContainerStyle={s.historyCards}
          >
            {expenseHistory.map((x) => {
              const date = new Date(x.occurred_at);
              return (
                <View
                  key={x.id}
                  style={[s.historyCard, { backgroundColor: c.soft, borderColor: c.border }]}
                >
                  <View style={s.historyCardTop}>
                    <View style={s.historyDate}>
                      <Text style={[s.historyDay, { color: c.text }]}>
                        {date.toLocaleDateString('es-BO', { day: '2-digit' })}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: 11, textTransform: 'uppercase' }}>
                        {date.toLocaleDateString('es-BO', { month: 'short' })}
                      </Text>
                    </View>
                    <Text style={s.historyCardAmount}>Bs {x.amount.toFixed(2)}</Text>
                  </View>
                  <Text style={[s.historyName, { color: c.text }]}>
                    {x.note || x.category_name}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{x.category_name}</Text>
                  <Text style={{ color: c.muted, fontSize: 12, textTransform: 'capitalize' }}>
                    {date.toLocaleDateString('es-BO', { weekday: 'long', year: 'numeric' })} ·{' '}
                    {date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Pressable style={s.cancelButton} onPress={() => confirmCancel(x)}>
                    <Text style={s.cancel}>Anular gasto</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={{ color: c.muted }}>No hay movimientos en este período.</Text>
        )}
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Desliza hacia los lados para revisar los gastos.
        </Text>
      </Card>
      <View style={s.heading}>
        <Text style={[s.title, { color: c.text }]}>Gastos configurados</Text>
        <Pressable style={s.add} onPress={() => setEditing((x) => !x)}>
          <Text style={s.white}>{editing ? 'Cerrar' : '＋ Añadir'}</Text>
        </Pressable>
      </View>
      {editing ? (
        <Card style={{ backgroundColor: c.surface, borderColor: c.border }}>
          <Text style={{ color: c.muted }}>
            El nombre de la tarjeta será su nombre propio en el historial y los informes.
          </Text>
          <TextInput
            style={[s.input, { color: c.text, backgroundColor: c.soft, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Nombre: Soda"
            placeholderTextColor={c.muted}
          />
          <TextInput
            style={[s.input, { color: c.text, backgroundColor: c.soft, borderColor: c.border }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Monto"
            placeholderTextColor={c.muted}
          />
          <Text style={{ color: c.muted }}>Grupo contable</Text>
          <View style={s.categories}>
            {EXPENSE_CATEGORIES.map((x) => (
              <Pressable
                key={x.id}
                style={[
                  s.category,
                  { backgroundColor: category === x.id ? palette.primary : c.soft },
                ]}
                onPress={() => setCategory(x.id)}
              >
                <Text style={{ color: category === x.id ? '#FFF' : c.text }}>{x.name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={s.save} onPress={add}>
            <Text style={s.white}>Guardar tarjeta</Text>
          </Pressable>
        </Card>
      ) : null}
      <View style={s.grid}>
        {items.map((x) => (
          <Pressable
            key={x.id}
            style={[s.tile, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => void register(x)}
          >
            <Text style={[s.tileName, { color: c.text }]}>{x.name}</Text>
            <Text style={s.tileAmount}>Bs {x.amount.toFixed(2)}</Text>
            <Text style={{ color: c.muted }}>Toca para registrar</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.title, { color: c.text }]}>Movimientos de hoy</Text>
      <Card style={{ backgroundColor: c.surface, borderColor: c.border }}>
        {history.length ? (
          history.map((x) => (
            <View key={x.id} style={[s.movement, { borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '800' }}>
                  {x.note || x.category_name}
                </Text>
                <Text style={{ color: c.muted }}>
                  {new Date(x.occurred_at).toLocaleTimeString('es-BO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={s.expense}>- Bs {x.amount.toFixed(2)}</Text>
              <Pressable onPress={() => confirmCancel(x)}>
                <Text style={s.cancel}>Anular</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={{ color: c.muted }}>Aún no registraste gastos hoy.</Text>
        )}
      </Card>
    </AppScreen>
  );
}

function Period({
  title,
  item,
  colors,
}: {
  title: string;
  item: ExpensePeriodSummary;
  colors: any;
}) {
  return (
    <Card style={{ ...s.period, backgroundColor: colors.surface, borderColor: colors.border }}>
      <Text style={{ color: colors.muted }}>{title}</Text>
      <Text style={[s.periodValue, { color: colors.text }]}>Bs {item.total.toFixed(2)}</Text>
      <Text style={{ color: colors.muted }}>
        Más frecuente: {item.top_name || '—'}
        {item.top_name ? ` · ${item.top_count} veces` : ''}
      </Text>
    </Card>
  );
}

const s = StyleSheet.create({
  total: { fontSize: 36, fontWeight: '900' },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '900' },
  periods: { flexDirection: 'row', gap: 10 },
  period: { flex: 1 },
  periodValue: { fontSize: 20, fontWeight: '900' },
  historyFilters: { gap: 8, paddingRight: 10 },
  historyFilter: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  historyCards: { gap: 12, paddingRight: 18 },
  historyCard: {
    width: 260,
    minHeight: 190,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 7,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyDate: { width: 38, alignItems: 'center' },
  historyDay: { fontSize: 20, fontWeight: '900' },
  historyCardAmount: { color: palette.orange, fontWeight: '900', fontSize: 20 },
  historyName: { fontSize: 17, fontWeight: '900' },
  cancelButton: { marginTop: 'auto', alignSelf: 'flex-start', paddingVertical: 6 },
  add: {
    backgroundColor: palette.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  white: { color: '#FFF', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    minHeight: 130,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  tileName: { fontSize: 19, fontWeight: '900' },
  tileAmount: { fontSize: 24, color: '#60A5FA', fontWeight: '900' },
  input: { padding: 12, borderRadius: 12, borderWidth: 1 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  category: { padding: 9, borderRadius: 15 },
  save: {
    padding: 14,
    backgroundColor: palette.primary,
    borderRadius: 12,
    alignItems: 'center',
  },
  movement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  expense: { color: palette.orange, fontWeight: '900' },
  cancel: { color: '#EF4444', fontWeight: '800' },
});
