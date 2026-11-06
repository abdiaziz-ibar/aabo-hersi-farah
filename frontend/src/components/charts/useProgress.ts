import { useEffect, useState } from 'react';

/** Animates 0 → 1 (ease-out cubic) whenever `key` changes. */
export function useProgress(key: string, duration = 600): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setP(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, duration]);
  return p;
}
