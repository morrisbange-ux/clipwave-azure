'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { signToken } = require('../auth');

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

module.exports = function authRoutes({ db, config }) {
  const r = express.Router();

  r.post('/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!USERNAME.test(username || '')) return res.status(400).json({ error: 'Username must be 3-20 letters, numbers or underscores' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser({ username, passwordHash });
    if (!user) return res.status(409).json({ error: 'Username already taken' });
    res.status(201).json({ token: signToken(user, config.jwtSecret), username: user.username });
  });

  r.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    const user = username ? await db.getUserByUsername(username) : null;
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({ token: signToken(user, config.jwtSecret), username: user.username });
  });

  return r;
};
