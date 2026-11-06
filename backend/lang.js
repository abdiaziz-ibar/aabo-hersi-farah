// Per-request language for API messages: the frontend sends `X-Lang: so|en`.
export function langMiddleware(req, _res, next) {
  req.lang = req.headers['x-lang'] === 'en' ? 'en' : 'so';
  next();
}

/** Pick the Somali or English text for this request. */
export const tr = (req, so, en) => (req?.lang === 'en' ? en : so);
