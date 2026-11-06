import { Tabs } from 'expo-router';
import React from 'react';
import { TabBar } from '../../src/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="close" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
