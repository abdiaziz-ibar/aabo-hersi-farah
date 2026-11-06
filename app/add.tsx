import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCOUNTS, AccountId, TxType } from '../src/data/types';
import { useStore } from '../src/store';
import { useTheme } from '../src/theme';

export default function Add() {
  const { colors } = useTheme();
  const { addTransaction } = useStore();
  const router = useRouter();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<AccountId>('saadicuun');
  const [party, setParty] = useState('');
  const [place, setPlace] = useState('');

  const value = parseFloat(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && party.trim().length > 0;

  const seg = (t: TxType, label: string, tone: string) => (
    <Pressable
      onPress={() => setType(t)}
      style={[styles.seg, { backgroundColor: type === t ? tone : colors.card, borderColor: colors.border }]}
    >
      <Text style={{ color: type === t ? '#fff' : colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
  const input = { backgroundColor: colors.card, color: colors.text, borderColor: colors.border };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>Ku dar dhaqdhaqaaq</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {seg('income', 'Soo gashay', colors.income)}
        {seg('expense', 'Baxday', colors.expense)}
      </View>
      <TextInput
        style={[styles.input, input]} placeholder="Lacagta ($)" placeholderTextColor={colors.sub}
        keyboardType="decimal-pad" value={amount} onChangeText={setAmount}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {ACCOUNTS.map((a) => (
          <Pressable
            key={a.id} onPress={() => setAccount(a.id)}
            style={[styles.chip, { backgroundColor: account === a.id ? colors.primary : colors.card, borderColor: colors.border }]}
          >
            <Text style={{ color: account === a.id ? '#fff' : colors.text, fontWeight: '600' }}>{a.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={[styles.input, input]} placeholder="Qofka / dhinaca" placeholderTextColor={colors.sub} value={party} onChangeText={setParty} />
      <TextInput style={[styles.input, input]} placeholder="Meesha" placeholderTextColor={colors.sub} value={place} onChangeText={setPlace} />
      <Pressable
        disabled={!valid}
        onPress={() => {
          addTransaction({ type, amount: value, accountId: account, party: party.trim(), place: place.trim() || 'Kale' });
          router.back();
        }}
        style={[styles.save, { backgroundColor: colors.primary, opacity: valid ? 1 : 0.4 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>Kaydi</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  seg: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, fontSize: 16 },
  chip: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  save: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 6 },
});
