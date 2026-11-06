import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TxRow } from '../../src/components/TxRow';
import { ACCOUNTS, AccountId } from '../../src/data/types';
import { useStore } from '../../src/store';
import { useTheme } from '../../src/theme';

export default function History() {
  const { colors } = useTheme();
  const { transactions } = useStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { account } = useLocalSearchParams<{ account?: string }>();
  const active = ACCOUNTS.find((a) => a.id === account)?.id as AccountId | undefined;

  const list = useMemo(
    () =>
      transactions
        .filter((t) => !active || t.accountId === active)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [transactions, active],
  );

  const chip = (id: AccountId | undefined, label: string) => {
    const sel = id === active;
    return (
      <Pressable
        key={label}
        onPress={() => router.setParams({ account: id })}
        style={[styles.chip, { backgroundColor: sel ? colors.primary : colors.card, borderColor: colors.border }]}
      >
        <Text style={{ color: sel ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <Text style={[styles.title, { color: colors.text }]}>Taariikh</Text>
      <View style={styles.chips}>
        {chip(undefined, 'Dhammaan')}
        {ACCOUNTS.map((a) => chip(a.id, a.name))}
      </View>
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
        renderItem={({ item }) => <TxRow tx={item} />}
        ListEmptyComponent={
          <Text style={{ color: colors.sub, textAlign: 'center', marginTop: 40 }}>
            Weli dhaqdhaqaaq ma jiro.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', paddingHorizontal: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
});
