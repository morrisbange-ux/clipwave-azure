'use strict';
const jwt = require('jsonwebtoken');

function signToken(user, secret) {
  return jwt.sign({ sub: user.id, username: user.username }, secret, { expiresIn: '7d' });
}

/** Attaches req.user when a valid Bearer token is present. */
function authenticate(secret) {
  return (req, _res, next) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      try {
        const p = jwt.verify(h.slice(7), secret);
        req.user = { id: p.sub, username: p.username };
      } catch {
        // invalid/expired token: treat as anonymous
      }
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

module.exports = { signToken, authenticate, requireAuth };
