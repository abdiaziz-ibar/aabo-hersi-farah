import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../src/store';
import { useTheme } from '../../src/theme';

export default function Settings() {
  const { colors } = useTheme();
  const { loadSample, clearAll } = useStore();
  const insets = useSafeAreaInsets();
  const btn = (label: string, onPress: () => void, bg: string) => (
    <Pressable onPress={onPress} style={{ backgroundColor: bg, padding: 14, borderRadius: 14, marginTop: 12 }}>
      <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: insets.top + 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Dejin</Text>
      {btn('Soo geli xog tijaabo', loadSample, colors.primary)}
      {btn('Tirtir dhammaan dhaqdhaqaaqa', clearAll, colors.expense)}
    </View>
  );
}
