import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { accountName, Transaction } from '../data/types';
import { fmtDate, HIDDEN, money } from '../lib/format';
import { useTheme } from '../theme';

export function TxRow({ tx, hidden }: { tx: Transaction; hidden?: boolean }) {
  const { colors } = useTheme();
  const income = tx.type === 'income';
  const tone = income ? colors.income : colors.expense;
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: income ? colors.incomeTint : colors.expenseTint }]}>
        <Ionicons name={income ? 'arrow-down' : 'arrow-up'} size={18} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.party, { color: colors.text }]} numberOfLines={1}>{tx.party}</Text>
        <Text style={[styles.meta, { color: colors.sub }]} numberOfLines={1}>
          {accountName(tx.accountId)} · {fmtDate(tx.date)}
        </Text>
      </View>
      <Text style={[styles.amount, { color: tone }]}>
        {hidden ? HIDDEN : `${income ? '+' : '-'}${money(tx.amount)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  party: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
});
