import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { createHash } from 'node:crypto';
import { config } from '../config.js';

export function corsMiddleware() {
  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);   // server-to-server, curl
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      // Allow any localhost:* in dev
      if (config.nodeEnv !== 'production' && origin.startsWith('http://localhost')) return cb(null, true);
      cb(new Error(`origin ${origin} not allowed`));
    },
    credentials: false,                     // bearer tokens, not cookies
  });
}

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: false,           // API only, no HTML
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

export const dropLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.dropsPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many drops, slow down' },
  // Key on session id (Authorization: Bearer …), fall back to IP.
  keyGenerator: (req) => {
    const auth = req.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return token || req.ip;
  },
});

export const sessionLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.sessionsPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many session creates from this IP' },
});

/**
 * Auth middleware — pulls session_id from the Authorization header
 * (`Bearer <sessionId>`). Future operator integration replaces this
 * with a JWT verify keyed off the operator's public key, but the
 * shape of req.session stays the same.
 */
export function requireSession(req, res, next) {
  const auth = req.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }
  req.sessionToken = auth.slice(7).trim();
  if (!req.sessionToken) return res.status(401).json({ error: 'empty bearer token' });
  next();
}

export function ipHash(req) {
  // Don't store raw IPs (GDPR). Hash + truncate.
  const ip = req.ip || req.connection?.remoteAddress || '';
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  // CORS / unexpected — don't leak stack to client in prod.
  console.error('[server-error]', err);
  res.status(500).json({ error: 'internal error' });
}
