import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** Animates 0 → 1 (ease-out) whenever `key` changes. */
export function useProgress(key: string, duration = 600): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setP(value));
    Animated.timing(v, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      v.removeListener(id);
      v.stopAnimation();
    };
  }, [key, duration]);
  return p;
}
