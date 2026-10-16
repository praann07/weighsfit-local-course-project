// Local replacement for Supabase: a small Express + MySQL API that understands the same
// query shapes the FitStack frontend sends (via frontend/src/lib/supabase.ts), and applies
// the same access rules as the Supabase row-level-security policies.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const OTP_CODE = process.env.OTP_CODE || '123456';
const AUTO_APPROVE = String(process.env.AUTO_APPROVE || 'true') !== 'false';
// Default password for any account that has none yet: the part of the email before @, plus 123 (user3@example.com -> user3123)
const defaultPasswordFor = (email) => email.split('@')[0] + '123';
const PORT = Number(process.env.API_PORT || 4000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fitstack',
  dateStrings: true,
  typeCast(field, next) {
    // ids are plain numbers in MySQL but the frontend treats ids as strings (URL params, ===), so hand them out as strings.
    if (field.type === 'LONG' && (field.name === 'id' || field.name.endsWith('_id') || field.name === 'created_by')) {
      const v = field.string(); return v === null ? null : v;
    }
    if (field.type === 'TINY' && field.length === 1) { const v = field.string(); return v === null ? null : v === '1'; }
    if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') { const v = field.string(); return v ? v.replace(' ', 'T') + 'Z' : null; }
    if (field.type === 'JSON') { const v = field.string(); return v ? JSON.parse(v) : null; }
    if (field.type === 'NEWDECIMAL' || field.type === 'DECIMAL') { const v = field.string(); return v === null ? null : Number(v); }
    return next();
  },
});

// ---------------------------------------------------------------- helpers
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)$/;
const q = (name) => { if (!IDENT.test(name)) throw new Error('Bad identifier: ' + name); return '`' + name + '`'; };

function norm(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && ISO.test(v)) return new Date(v).toISOString().slice(0, 19).replace('T', ' ');
  return v;
}

class DbError extends Error {
  constructor(message, code = '42501', status = 403) { super(message); this.code = code; this.status = status; }
}

function b64(s) { return Buffer.from(s).toString('base64url'); }
function signToken(user) {
  const body = b64(JSON.stringify({ sub: user.id, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(header) {
  const t = String(header || '').replace(/^Bearer\s+/i, '');
  const [body, sig] = t.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data.sub : null;
}

async function loadUser(id) {
  const [rows] = await pool.query(
    'SELECT u.id, u.email, p.role, p.approved FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = ?', [id]);
  return rows[0] || null;
}

// ---------------------------------------------------------------- access rules (RLS equivalent)
const OWNED_APPROVED = ['routines', 'workout_sessions', 'food_logs'];
const OWNED_ANY = ['body_metrics', 'nutrition_targets'];
const SHARED = ['exercises', 'foods'];
const CHILD = {
  routine_exercises: { col: 'routine_id', parent: 'routines', owner: 'user_id' },
  workout_sets: { col: 'session_id', parent: 'workout_sessions', owner: 'user_id' },
};
const EMBEDS = { routine_exercises: { exercises: 'exercise_id' } };

function scope(table, op, me) {
  const deny = () => { if (op === 'select') return { sql: '1=0', params: [] }; throw new DbError('permission denied for table ' + table); };
  if (OWNED_ANY.includes(table)) return { sql: 'user_id = ?', params: [me.id] };
  if (OWNED_APPROVED.includes(table)) return me.approved ? { sql: 'user_id = ?', params: [me.id] } : deny();
  if (SHARED.includes(table)) {
    if (op === 'select') return { sql: '(is_custom = 0 OR created_by = ?)', params: [me.id] };
    return me.approved ? { sql: 'created_by = ?', params: [me.id] } : deny();
  }
  if (CHILD[table]) {
    const c = CHILD[table];
    return me.approved
      ? { sql: `${q(c.col)} IN (SELECT id FROM ${q(c.parent)} WHERE ${q(c.owner)} = ?)`, params: [me.id] }
      : deny();
  }
  if (table === 'profiles') return { sql: 'id = ?', params: [me.id] };
  throw new DbError('unknown table ' + table, '42P01', 404);
}

function filterSql(filters) {
  const parts = []; const params = [];
  for (const f of filters || []) {
    if (f.t === 'or') {
      const ors = String(f.expr).split(',').map((piece) => {
        const m = piece.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|ilike|like)\.(.*)$/);
        if (!m) throw new DbError('Unsupported or() filter', '42601', 400);
        params.push(m[2] === 'eq' ? norm(m[3]) : m[3]);
        return m[2] === 'eq' ? `${q(m[1])} = ?` : `${q(m[1])} LIKE ?`;
      });
      parts.push('(' + ors.join(' OR ') + ')');
      continue;
    }
    const c = q(f.c);
    switch (f.t) {
      case 'eq': parts.push(`${c} = ?`); params.push(norm(f.v)); break;
      case 'neq': parts.push(`${c} <> ?`); params.push(norm(f.v)); break;
      case 'gt': parts.push(`${c} > ?`); params.push(norm(f.v)); break;
      case 'gte': parts.push(`${c} >= ?`); params.push(norm(f.v)); break;
      case 'lt': parts.push(`${c} < ?`); params.push(norm(f.v)); break;
      case 'lte': parts.push(`${c} <= ?`); params.push(norm(f.v)); break;
      case 'like': case 'ilike': parts.push(`${c} LIKE ?`); params.push(f.v); break;
      case 'is': parts.push(f.v === null ? `${c} IS NULL` : `${c} = ?`); if (f.v !== null) params.push(norm(f.v)); break;
      case 'not':
        if (f.op === 'is' && f.v === null) parts.push(`${c} IS NOT NULL`);
        else { parts.push(`${c} <> ?`); params.push(norm(f.v)); }
        break;
      case 'in':
        if (!f.v.length) parts.push('1=0');
        else { parts.push(`${c} IN (${f.v.map(() => '?').join(',')})`); params.push(...f.v.map(norm)); }
        break;
      default: throw new DbError('Unsupported filter ' + f.t, '42601', 400);
    }
  }
  return { sql: parts, params };
}

function parseColumns(columns) {
  const embeds = []; let rest = String(columns || '*');
  rest = rest.replace(/([A-Za-z_]\w*):([A-Za-z_]\w*)\(\*\)/g, (_, alias, table) => { embeds.push({ alias, table }); return ''; });
  const cols = rest.split(',').map((s) => s.trim()).filter(Boolean);
  return { cols: cols.length ? cols : ['*'], embeds };
}

async function selectRows(table, spec, me, extraWhere) {
  const sc = scope(table, 'select', me);
  const f = filterSql(spec.filters);
  const where = [sc.sql, ...f.sql, ...(extraWhere ? [extraWhere.sql] : [])].join(' AND ');
  const params = [...sc.params, ...f.params, ...(extraWhere ? extraWhere.params : [])];
  const { cols, embeds } = parseColumns(spec.columns);
  const colSql = cols.map((c) => (c === '*' ? '*' : q(c))).join(', ');
  let sql = `SELECT ${colSql} FROM ${q(table)} WHERE ${where}`;
  if (spec.order && spec.order.length) {
    sql += ' ORDER BY ' + spec.order.map((o) => (o.asc
      ? `${q(o.c)} IS NULL, ${q(o.c)} ASC` : `${q(o.c)} IS NOT NULL, ${q(o.c)} DESC`)).join(', ');
  }
  if (spec.limit != null) sql += ` LIMIT ${Number(spec.limit) | 0}`;
  const [rows] = await pool.query(sql, params);
  for (const e of embeds) {
    const fk = EMBEDS[table] && EMBEDS[table][e.table];
    if (!fk) throw new DbError('Unsupported embed ' + e.table, '42601', 400);
    const ids = [...new Set(rows.map((r) => r[fk]).filter(Boolean))];
    const map = {};
    if (ids.length) {
      const [sub] = await pool.query(`SELECT * FROM ${q(e.table)} WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      sub.forEach((s) => { map[s.id] = s; });
    }
    rows.forEach((r) => { r[e.alias] = map[r[fk]] || null; });
  }
  return { rows, where, params };
}

async function countRows(table, spec, me) {
  const sc = scope(table, 'select', me);
  const f = filterSql(spec.filters);
  const [r] = await pool.query(`SELECT COUNT(*) AS n FROM ${q(table)} WHERE ${[sc.sql, ...f.sql].join(' AND ')}`, [...sc.params, ...f.params]);
  return r[0].n;
}

function shape(spec, rows) {
  if (!spec.single) return { data: rows, error: null };
  if (rows.length === 1) return { data: rows[0], error: null };
  if (spec.single === 'maybe' && rows.length === 0) return { data: null, error: null };
  return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', status: 406 } };
}

async function checkInsertRow(table, row, me) {
  if (OWNED_ANY.includes(table) || OWNED_APPROVED.includes(table)) {
    if (OWNED_APPROVED.includes(table) && !me.approved) throw new DbError('permission denied for table ' + table);
    if (row.user_id && String(row.user_id) !== String(me.id)) throw new DbError('new row violates row-level security policy for table ' + table);
    row.user_id = me.id;
    if (table === 'food_logs') {
      const [f] = await pool.query('SELECT id FROM foods WHERE id = ? AND (is_custom = 0 OR created_by = ?)', [row.food_id, me.id]);
      if (!f.length) throw new DbError('new row violates row-level security policy for table food_logs');
    }
  } else if (SHARED.includes(table)) {
    if (!me.approved || !norm(row.is_custom)) throw new DbError('new row violates row-level security policy for table ' + table);
    row.created_by = me.id;
  } else if (CHILD[table]) {
    const c = CHILD[table];
    if (!me.approved) throw new DbError('permission denied for table ' + table);
    const [p] = await pool.query(`SELECT id FROM ${q(c.parent)} WHERE id = ? AND ${q(c.owner)} = ?`, [row[c.col], me.id]);
    if (!p.length) throw new DbError('new row violates row-level security policy for table ' + table);
  } else {
    throw new DbError('permission denied for table ' + table);
  }
}

async function runQuery(spec, me) {
  const table = spec.table;
  if (!IDENT.test(table)) throw new DbError('bad table', '42P01', 400);
  const op = spec.op;

  if (op === 'select') {
    const { rows } = await selectRows(table, spec, me);
    const count = spec.count ? await countRows(table, spec, me) : null;
    if (spec.head) return { data: null, error: null, count };
    return { ...shape(spec, rows), count };
  }

  if (op === 'insert' || op === 'upsert') {
    const list = (Array.isArray(spec.values) ? spec.values : [spec.values]).map((r) => ({ ...r }));
    const conflict = op === 'upsert' && spec.onConflict ? String(spec.onConflict).split(',').map((s) => s.trim()) : [];
    const keyed = [];
    for (const row of list) {
      await checkInsertRow(table, row, me);
      delete row.id; // MySQL numbers new rows itself (AUTO_INCREMENT)
      const cols = Object.keys(row);
      const vals = cols.map((c) => norm(row[c]));
      let sql = `INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      if (op === 'upsert') {
        const upd = cols.filter((c) => !conflict.includes(c));
        sql += ' AS new ON DUPLICATE KEY UPDATE ' + (upd.length ? upd.map((c) => `${q(c)} = new.${q(c)}`).join(', ') : 'id = id');
      }
      const [result] = await pool.query(sql, vals);
      keyed.push(conflict.length ? { conflict: conflict.map((c) => [c, norm(row[c])]) } : { id: result.insertId });
    }
    if (!spec.returning) return { data: null, error: null };
    const out = [];
    for (const k of keyed) {
      const where = k.conflict
        ? { sql: k.conflict.map(([c]) => `${q(c)} = ?`).join(' AND '), params: k.conflict.map(([, v]) => v) }
        : { sql: 'id = ?', params: [k.id] };
      const { rows } = await selectRows(table, { columns: spec.columns, filters: [] }, me, where);
      out.push(...rows);
    }
    return shape(spec, out);
  }

  if (op === 'update' || op === 'delete') {
    const sc = scope(table, op, me);
    const f = filterSql(spec.filters);
    const whereSql = [sc.sql, ...f.sql].join(' AND ');
    const params = [...sc.params, ...f.params];
    const [found] = await pool.query(`SELECT id FROM ${q(table)} WHERE ${whereSql}`, params);
    const ids = found.map((r) => r.id);
    if (!ids.length) return spec.returning ? shape(spec, []) : { data: null, error: null, count: 0 };
    const inIds = `id IN (${ids.map(() => '?').join(',')})`;

    if (op === 'delete') {
      await pool.query(`DELETE FROM ${q(table)} WHERE ${inIds}`, ids);
      return { data: null, error: null, count: ids.length };
    }

    const patch = { ...spec.values };
    delete patch.id; delete patch.user_id; delete patch.created_by;
    if (table === 'profiles' && ('approved' in patch || 'role' in patch) && me.role !== 'admin') {
      throw new DbError('forbidden');
    }
    const cols = Object.keys(patch);
    if (cols.length) {
      await pool.query(`UPDATE ${q(table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE ${inIds}`,
        [...cols.map((c) => norm(patch[c])), ...ids]);
    }
    if (!spec.returning) return { data: null, error: null, count: ids.length };
    const [rows] = await pool.query(`SELECT * FROM ${q(table)} WHERE ${inIds}`, ids);
    return { ...shape(spec, rows), count: ids.length };
  }

  throw new DbError('Unsupported operation ' + op, '42601', 400);
}

// ---------------------------------------------------------------- server
const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '2mb' }));

const route = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    const dup = e.code === 'ER_DUP_ENTRY';
    const fk = e.code === 'ER_NO_REFERENCED_ROW_2' || e.code === 'ER_ROW_IS_REFERENCED_2';
    res.json({
      data: null, count: null,
      error: {
        message: dup ? 'duplicate key value violates unique constraint' : fk ? 'violates foreign key constraint' : e.message,
        code: dup ? '23505' : fk ? '23503' : e.code || 'ERROR',
        status: dup ? 409 : e.status || 400,
      },
    });
  }
};

const authed = (fn) => route(async (req, res) => {
  const id = readToken(req.headers.authorization);
  const me = id && await loadUser(id);
  if (!me) return res.json({ data: null, count: null, error: { message: 'JWT invalid or expired', code: 'PGRST301', status: 401 } });
  await fn(req, res, me);
});

const authFail = (res, message, status = 400) => res.json({ error: { message, status } });
const sessionFor = (u) => ({ user: { id: u.id, email: u.email }, access_token: signToken(u) });

app.post('/auth/signup', route(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 6) return authFail(res, 'Password should be at least 6 characters.');
  let id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [created] = await conn.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email.toLowerCase(), bcrypt.hashSync(password, 10)]);
    id = String(created.insertId); // the new user's simple number (5, 6, 7, ...)
    await conn.query('INSERT INTO profiles (id, approved, role) VALUES (?, ?, ?)', [id, AUTO_APPROVE ? 1 : 0, 'user']);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return authFail(res, 'User already registered');
    throw e;
  } finally { conn.release(); }
  res.json({ data: sessionFor({ id, email: email.toLowerCase() }), error: null });
}));

app.post('/auth/password', route(async (req, res) => {
  const { email, password } = req.body || {};
  const [rows] = await pool.query('SELECT id, email, password_hash FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
  const u = rows[0];
  if (!u || !u.password_hash || !bcrypt.compareSync(password || '', u.password_hash)) return authFail(res, 'Invalid login credentials', 400);
  res.json({ data: sessionFor(u), error: null });
}));

app.post('/auth/otp/send', route(async (req, res) => {
  console.log(`[login code] ${req.body.email}: ${OTP_CODE}`);
  res.json({ data: {}, error: null });
}));

app.post('/auth/otp/verify', route(async (req, res) => {
  const { email, token } = req.body || {};
  if (String(token).trim() !== OTP_CODE) return authFail(res, 'Token has expired or is invalid');
  const [rows] = await pool.query('SELECT id, email FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
  if (!rows[0]) return authFail(res, 'Token has expired or is invalid');
  res.json({ data: sessionFor(rows[0]), error: null });
}));

app.get('/auth/user', authed(async (req, res, me) => res.json({ data: { user: { id: me.id, email: me.email } }, error: null })));

// The real project emails a notification here; locally it is a no-op.
app.post('/functions/v1/send-auth-email', (req, res) => res.json({}));

app.post('/rest/query', authed(async (req, res, me) => res.json({ count: null, ...(await runQuery(req.body, me)) })));

app.post('/rpc/:name', authed(async (req, res, me) => {
  if (me.role !== 'admin') throw new DbError('forbidden');
  if (req.params.name === 'admin_list_users') {
    const [rows] = await pool.query(
      'SELECT u.id, p.full_name, u.email, p.approved, p.role, u.created_at FROM users u JOIN profiles p ON p.id = u.id ORDER BY u.created_at');
    return res.json({ data: rows, error: null });
  }
  if (req.params.name === 'admin_set_approved') {
    await pool.query('UPDATE profiles SET approved = ? WHERE id = ?', [req.body.approved ? 1 : 0, req.body.target_uid]);
    return res.json({ data: null, error: null });
  }
  throw new DbError('Unknown function ' + req.params.name, '42883', 404);
}));

async function start() {
  const [blank] = await pool.query('SELECT id, email FROM users WHERE password_hash IS NULL');
  for (const u of blank) await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(defaultPasswordFor(u.email), 10), u.id]);
  if (blank.length) console.log(`Gave ${blank.length} user(s) their default password (name before @ + 123).`);
  const [a] = await pool.query("SELECT u.email FROM users u JOIN profiles p ON p.id = u.id WHERE p.role = 'admin' LIMIT 1");
  if (a[0]) console.log(`Admin login: ${a[0].email} / ${defaultPasswordFor(a[0].email)}`);
  console.log(`Login code for everyone (local demo): ${OTP_CODE}`);
  app.listen(PORT, () => console.log(`Local API on http://localhost:${PORT}`));
}

start().catch((e) => {
  console.error('Could not start. Is MySQL running, schema.sql loaded, and .env filled in?\n', e.message);
  process.exit(1);
});
