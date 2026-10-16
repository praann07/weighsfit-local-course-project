require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const defaultPasswordFor = (email) => email.split('@')[0] + '123';   // user3@example.com -> user3123
const TABLES = ['users', 'profiles', 'exercises', 'routines', 'routine_exercises', 'workout_sessions',
  'workout_sets', 'foods', 'food_logs', 'nutrition_targets', 'body_metrics'];

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fitstack',
  dateStrings: true,
});

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));
const needLogin = (req, res, next) => (req.session.user ? next() : res.status(401).json({ error: 'Please log in' }));
const needAdmin = (req, res, next) =>
  (req.session.user && req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));

async function createUser(email, password, fullName, role = 'user') {
  if (!email || !password || password.length < 6) throw new Error('Email and a password of 6+ characters are required');
  let id;
  const hash = bcrypt.hashSync(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [created] = await conn.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash]);
    id = created.insertId; // MySQL numbers the new user itself (5, 6, 7, ...)
    await conn.query('INSERT INTO profiles (id, full_name, approved, role) VALUES (?, ?, 1, ?)', [id, fullName || null, role]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e.code === 'ER_DUP_ENTRY' ? new Error('That email already exists') : e;
  } finally {
    conn.release();
  }
  return id;
}

// ---- auth
app.post('/api/signup', wrap(async (req, res) => {
  const { email, password, full_name } = req.body;
  await createUser(email, password, full_name);
  res.json({ ok: true });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    'SELECT u.id, u.email, u.password_hash, p.full_name, p.role, p.approved FROM users u JOIN profiles p ON p.id = u.id WHERE u.email = ?',
    [email]);
  const u = rows[0];
  if (!u || !u.password_hash || !bcrypt.compareSync(password || '', u.password_hash)) throw new Error('Wrong email or password');
  if (!u.approved) throw new Error('Your account is not approved yet');
  req.session.user = { id: u.id, email: u.email, full_name: u.full_name, role: u.role };
  res.json(req.session.user);
}));

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => res.json(req.session.user || null));

// ---- my data
app.get('/api/my/weight', needLogin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, log_date, weight_kg FROM body_metrics WHERE user_id = ? ORDER BY log_date DESC LIMIT 30', [req.session.user.id]);
  res.json(rows);
}));

app.post('/api/my/weight', needLogin, wrap(async (req, res) => {
  const { log_date, weight_kg } = req.body;
  await pool.query('INSERT INTO body_metrics (user_id, log_date, weight_kg) VALUES (?, ?, ?)',
    [req.session.user.id, log_date, weight_kg]);
  res.json({ ok: true });
}));

app.put('/api/my/weight/:id', needLogin, wrap(async (req, res) => {
  await pool.query('UPDATE body_metrics SET weight_kg = ? WHERE id = ? AND user_id = ?',
    [req.body.weight_kg, req.params.id, req.session.user.id]);
  res.json({ ok: true });
}));

app.delete('/api/my/weight/:id', needLogin, wrap(async (req, res) => {
  await pool.query('DELETE FROM body_metrics WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
  res.json({ ok: true });
}));

app.get('/api/my/workouts', needLogin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ws.session_date, r.name AS routine, COUNT(s.id) AS sets, ROUND(SUM(s.weight_kg * s.reps)) AS volume_kg
     FROM workout_sessions ws
     LEFT JOIN routines r ON r.id = ws.routine_id
     LEFT JOIN workout_sets s ON s.session_id = ws.id
     WHERE ws.user_id = ? GROUP BY ws.id, ws.session_date, r.name ORDER BY ws.session_date DESC LIMIT 20`, [req.session.user.id]);
  res.json(rows);
}));

app.get('/api/my/food', needLogin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT fl.log_date, ROUND(SUM(fl.quantity_g * f.calories_per_100g / 100)) AS kcal,
            ROUND(SUM(fl.quantity_g * f.protein_per_100g / 100)) AS protein_g
     FROM food_logs fl JOIN foods f ON f.id = fl.food_id
     WHERE fl.user_id = ? GROUP BY fl.log_date ORDER BY fl.log_date DESC LIMIT 14`, [req.session.user.id]);
  res.json(rows);
}));

// ---- admin
app.get('/api/admin/users', needAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT u.id, u.email, p.full_name, p.goal, p.role, p.approved FROM users u JOIN profiles p ON p.id = u.id ORDER BY u.created_at');
  res.json(rows);
}));

app.post('/api/admin/users', needAdmin, wrap(async (req, res) => {
  const { email, password, full_name, role } = req.body;
  await createUser(email, password, full_name, role === 'admin' ? 'admin' : 'user');
  res.json({ ok: true });
}));

app.put('/api/admin/users/:id/approved', needAdmin, wrap(async (req, res) => {
  await pool.query('UPDATE profiles SET approved = ? WHERE id = ?', [req.body.approved ? 1 : 0, req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', needAdmin, wrap(async (req, res) => {
  if (req.params.id === req.session.user.id) throw new Error('You cannot delete yourself');
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]); // cascades to profile and their data
  res.json({ ok: true });
}));

app.get('/api/admin/table/:name', needAdmin, wrap(async (req, res) => {
  if (!TABLES.includes(req.params.name)) throw new Error('Unknown table');
  const [rows] = await pool.query(`SELECT * FROM \`${req.params.name}\` LIMIT 200`);
  res.json(rows.map((r) => { delete r.password_hash; return r; }));
}));

// Read-only SQL box for the demo: a single SELECT statement only.
app.post('/api/admin/sql', needAdmin, wrap(async (req, res) => {
  const sql = String(req.body.sql || '').trim().replace(/;+\s*$/, '');
  if (!/^select\b/i.test(sql) || sql.includes(';')) throw new Error('Only a single SELECT statement is allowed here');
  if (/password_hash/i.test(sql)) throw new Error('password_hash is hidden');
  const [rows] = await pool.query({ sql, rowsAsArray: false });
  res.json(Array.isArray(rows) ? rows.slice(0, 500) : rows);
}));

async function start() {
  // Give the sample users (which came from the Supabase copy) a demo password so they can log in.
  const [blank] = await pool.query('SELECT id, email FROM users WHERE password_hash IS NULL');
  for (const u of blank) await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(defaultPasswordFor(u.email), 10), u.id]);
  if (blank.length) console.log(`Gave ${blank.length} user(s) their default password (name before @ + 123).`);
  const [u] = await pool.query("SELECT email FROM users u JOIN profiles p ON p.id = u.id WHERE p.role = 'admin' LIMIT 1");
  if (u[0]) console.log(`Admin login: ${u[0].email} / ${defaultPasswordFor(u[0].email)}`);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Open http://localhost:${port}`));
}

start().catch((e) => {
  console.error('Could not start. Is MySQL running, schema.sql loaded, and .env filled in?\n', e.message);
  process.exit(1);
});
