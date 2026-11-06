import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const KEY = 'server.url';
const BRAND = '#4f46e5';

/** "192.168.1.5:4000" → "http://192.168.1.5:4000" (no trailing slash). */
function normalize(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

async function reachable(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function Setup({ initial, onConnect }: { initial: string; onConnect: (url: string) => void }) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const url = normalize(value);
    if (!url) return;
    setBusy(true);
    setError(null);
    if (await reachable(url)) {
      await AsyncStorage.setItem(KEY, url);
      onConnect(url);
    } else {
      setError('Server-ka lama gaarin / Cannot reach the server.\nHubi in kombiyuutarku shidan yahay, backend-ku socdo, oo taleefanku isla WiFi-ga yahay.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.setup, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.setupInner} keyboardShouldPersistTaps="handled">
        <Image source={require('./assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>Hersi Farah</Text>
        <Text style={styles.sub}>Ciwaanka server-ka / Server address</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="192.168.1.5:4000"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={connect}
        />
        <Text style={styles.hint}>
          Geli IP-ga kombiyuutarka iyo port-ka backend-ka.{'\n'}Enter your computer’s IP and the backend port.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.button, (busy || !value.trim()) && { opacity: 0.5 }]} disabled={busy || !value.trim()} onPress={connect}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ku xidh / Connect</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null | undefined>(undefined); // undefined = loading
  const [changing, setChanging] = useState(false);
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setUrl(v ?? null)).catch(() => setUrl(null));
  }, []);

  // Android back button navigates inside the web app first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && web.current) {
        web.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const renderError = useCallback(
    () => (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Server-ka lama gaari karo</Text>
        <Text style={styles.errorText}>Cannot reach the server.{'\n'}Hubi WiFi-ga iyo in backend-ku socdo.</Text>
        <Pressable style={styles.button} onPress={() => web.current?.reload()}>
          <Text style={styles.buttonText}>Isku day mar kale / Retry</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonGhost]} onPress={() => setChanging(true)}>
          <Text style={[styles.buttonText, { color: BRAND }]}>Beddel server / Change server</Text>
        </Pressable>
      </View>
    ),
    [],
  );

  if (url === undefined) {
    return <View style={styles.center}><ActivityIndicator color={BRAND} /></View>;
  }
  if (!url || changing) {
    return <Setup initial={url ?? ''} onConnect={(u) => { setUrl(u); setChanging(false); }} />;
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: BRAND }]}>
      <WebView
        ref={web}
        source={{ uri: url }}
        style={styles.flex}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderError={renderError}
        renderLoading={() => <View style={styles.center}><ActivityIndicator color={BRAND} /></View>}
        onNavigationStateChange={(s) => { canGoBack.current = s.canGoBack; }}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={BRAND} />
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f6fa' },
  setup: { flex: 1, backgroundColor: '#f5f6fa' },
  setupInner: { paddingHorizontal: 28, alignItems: 'stretch', gap: 12 },
  logo: { width: 84, height: 84, borderRadius: 22, alignSelf: 'center', marginTop: 24 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: '#0f172a' },
  sub: { marginTop: 18, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  input: {
    height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#e4e8f0', backgroundColor: '#fff',
    paddingHorizontal: 14, fontSize: 16, color: '#0f172a',
  },
  hint: { fontSize: 12.5, color: '#64748b', lineHeight: 18 },
  error: { color: '#dc2626', fontSize: 13.5, lineHeight: 19 },
  button: { height: 50, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e4e8f0' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#f5f6fa', alignItems: 'stretch', justifyContent: 'center', padding: 28, gap: 12 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  errorText: { color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
