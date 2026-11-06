import { tr } from './lang.js';

/**
 * Small in-memory fixed-window limiter, keyed by client IP (or a custom key).
 * Memory is bounded: expired entries are swept and the map is capped.
 */
export function rateLimit({ windowMs, max, message, key = (req) => req.ip }) {
  const hits = new Map();
  const MAX_KEYS = 50_000;
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  sweep.unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let e = hits.get(k);
    if (!e || now - e.start > windowMs) {
      if (!e && hits.size >= MAX_KEYS) hits.clear(); // under attack: reset rather than grow without bound
      e = { start: now, count: 0 };
      hits.set(k, e);
    }
    e.count += 1;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.start + windowMs - now) / 1000)));
      return res.status(429).json({
        error: message
          ? tr(req, message[0], message[1])
          : tr(req, 'Codsiyo aad u badan. Mar dambe isku day.', 'Too many requests. Please try again later.'),
      });
    }
    next();
  };
}
