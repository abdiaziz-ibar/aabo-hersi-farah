import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const META: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Guud', icon: 'grid-outline', active: 'grid' },
  history: { label: 'Taariikh', icon: 'time-outline', active: 'time' },
  close: { label: 'Xisaab xir', icon: 'lock-closed-outline', active: 'lock-closed' },
  settings: { label: 'Dejin', icon: 'settings-outline', active: 'settings' },
};

const FAB = 56;
const RAISE = 22;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const item = (routeName: string) => {
    const idx = state.routes.findIndex((r) => r.name === routeName);
    if (idx < 0) return null;
    const route = state.routes[idx];
    const focused = state.index === idx;
    const m = META[routeName];
    const color = focused ? colors.primary : colors.sub;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={m.label}
        style={styles.item}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
      >
        <Ionicons name={focused ? m.active : m.icon} size={22} color={color} />
        <Text style={[styles.label, { color }]}>{m.label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom, height: 62 + insets.bottom },
      ]}
    >
      {item('index')}
      {item('history')}
      <View style={styles.item} />
      {item('close')}
      {item('settings')}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ku dar"
        onPress={() => router.push('/add')}
        style={({ pressed }) => [styles.fabWrap, { top: -RAISE, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
      >
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, overflow: 'visible' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: '600' },
  fabWrap: { position: 'absolute', alignSelf: 'center', left: '50%', marginLeft: -FAB / 2 },
  fab: {
    width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4F46E5', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
});
