// Generates seed_data.sql: 43 extra users with 60 days of realistic training, food and weight data.
// Run:  node tools/make_seed.js   (writes ../seed_data.sql).  Fixed random seed -> same data every time.
// Load order in MySQL: schema.sql first (resets the database), then seed_data.sql.
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

let seed = 20261016
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5
const step = (x, s) => Math.round(x / s) * s

const START = Date.UTC(2026, 7, 1)            // 2026-08-17 (day 0); 60 days -> 2026-10-15
const DAYS = 76
const day = (d) => new Date(START + d * 86400000)
const ymd = (dt) => dt.toISOString().slice(0, 10)
const ts = (dt) => dt.toISOString().slice(0, 19).replace('T', ' ')
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'")

const people = [['Charith Dasari', 'm'], ['Mamidala Som Praneeth Babu', 'm']]
const extra = []   // UPDATE statements for the two existing accounts
const UNAPPROVED = new Set([])           // people who registered but were never approved (no data)

// exercise ids come from schema.sql (1..43 in insertion order); base = working weight in kg for an average man
const PUSH = [[1, 60, '6-8'], [4, 22, '8-12'], [27, 40, '8-10'], [29, 8, '12-15'], [37, 25, '10-12']]
const PULL = [[9, 55, '6-8'], [13, 50, '8-10'], [14, 50, '10-12'], [32, 25, '8-10'], [16, 20, '12-15']]
const LEGS = [[17, 80, '5-8'], [19, 70, '6-8'], [20, 140, '10-12'], [24, 45, '12-15'], [26, 60, '12-15']]
const SPLIT = [['Push Day', 'push', PUSH], ['Pull Day', 'pull', PULL], ['Leg Day', 'legs', LEGS]]

// food ids from schema.sql (1..43): [food_id, grams]
const BREAKFAST = [[[19, 80], [26, 118], [10, 30], [40, 250]], [[7, 174], [24, 88], [34, 50]], [[12, 170], [28, 80], [29, 21], [33, 30]]]
const LUNCH = [[[16, 200], [1, 200], [39, 200], [31, 14]], [[22, 250], [6, 112], [38, 50], [35, 30]], [[17, 200], [14, 200], [37, 150]]]
const DINNER = [[[4, 130], [20, 200], [37, 150]], [[3, 200], [16, 200], [38, 50]], [[2, 190], [21, 250], [39, 200]]]
const SNACK = [[[27, 180], [32, 16]], [[42, 60]], [[30, 24], [13, 200]], [[36, 20]]]

const next = JSON.parse(process.env.NEXT)
const rows = { users: [], profiles: [], nutrition_targets: [], body_metrics: [], routines: [], routine_exercises: [], workout_sessions: [], workout_sets: [], food_logs: [] }
// each user's password = the part of the email before @ plus 123 (hashed below)

people.forEach(([name, sex], i) => {
  const uid = [48, 49][i]
  const female = sex === 'f'
  const height = female ? rint(150, 172) : rint(164, 190)
  const bmi = female ? 20 + rnd() * 8 : 21 + rnd() * 8
  const w0 = Math.round(bmi * (height / 100) ** 2 * 10) / 10
  const goal = pick(['cut', 'cut', 'bulk', 'bulk', 'maintain'])
  const rate = goal === 'cut' ? -(0.25 + rnd() * 0.35) : goal === 'bulk' ? 0.15 + rnd() * 0.2 : 0
  const rateR = Math.round(rate * 100) / 100
  const level = (0.6 + rnd() * 0.5) * (female ? 0.65 : 1)
  const created = new Date(START - rint(1, 14) * 86400000 + rint(0, 80000) * 1000)
  const email = name.toLowerCase().replace(/ /g, '.') + '@example.com'
  const approved = !UNAPPROVED.has(i)

  extra.push(`UPDATE users SET created_at = ${q(ts(created))} WHERE id = ${uid};`)
  extra.push(`UPDATE profiles SET goal = ${q(goal)}, goal_rate_kg_week = ${rateR}, height_cm = ${height}, onboarded = 1, created_at = ${q(ts(created))}, timezone = 'Asia/Kolkata' WHERE id = ${uid};`)
  if (!approved) { rows.body_metrics.push([next.bm++, uid, ymd(created), w0, null, null, null, null]); return }

  // ---- weigh-ins (about 80% of days) following the goal rate, plus noise
  const weightOn = (d) => Math.round((w0 + (rateR * d) / 7 + gauss() * 0.3) * 10) / 10
  for (let d = 0; d < DAYS; d++) if (rnd() < 0.8) rows.body_metrics.push([next.bm++, uid, ymd(day(d)), weightOn(d), null, null, null, null])

  // ---- daily calorie target (one at the start, a tweak for some people a month later)
  const maintain = w0 * (female ? 30 : 33)
  const cal0 = step(maintain + rateR * 1100, 10)
  const target = (cal, effective) => {
    const protein = Math.round(w0 * (goal === 'cut' ? 2.2 : 1.9))
    const fat = Math.round((cal * 0.27) / 9)
    const carbs = Math.max(0, Math.round((cal - protein * 4 - fat * 9) / 4))
    rows.nutrition_targets.push([next.nt++, uid, effective, cal, protein, carbs, fat, 'manual'])
  }
  target(cal0, ymd(day(0)))
  if (rnd() < 0.35) target(cal0 + pick([-100, 100, 150]), ymd(day(rint(28, 35))))

  // ---- three routines (push / pull / legs) with five exercises each
  const routineIds = SPLIT.map(([rname, style, exs]) => {
    const rid = next.routine++
    const made = ts(new Date(created.getTime() + 3600000))
    rows.routines.push([rid, uid, rname, null, made, made, style, null])
    exs.forEach(([eid, , reps], k) => rows.routine_exercises.push([next.re++, rid, eid, k + 1, k === 0 ? 4 : 3, reps, null, k === 0 ? 120 : 90, null]))
    return rid
  })

  // ---- workouts: 3 or 4 days a week, rotating push / pull / legs, ~10% skipped; weights creep up
  const perWeek = rnd() < 0.6 ? 3 : 4
  const weekdays = perWeek === 3 ? [0, 2, 4] : [0, 1, 3, 4]    // Mon.. (day 0 is a Monday)
  const bestE1rm = {}
  const done = {}
  let rot = 0
  for (let d = 0; d < DAYS; d++) {
    if (!weekdays.includes(d % 7) || rnd() < 0.1) continue
    const [, , exs] = SPLIT[rot % 3]
    const rid = routineIds[rot % 3]
    rot++
    const sid = next.session++
    const start = new Date(day(d).getTime() + (11 * 3600 + rint(0, 3 * 3600)) * 1000)
    const end = new Date(start.getTime() + rint(55, 85) * 60000)
    const note = rnd() < 0.08 ? pick(['Felt strong today.', 'A bit tired, kept it short.', 'Good pump.']) : null
    rows.workout_sessions.push([sid, uid, rid, ymd(day(d)), note, ts(start), ts(end)])
    exs.forEach(([eid, base, reps], k) => {
      done[eid] = (done[eid] || 0) + 1
      const w = Math.max(2.5, step(base * level * (1 + 0.006 * done[eid]) * (0.97 + rnd() * 0.06), 2.5))
      const lo = parseInt(reps, 10)
      const nSets = k === 0 ? 4 : 3
      for (let s = 1; s <= nSets; s++) {
        const r = Math.max(4, lo + rint(0, 2) - (s > 2 ? 1 : 0))
        const rpe = Math.min(10, Math.round((7 + s * 0.5 + rnd() * 0.5) * 2) / 2)
        const e1 = w * (1 + r / 30)
        const isPr = bestE1rm[eid] !== undefined && e1 > bestE1rm[eid] * 1.005 ? 1 : 0
        bestE1rm[eid] = Math.max(bestE1rm[eid] || 0, e1)
        rows.workout_sets.push([next.set++, sid, eid, s, w, r, rpe, 'normal', null, isPr])
      }
    })
  }

  // ---- food log: about 85% of days, breakfast / lunch / dinner and a snack or two, scaled to the calorie target
  for (let d = 0; d < DAYS; d++) {
    if (rnd() > 0.85) continue
    const date = ymd(day(d))
    const add = (mealType, items) => items.forEach(([fid, g]) => {
      const grams = fid === 31 ? g : Math.max(5, step(g * (cal0 / 2300) * (0.9 + rnd() * 0.2), 5))
      rows.food_logs.push([next.fl++, uid, fid, date, grams, mealType])
    })
    add('breakfast', pick(BREAKFAST)); add('lunch', pick(LUNCH)); add('dinner', pick(DINNER)); add('snack', pick(SNACK))
    if (rnd() < 0.3) add('snack', pick(SNACK))
  }
})

const COLS = {
  users: 'id, email, created_at, password_hash',
  profiles: 'id, full_name, goal, goal_rate_kg_week, height_cm, onboarded, created_at, approved, role, timezone',
  nutrition_targets: 'id, user_id, effective_date, calories, protein_g, carbs_g, fat_g, source',
  body_metrics: 'id, user_id, log_date, weight_kg, waist_cm, chest_cm, arm_cm, photo_url',
  routines: 'id, user_id, name, notes, created_at, updated_at, style, deleted_at',
  routine_exercises: 'id, routine_id, exercise_id, order_index, target_sets, target_rep_range, target_rpe, rest_seconds, notes',
  workout_sessions: 'id, user_id, routine_id, session_date, notes, started_at, ended_at',
  workout_sets: 'id, session_id, exercise_id, set_number, weight_kg, reps, rpe, set_type, notes, is_pr',
  food_logs: 'id, user_id, food_id, log_date, quantity_g, meal_type',
}
let sql = `-- FitStack extra sample data for the two team accounts (ids 48, 49): 76 days (2026-08-01 .. 2026-10-15) of weigh-ins,
-- workouts and food logs. Generated by tools/make_seed.js. Load AFTER schema.sql. Every user's password is: the part of the email before @, plus 123.
USE fitstack;

${extra.join('\n')}

`
for (const table of Object.keys(COLS)) {
  const list = rows[table]
  for (let i = 0; i < list.length; i += 500) {
    sql += `INSERT INTO ${table} (${COLS[table]}) VALUES\n` + list.slice(i, i + 500).map((r) => '(' + r.map(q).join(',') + ')').join(',\n') + ';\n\n'
  }
}
sql += `-- One row per user, handy in Workbench: SELECT * FROM v_user_summary;
CREATE OR REPLACE VIEW v_user_summary AS
SELECT u.id AS user_id, u.email, p.full_name, p.goal, p.approved,
       w.workouts, st.sets_logged, n.avg_kcal_per_day, b0.weight_kg AS first_weight_kg, b1.weight_kg AS latest_weight_kg
FROM users u
JOIN profiles p ON p.id = u.id
LEFT JOIN (SELECT user_id, COUNT(*) AS workouts FROM workout_sessions GROUP BY user_id) w ON w.user_id = u.id
LEFT JOIN (SELECT ws.user_id, COUNT(*) AS sets_logged FROM workout_sets s JOIN workout_sessions ws ON ws.id = s.session_id GROUP BY ws.user_id) st ON st.user_id = u.id
LEFT JOIN (SELECT user_id, ROUND(AVG(kcal)) AS avg_kcal_per_day
           FROM (SELECT fl.user_id, fl.log_date, SUM(fl.quantity_g * f.calories_per_100g / 100) AS kcal
                 FROM food_logs fl JOIN foods f ON f.id = fl.food_id GROUP BY fl.user_id, fl.log_date) d
           GROUP BY user_id) n ON n.user_id = u.id
LEFT JOIN (SELECT user_id, MIN(log_date) AS d0, MAX(log_date) AS d1 FROM body_metrics GROUP BY user_id) bm ON bm.user_id = u.id
LEFT JOIN body_metrics b0 ON b0.user_id = u.id AND b0.log_date = bm.d0
LEFT JOIN body_metrics b1 ON b1.user_id = u.id AND b1.log_date = bm.d1;
`
fs.writeFileSync(path.join(__dirname, '..', 'seed_charith_praneeth.sql'), sql)
console.log(Object.entries(rows).map(([t, r]) => `${t}: ${r.length}`).join('\n'))
