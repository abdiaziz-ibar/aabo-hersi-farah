import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';

export default function Close() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: insets.top + 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Xisaab xir</Text>
      <Text style={{ color: colors.sub, marginTop: 8 }}>Shaashadan waa la dhisi doonaa.</Text>
    </View>
  );
}
