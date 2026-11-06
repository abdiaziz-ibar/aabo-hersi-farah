import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart, DonutChart } from '../../src/components/charts';
import { TxRow } from '../../src/components/TxRow';
import { ACCOUNTS } from '../../src/data/types';
import { HIDDEN, MONTHS, money, shortMonth } from '../../src/lib/format';
import { balanceUpTo, expensesByPlace, lastMonths, monthTotals, YM } from '../../src/lib/stats';
import { useStore } from '../../src/store';
import { useTheme } from '../../src/theme';

const OVERLAP = 26;

export default function Home() {
  const { colors, mode, toggle } = useTheme();
  const { transactions, hideBalances, toggleHide, reload } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const now = new Date();
  const [ym, setYm] = useState<YM>({ y: now.getFullYear(), m: now.getMonth() });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const months = useMemo(() => lastMonths({ y: now.getFullYear(), m: now.getMonth() }, 12).reverse(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => monthTotals(transactions, ym), [transactions, ym]);
  const total = useMemo(() => balanceUpTo(transactions, ym), [transactions, ym]);
  const bars = useMemo(
    () =>
      lastMonths(ym, 6).map((x) => {
        const t = monthTotals(transactions, x);
        return { label: shortMonth(x.m), a: t.income, b: t.expense };
      }),
    [transactions, ym],
  );
  const places = useMemo(() => expensesByPlace(transactions, ym, 3), [transactions, ym]);
  const latest = useMemo(
    () => [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 3),
    [transactions],
  );
  const monthExpense = totals.expense;
  const show = (n: number) => (hideBalances ? HIDDEN : money(n));
  const empty = transactions.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ---------- Header band ---------- */}
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 14 }]}
        >
          <View style={styles.topRow}>
            <View>
              <Text style={styles.greet}>Salaan</Text>
              <Text style={styles.title}>Dashboard</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={toggleHide}
                accessibilityLabel={hideBalances ? 'Tus hadhaagga' : 'Qari hadhaagga'}
                style={styles.circleBtn}
              >
                <Ionicons name={hideBalances ? 'eye-off-outline' : 'eye-outline'} size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={toggle} accessibilityLabel="Beddel muuqaalka" style={styles.circleBtn}>
                <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color="#fff" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.balLabel}>Wadarta hadhaagga</Text>
          <Pressable onPress={() => setPickerOpen(true)} style={styles.pill}>
            <Text style={styles.pillText}>{MONTHS[ym.m]} {ym.y}</Text>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </Pressable>
          <Text style={styles.balance}>{show(total)}</Text>

          <View style={styles.miniRow}>
            <View style={styles.mini}>
              <View style={styles.miniHead}>
                <Ionicons name="arrow-down-circle" size={16} color="#86EFAC" />
                <Text style={styles.miniLabel}>Soo gashay</Text>
              </View>
              <Text style={styles.miniValue}>{show(totals.income)}</Text>
            </View>
            <View style={styles.mini}>
              <View style={styles.miniHead}>
                <Ionicons name="arrow-up-circle" size={16} color="#FCA5A5" />
                <Text style={styles.miniLabel}>Baxday</Text>
              </View>
              <Text style={styles.miniValue}>{show(totals.expense)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ---------- Content (overlaps header) ---------- */}
        <View style={{ marginTop: -OVERLAP, paddingHorizontal: 16, gap: 16 }}>
          {/* Account tiles */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {ACCOUNTS.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => router.push({ pathname: '/history', params: { account: a.id } })}
                style={[styles.card, styles.tile, { backgroundColor: colors.card }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: colors.primary + '22' }]}>
                  <Ionicons name={a.icon} size={20} color={colors.primary} />
                </View>
                <Text style={[styles.tileName, { color: colors.sub }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[styles.tileBal, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
                  {show(balanceUpTo(transactions, ym, a.id))}
                </Text>
              </Pressable>
            ))}
          </View>

          {empty ? (
            <View style={[styles.card, styles.emptyCard, { backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '22' }]}>
                <Ionicons name="sparkles" size={30} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.text, textAlign: 'center' }]}>
                Bilow dhaqdhaqaaqaaga ugu horreeya
              </Text>
              <Text style={{ color: colors.sub, textAlign: 'center' }}>
                Taabo badhanka “+” si aad u darto lacag soo gashay ama bixid.
              </Text>
              <Pressable onPress={() => router.push('/add')} style={[styles.cta, { backgroundColor: colors.primary }]}>
                <Text style={styles.ctaText}>Ku dar hadda</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Income vs expense */}
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Soo gal iyo bixid</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Legend color={colors.income} label="Soo gashay" text={colors.sub} />
                    <Legend color={colors.expense} label="Baxday" text={colors.sub} />
                  </View>
                </View>
                <BarChart
                  data={bars}
                  colorA={colors.income}
                  colorB={colors.expense}
                  gridColor={colors.border}
                  labelColor={colors.sub}
                />
              </View>

              {/* Where money went */}
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 14 }]}>
                  Bixidda halka ay aaday
                </Text>
                {places.length === 0 ? (
                  <Text style={{ color: colors.sub, paddingVertical: 12 }}>
                    Bishan ma jirto bixid la diiwaangeliyey.
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                    <DonutChart
                      data={places.map((s, i) => ({ value: s.value, color: colors.chart[i] ?? colors.chart[3] }))}
                      trackColor={colors.border}
                      textColor={colors.text}
                      subColor={colors.sub}
                      centerLabel={show(monthExpense)}
                      centerSub="Wadarta"
                    />
                    <View style={{ flex: 1, gap: 10 }}>
                      {places.map((s, i) => (
                        <View key={s.label} style={styles.legendRow}>
                          <View style={[styles.dot, { backgroundColor: colors.chart[i] ?? colors.chart[3] }]} />
                          <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{s.label}</Text>
                          <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '600' }}>{s.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Latest */}
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Dhaqdhaqaaqii ugu dambeeyey</Text>
                  <Pressable onPress={() => router.push('/history')}>
                    <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Dhammaan</Text>
                  </Pressable>
                </View>
                {latest.map((t) => (
                  <TxRow key={t.id} tx={t} hidden={hideBalances} />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Month picker */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <ScrollView>
              {months.map((x) => {
                const sel = x.y === ym.y && x.m === ym.m;
                return (
                  <Pressable
                    key={`${x.y}-${x.m}`}
                    onPress={() => {
                      setYm(x);
                      setPickerOpen(false);
                    }}
                    style={[styles.opt, sel && { backgroundColor: colors.primary + '1F' }]}
                  >
                    <Text style={{ color: sel ? colors.primary : colors.text, fontWeight: sel ? '700' : '500', fontSize: 15 }}>
                      {MONTHS[x.m]} {x.y}
                    </Text>
                    {sel && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Legend({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: text, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: OVERLAP + 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  greet: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  circleBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  balLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  balance: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10, marginBottom: 16 },
  miniRow: { flexDirection: 'row', gap: 10 },
  mini: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)' },
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  miniValue: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 6 },

  card: {
    borderRadius: 20, padding: 16,
    shadowColor: '#0F172A', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  tile: { flex: 1, padding: 12, alignItems: 'flex-start', gap: 4 },
  tileIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tileName: { fontSize: 12 },
  tileBal: { fontSize: 15, fontWeight: '700', alignSelf: 'stretch' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },

  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 },
  ctaText: { color: '#fff', fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  sheet: { borderRadius: 20, maxHeight: 420, padding: 8 },
  opt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12 },
});
