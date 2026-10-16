# WeighsFit / FitStack — DBMS Final Review Preparation Roadmap
> Course: 23AIE303 DBMS | Database: `fitstack` (MySQL 8)
> Be brutal with yourself. The reviewer will be.

---

## YOUR DATABASE AT A GLANCE

11 tables, ~47,000 rows, 47 users, 60 days of data.

| Table | Rows (approx) | What it stores |
|---|---|---|
| users | 47 | login credentials |
| profiles | 47 | personal details, goal, role |
| exercises | 43 | exercise library |
| foods | 43 | food/nutrition library |
| routines | 130 | workout plans per user |
| routine_exercises | 641 | exercises inside a routine (junction) |
| workout_sessions | 800+ | each gym visit |
| workout_sets | 17,000+ | each set logged in a session (junction) |
| food_logs | 25,000+ | each food entry per day (junction) |
| nutrition_targets | 66 | daily calorie/macro targets |
| body_metrics | 1,994 | daily weigh-ins |

---

# PHASE 1 — DBMS FUNDAMENTALS

---

## 1.1 DBMS vs RDBMS

**DBMS** = software to store and retrieve data (e.g. file-based systems, MongoDB).
**RDBMS** = DBMS that stores data in tables with relationships, enforces constraints, supports SQL (e.g. MySQL, PostgreSQL, Oracle).

| Feature | DBMS | RDBMS |
|---|---|---|
| Data model | any (files, documents) | tables (relations) |
| Relationships | manual | enforced via FK |
| Constraints | none built-in | PK, FK, CHECK, UNIQUE |
| ACID | not guaranteed | guaranteed |
| Query language | varies | SQL |

**Your project:** MySQL 8 = RDBMS. InnoDB engine = full ACID + FK support.

**Viva Q:** "Why did you choose MySQL over MongoDB for this project?"
**A:** FitStack data is highly relational — a workout set belongs to a session, which belongs to a user, which has a profile. Enforcing those links with foreign keys and getting ACID transactions is exactly what an RDBMS gives you. A document store would require the application to manually maintain those links, which is error-prone.

---

## 1.2 Keys

| Key type | Definition | Example in your DB |
|---|---|---|
| Primary Key (PK) | uniquely identifies each row | `users.id`, `workout_sets.id` |
| Foreign Key (FK) | references PK of another table | `profiles.id → users.id` |
| Unique Key | no duplicates, can be NULL | `users.email` |
| Composite Key | PK made of 2+ columns | `(user_id, log_date)` on `body_metrics` (UNIQUE, not PK) |
| Candidate Key | any column(s) that could be PK | `users.id` and `users.email` are both candidate keys |
| Super Key | any superset of a candidate key | `(id, email)` is a super key |
| Surrogate Key | artificial PK (no business meaning) | all your `id INT AUTO_INCREMENT` columns |
| Natural Key | PK with real-world meaning | `users.email` (enforced via UNIQUE) |

**Critical point:** `profiles.id` is NOT AUTO_INCREMENT. It equals `users.id`. This is a shared primary key — the profile row is created at the same time as the user row, in a transaction.

**Viva Q:** "What is the difference between a candidate key and a primary key?"
**A:** A candidate key is any minimal set of attributes that uniquely identifies a row. A primary key is the one candidate key you choose to be the official identifier. In `users`, both `id` and `email` are candidate keys; we chose `id` as PK and enforced `email` with a UNIQUE constraint.

---

## 1.3 Constraints

Every constraint in your schema — know each one cold.

### PRIMARY KEY
```sql
PRIMARY KEY (id)  -- on every table
```
Enforces uniqueness + NOT NULL. InnoDB creates a clustered index on it.

### FOREIGN KEY
```sql
CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
CONSTRAINT workout_sessions_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES routines (id) ON DELETE SET NULL
CONSTRAINT workout_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises (id)  -- default RESTRICT
```

Three delete rules used in your project:
- **CASCADE** — delete user → delete their profile, routines, sessions, sets, food logs, body metrics, targets automatically.
- **SET NULL** — delete a routine → `workout_sessions.routine_id` becomes NULL (history preserved).
- **RESTRICT** (default) — cannot delete an exercise or food that has sets/logs referencing it.

### UNIQUE
```sql
UNIQUE KEY uq_users_email (email)
UNIQUE KEY body_metrics_user_id_log_date_key (user_id, log_date)
UNIQUE KEY nutrition_targets_user_date_unique (user_id, effective_date)
```
The composite UNIQUE on `body_metrics` means one weigh-in per user per day. Try inserting two rows for the same user+date → MySQL error 1062.

### CHECK
```sql
CONSTRAINT profiles_goal_check CHECK (goal IN ('bulk','cut','maintain'))
CONSTRAINT profiles_role_check CHECK (role IN ('user','admin'))
CONSTRAINT routines_style_check CHECK (style IS NULL OR style IN ('push','pull','legs','upper','lower','full-body','arms','core'))
CONSTRAINT workout_sets_set_type_check CHECK (set_type IN ('normal','warmup','drop','amrap','failure'))
CONSTRAINT food_logs_meal_type_check CHECK (meal_type IN ('breakfast','lunch','dinner','snack','other'))
```

### NOT NULL + DEFAULT
```sql
rest_seconds INT NOT NULL DEFAULT 90
approved     BOOLEAN NOT NULL DEFAULT 0
role         VARCHAR(10) NOT NULL DEFAULT 'user'
```

**Viva Q:** "What happens if you try to insert a food_log with meal_type = 'brunch'?"
**A:** MySQL raises error 3819 — the CHECK constraint `meal_type IN ('breakfast','lunch','dinner','snack','other')` rejects it. The row is never inserted.

**Viva Q:** "Why is `workout_sessions.routine_id` nullable?"
**A:** A user can do a freestyle workout without following any routine. Making it nullable with ON DELETE SET NULL means if the routine is later deleted, the workout history is not lost — the session still exists, just without a routine link.

---

## 1.4 ER Diagrams

Your ER diagram has 11 entities. Key relationships:

```
users  1:1  profiles          (one user has exactly one profile)
users  1:N  routines          (one user creates many routines)
users  1:N  workout_sessions  (one user performs many sessions)
users  1:N  food_logs         (one user logs many food entries)
users  1:N  body_metrics      (one user records many weigh-ins)
users  1:N  nutrition_targets (one user sets many targets over time)

routines   M:N  exercises  → resolved by routine_exercises
sessions   M:N  exercises  → resolved by workout_sets
users      M:N  foods      → resolved by food_logs
```

**Junction tables and their extra attributes:**

| Junction | Resolves | Extra attributes |
|---|---|---|
| routine_exercises | routines ↔ exercises | order_index, target_sets, target_rep_range, target_rpe, rest_seconds |
| workout_sets | sessions ↔ exercises | set_number, weight_kg, reps, rpe, set_type, is_pr |
| food_logs | users ↔ foods | log_date, quantity_g, meal_type |

**Viva Q:** "Why do you need a junction table for routines and exercises?"
**A:** Because the relationship is many-to-many — one routine contains many exercises, and one exercise can appear in many routines. A junction table `routine_exercises` resolves this and also stores the extra data specific to that pairing: the order, target sets, rep range, and rest time.

---

## 1.5 Relationships (Cardinality)

| Notation | Meaning |
|---|---|
| 1:1 | users ↔ profiles |
| 1:N | users → routines |
| M:N | routines ↔ exercises (via routine_exercises) |
| Optional (0 or 1) | workout_sessions.routine_id (can be NULL) |

**Participation:**
- **Total participation:** every profile must have a user (NOT NULL FK). Every workout_set must have a session.
- **Partial participation:** a user may have zero workout sessions (users 4, 25, 38 in your data never trained).

---

## 1.6 Normalization

### The problem (un-normalized flat table)
Imagine storing everything in one table:
```
FlatLog(user_email, user_name, goal, exercise_name, muscle_group, session_date, set_no, weight, reps, food_name, kcal_per_100g, grams, meal_type)
```

**Anomalies:**
- **Update anomaly:** change chicken breast calories → must update 500 rows.
- **Insert anomaly:** can't store a food until someone eats it.
- **Delete anomaly:** delete the last log for a food → lose the food's nutrition data.

### 1NF (First Normal Form)
- Each cell has one atomic value.
- No repeating groups.
- Your tables: all columns are atomic (no arrays, no comma-separated values). ✅

### 2NF (Second Normal Form)
- Must be in 1NF.
- No partial dependencies (every non-key attribute depends on the WHOLE primary key).
- Relevant when PK is composite.
- Example: in a hypothetical `(session_id, exercise_id, muscle_group)` table, `muscle_group` depends only on `exercise_id`, not the full composite key → partial dependency → move `muscle_group` to `exercises` table. ✅ Your schema does this.

### 3NF (Third Normal Form)
- Must be in 2NF.
- No transitive dependencies (non-key attribute depending on another non-key attribute).
- Example: `food_logs` stores `food_id` and `quantity_g`, NOT `calories`. Calories are derived by joining `foods`. If calories were stored in `food_logs`, then `food_id → calories` would be a transitive dependency through a non-key. ✅ Your schema avoids this.

### BCNF (Boyce-Codd Normal Form)
- Stricter than 3NF.
- For every functional dependency X → Y, X must be a superkey.
- All 11 tables in your schema satisfy BCNF.

### Functional Dependencies (FDs) — know these for viva

| Table | FD |
|---|---|
| users | id → email, password_hash, created_at |
| profiles | id → full_name, goal, height_cm, role, approved |
| exercises | id → name, muscle_group, equipment |
| foods | id → name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g |
| body_metrics | id → user_id, log_date, weight_kg; (user_id, log_date) → weight_kg |
| nutrition_targets | id → all; (user_id, effective_date) → calories, protein_g, carbs_g, fat_g |

### Intentional denormalizations (say these before they ask)
1. `workout_sessions.routine_snapshot` (JSON) — stores a frozen copy of the routine as it was when the session happened. Deliberate: if the user edits the routine later, history still shows what they actually did. Core relation without it is BCNF.
2. `workout_sets.is_pr` — a derived boolean flag (could be computed from previous sets). Stored for fast UI rendering. Intentional, documented.

---

## 1.7 Transactions and ACID

**ACID properties:**

| Property | Meaning | Example in your project |
|---|---|---|
| Atomicity | all or nothing | signup inserts `users` + `profiles` in one transaction; if profile insert fails, user insert is rolled back |
| Consistency | DB moves from one valid state to another | CHECK constraints, FK constraints prevent invalid states |
| Isolation | concurrent transactions don't interfere | InnoDB default: REPEATABLE READ |
| Durability | committed data survives crashes | InnoDB writes to disk (redo log) |

**Transaction in your API (signup):**
```javascript
await conn.beginTransaction();
// INSERT INTO users ...
// INSERT INTO profiles ...
await conn.commit();
// on error:
await conn.rollback();
```

**Demo query (Q11 from your PPT):**
```sql
START TRANSACTION;
SELECT COUNT(*) FROM profiles WHERE id = 47;   -- 1
SELECT COUNT(*) FROM food_logs WHERE user_id = 47;  -- 545
DELETE FROM users WHERE id = 47;
SELECT COUNT(*) FROM profiles WHERE id = 47;   -- 0 (cascaded)
SELECT COUNT(*) FROM food_logs WHERE user_id = 47;  -- 0 (cascaded)
ROLLBACK;
SELECT COUNT(*) FROM profiles WHERE id = 47;   -- 1 (restored)
```

---

## 1.8 Indexes

**What is an index?** A data structure (B-tree in InnoDB) that speeds up lookups at the cost of extra storage and slower writes.

**Indexes that exist automatically in your schema:**
- Clustered index on every PK (`id` column).
- Secondary index on every UNIQUE key (`users.email`, composite keys on `body_metrics` and `nutrition_targets`).
- InnoDB automatically indexes every FK column.

**Indexes you should mention adding in future scope:**
```sql
-- speeds up daily calorie queries (most common query pattern)
CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, log_date);

-- speeds up workout history queries
CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);
```

**Viva Q:** "Does MySQL automatically create an index on foreign key columns?"
**A:** Yes, InnoDB automatically creates an index on FK columns if one doesn't already exist. This is needed to efficiently check referential integrity on DELETE/UPDATE.

---

# PHASE 2 — SQL MASTERY

---

## Level 1 — SELECT, WHERE, ORDER BY, LIMIT, DISTINCT

### Concept
SELECT retrieves data. WHERE filters rows. ORDER BY sorts. LIMIT caps results. DISTINCT removes duplicates.

### Examples from your DB

```sql
-- get all users
SELECT * FROM users;

-- specific columns
SELECT id, email, created_at FROM users;

-- filter: only chest exercises
SELECT name, equipment FROM exercises WHERE muscle_group = 'chest';

-- multiple conditions
SELECT name FROM exercises WHERE muscle_group = 'legs' AND equipment = 'barbell';

-- OR condition
SELECT name FROM exercises WHERE muscle_group = 'chest' OR muscle_group = 'back';

-- LIKE: exercises with 'curl' in the name
SELECT name, muscle_group FROM exercises WHERE name LIKE '%curl%';

-- ORDER BY: heaviest sets ever
SELECT exercise_id, weight_kg, reps FROM workout_sets ORDER BY weight_kg DESC LIMIT 10;

-- DISTINCT: what muscle groups exist?
SELECT DISTINCT muscle_group FROM exercises;

-- DISTINCT: which users have logged food?
SELECT DISTINCT user_id FROM food_logs;

-- NULL check: users with no full_name set
SELECT id FROM profiles WHERE full_name IS NULL;

-- BETWEEN: body metrics in October
SELECT user_id, log_date, weight_kg FROM body_metrics
WHERE log_date BETWEEN '2026-10-01' AND '2026-10-15';
```

### Practice Questions
1. List all exercises that use a barbell.
2. Find all users whose goal is 'cut'.
3. Show the 5 most recent workout sessions.
4. List all distinct meal types used in food_logs.
5. Find all foods with more than 25g protein per 100g, sorted by protein descending.

### Viva Questions
- What is the difference between WHERE and HAVING?
- What does DISTINCT do? When would you use it?
- Can you use ORDER BY on a column not in SELECT?

---

## Level 2 — INSERT, UPDATE, DELETE

### Concept
DML (Data Manipulation Language) — modifies data.

### Examples from your DB

```sql
-- INSERT a new body metric
INSERT INTO body_metrics (user_id, log_date, weight_kg)
VALUES (2, '2026-10-16', 86.2);

-- INSERT with all columns
INSERT INTO food_logs (user_id, food_id, log_date, quantity_g, meal_type)
VALUES (2, 1, '2026-10-16', 150.0, 'lunch');

-- UPDATE: change a user's goal
UPDATE profiles SET goal = 'maintain', goal_rate_kg_week = 0 WHERE id = 2;

-- UPDATE multiple columns
UPDATE profiles
SET height_cm = 181.0, goal = 'bulk', goal_rate_kg_week = 0.25
WHERE id = 4;

-- DELETE: remove a specific food log entry
DELETE FROM food_logs WHERE id = 26;

-- DELETE with condition
DELETE FROM body_metrics WHERE user_id = 2 AND log_date = '2026-10-16';

-- UPSERT (INSERT ... ON DUPLICATE KEY UPDATE) — used in your API
INSERT INTO body_metrics (user_id, log_date, weight_kg)
VALUES (2, '2026-10-08', 86.5)
AS new ON DUPLICATE KEY UPDATE weight_kg = new.weight_kg;
```

### Practice Questions
1. Insert a new nutrition target for user 2 effective 2026-10-16 with 2400 calories.
2. Update all profiles with goal='bulk' to set goal_rate_kg_week = 0.30.
3. Delete all food_logs for user 2 on 2026-10-07.
4. What happens if you try to delete exercise id=1 (Barbell Bench Press)? Why?

### Viva Questions
- What is the difference between DELETE and TRUNCATE?
- What is UPSERT? How does MySQL implement it?
- Can you UPDATE without a WHERE clause? What happens?

---

## Level 3 — Aggregate Functions, GROUP BY, HAVING

### Concept
Aggregate functions compute a value across multiple rows. GROUP BY groups rows. HAVING filters groups (like WHERE but after grouping).

### Functions: COUNT, SUM, AVG, MAX, MIN

```sql
-- total number of workout sets ever logged
SELECT COUNT(*) FROM workout_sets;

-- total sets per exercise
SELECT exercise_id, COUNT(*) AS total_sets
FROM workout_sets
GROUP BY exercise_id
ORDER BY total_sets DESC;

-- max weight ever lifted per exercise
SELECT exercise_id, MAX(weight_kg) AS max_weight
FROM workout_sets
GROUP BY exercise_id;

-- average weight per exercise
SELECT e.name, ROUND(AVG(ws.weight_kg), 1) AS avg_weight
FROM workout_sets ws
JOIN exercises e ON e.id = ws.exercise_id
GROUP BY e.id, e.name
ORDER BY avg_weight DESC;

-- total calories per food (per 100g)
SELECT name, calories_per_100g FROM foods ORDER BY calories_per_100g DESC LIMIT 5;

-- count of sessions per user
SELECT user_id, COUNT(*) AS sessions
FROM workout_sessions
GROUP BY user_id
ORDER BY sessions DESC;

-- HAVING: users with more than 20 sessions
SELECT user_id, COUNT(*) AS sessions
FROM workout_sessions
GROUP BY user_id
HAVING sessions > 20
ORDER BY sessions DESC;

-- total volume (weight x reps) per session
SELECT session_id,
       SUM(weight_kg * reps) AS total_volume_kg
FROM workout_sets
GROUP BY session_id
ORDER BY total_volume_kg DESC
LIMIT 5;

-- daily calorie intake for user 2
SELECT fl.log_date,
       ROUND(SUM(f.calories_per_100g * fl.quantity_g / 100), 1) AS calories
FROM food_logs fl
JOIN foods f ON f.id = fl.food_id
WHERE fl.user_id = 2
GROUP BY fl.log_date
ORDER BY fl.log_date;

-- days where user 2 ate more than 2000 calories
SELECT fl.log_date,
       ROUND(SUM(f.calories_per_100g * fl.quantity_g / 100), 1) AS calories
FROM food_logs fl
JOIN foods f ON f.id = fl.food_id
WHERE fl.user_id = 2
GROUP BY fl.log_date
HAVING calories > 2000;
```

### Practice Questions
1. How many exercises exist per muscle group?
2. What is the average weight logged for Barbell Bench Press (exercise_id = 1)?
3. Which users have logged food on more than 5 distinct days?
4. What is the total protein eaten by user 2 across all logged days?
5. Find the session with the highest total volume (weight × reps).

### Viva Questions
- What is the difference between WHERE and HAVING?
- Can you use an aggregate function in a WHERE clause?
- What does GROUP BY do to NULL values?

---

## Level 4 — JOINs

### Concept

| Join type | Returns |
|---|---|
| INNER JOIN | only rows with a match in both tables |
| LEFT JOIN | all rows from left table + matching rows from right (NULL if no match) |
| RIGHT JOIN | all rows from right table + matching rows from left |
| SELF JOIN | a table joined to itself |

### INNER JOIN examples

```sql
-- user email + their profile goal
SELECT u.email, p.full_name, p.goal, p.height_cm
FROM users u
JOIN profiles p ON u.id = p.id;

-- exercise name for each workout set
SELECT ws.weight_kg, ws.reps, ws.rpe, e.name, e.muscle_group
FROM workout_sets ws
JOIN exercises e ON ws.exercise_id = e.id
LIMIT 10;

-- full chain: user → session → sets → exercise
SELECT u.email, s.session_date, e.name, ws.weight_kg, ws.reps
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN users u ON s.user_id = u.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE u.id = 2
ORDER BY s.session_date DESC
LIMIT 20;

-- food log with food names and calculated calories
SELECT fl.log_date, fl.meal_type, f.name,
       fl.quantity_g,
       ROUND(f.calories_per_100g * fl.quantity_g / 100, 1) AS calories
FROM food_logs fl
JOIN foods f ON fl.food_id = f.id
WHERE fl.user_id = 2
ORDER BY fl.log_date, fl.meal_type;

-- routine with its exercises in order
SELECT r.name AS routine, e.name AS exercise, re.order_index, re.target_sets, re.target_rep_range
FROM routines r
JOIN routine_exercises re ON re.routine_id = r.id
JOIN exercises e ON e.id = re.exercise_id
WHERE r.user_id = 2
ORDER BY r.id, re.order_index;
```

### LEFT JOIN examples

```sql
-- all users, even those with no workout sessions
SELECT u.email, COUNT(ws.id) AS session_count
FROM users u
LEFT JOIN workout_sessions ws ON ws.user_id = u.id
GROUP BY u.id, u.email
ORDER BY session_count DESC;

-- all exercises, even those never used in any set
SELECT e.name, e.muscle_group, COUNT(ws.id) AS times_used
FROM exercises e
LEFT JOIN workout_sets ws ON ws.exercise_id = e.id
GROUP BY e.id, e.name, e.muscle_group
ORDER BY times_used DESC;

-- users with no body metrics logged (never weighed in)
SELECT u.email
FROM users u
LEFT JOIN body_metrics bm ON bm.user_id = u.id
WHERE bm.id IS NULL;
```

### SELF JOIN example

```sql
-- find users who registered on the same day as another user
SELECT a.email AS user1, b.email AS user2, DATE(a.created_at) AS reg_date
FROM users a
JOIN users b ON DATE(a.created_at) = DATE(b.created_at) AND a.id < b.id;
```

### Practice Questions
1. List all workout sessions for user 3 with the routine name.
2. Show all food logs for 2026-10-08 with food names and calories.
3. Find all users who have never logged a food entry (LEFT JOIN + WHERE NULL).
4. Show each routine and how many exercises it contains.
5. List all sets logged by user 2 with exercise name and muscle group.

### Viva Questions
- What is the difference between INNER JOIN and LEFT JOIN?
- What does a NULL in a LEFT JOIN result mean?
- Can you JOIN more than two tables? How?
- What is a self join? Give an example from this database.

---

## Level 5 — Subqueries, Views, Stored Procedures, Triggers

### Subqueries

```sql
-- users who have logged at least one workout
SELECT email FROM users
WHERE id IN (SELECT DISTINCT user_id FROM workout_sessions);

-- exercises never used in any workout set
SELECT name FROM exercises
WHERE id NOT IN (SELECT DISTINCT exercise_id FROM workout_sets);

-- users who never trained (NOT EXISTS — anti-join)
SELECT u.id, u.email FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM workout_sessions ws WHERE ws.user_id = u.id
);

-- sets where weight > average weight for that exercise (correlated subquery)
SELECT ws.id, ws.weight_kg, ws.exercise_id
FROM workout_sets ws
WHERE ws.weight_kg > (
  SELECT AVG(ws2.weight_kg)
  FROM workout_sets ws2
  WHERE ws2.exercise_id = ws.exercise_id
);

-- each user's latest weigh-in (correlated subquery)
SELECT p.full_name, b.log_date, b.weight_kg
FROM body_metrics b
JOIN profiles p ON p.id = b.user_id
WHERE b.log_date = (
  SELECT MAX(b2.log_date)
  FROM body_metrics b2
  WHERE b2.user_id = b.user_id
)
ORDER BY p.full_name;

-- members eating above the average daily calories of all members
SELECT p.full_name, ROUND(AVG(d.kcal)) AS avg_kcal
FROM (
  SELECT fl.user_id, fl.log_date,
         SUM(fl.quantity_g * f.calories_per_100g / 100) AS kcal
  FROM food_logs fl
  JOIN foods f ON f.id = fl.food_id
  GROUP BY fl.user_id, fl.log_date
) d
JOIN profiles p ON p.id = d.user_id
GROUP BY p.id, p.full_name
HAVING AVG(d.kcal) > (
  SELECT AVG(x.kcal)
  FROM (
    SELECT SUM(fl.quantity_g * f.calories_per_100g / 100) AS kcal
    FROM food_logs fl
    JOIN foods f ON f.id = fl.food_id
    GROUP BY fl.user_id, fl.log_date
  ) x
)
ORDER BY avg_kcal DESC LIMIT 5;
```

### Views

A view is a saved SELECT query. It looks like a table but contains no data itself.

```sql
-- create a summary view (already in your schema)
CREATE OR REPLACE VIEW v_user_summary AS
SELECT
  p.id,
  p.full_name,
  p.goal,
  COUNT(DISTINCT ws.id)  AS workouts,
  COUNT(DISTINCT s.id)   AS sets_logged,
  MIN(bm.weight_kg)      AS min_weight,
  MAX(bm.weight_kg)      AS max_weight,
  (SELECT bm2.weight_kg FROM body_metrics bm2
   WHERE bm2.user_id = p.id ORDER BY bm2.log_date ASC LIMIT 1)  AS first_weight_kg,
  (SELECT bm3.weight_kg FROM body_metrics bm3
   WHERE bm3.user_id = p.id ORDER BY bm3.log_date DESC LIMIT 1) AS latest_weight_kg
FROM profiles p
LEFT JOIN workout_sessions ws ON ws.user_id = p.id
LEFT JOIN workout_sets s ON s.session_id = ws.id
LEFT JOIN body_metrics bm ON bm.user_id = p.id
GROUP BY p.id, p.full_name, p.goal;

-- use the view
SELECT * FROM v_user_summary WHERE goal = 'cut' ORDER BY latest_weight_kg ASC;
```

**Why use a view?**
- Hides complex JOIN logic.
- Reusable — query it like a table.
- Security — expose only certain columns to certain users.

### Stored Procedures (future scope in your project — know the concept)

```sql
-- example: procedure to log a weigh-in
DELIMITER //
CREATE PROCEDURE log_weight(IN p_user_id INT, IN p_date DATE, IN p_weight DECIMAL(5,2))
BEGIN
  INSERT INTO body_metrics (user_id, log_date, weight_kg)
  VALUES (p_user_id, p_date, p_weight)
  AS new ON DUPLICATE KEY UPDATE weight_kg = new.weight_kg;
END //
DELIMITER ;

-- call it
CALL log_weight(2, '2026-10-16', 86.1);
```

### Triggers (future scope — know the concept)

```sql
-- example: auto-create profile when a user is inserted
DELIMITER //
CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
  INSERT INTO profiles (id, approved, role) VALUES (NEW.id, 0, 'user');
END //
DELIMITER ;
```

**Viva Q:** "Does your project use triggers?"
**A:** No. Profile creation is handled in a transaction in the application layer (api/server.js). Triggers are listed as future scope — they would move that logic into the database itself, which is more robust.

### Practice Questions
1. Write a subquery to find the user with the most workout sessions.
2. Create a view that shows each user's total sessions and total sets.
3. Write a correlated subquery to find each exercise's heaviest set ever.
4. Find all foods that have never been logged by any user.
5. Write a NOT EXISTS query to find users who have a profile but no body metrics.

### Viva Questions
- What is the difference between a subquery and a JOIN?
- What is a correlated subquery? How is it different from a regular subquery?
- What is a view? Can you INSERT into a view?
- What is a trigger? When would you use one?
- What is the difference between a stored procedure and a function?

---

# PHASE 3 — PROJECT-SPECIFIC TABLE ANALYSIS

---

## Table 1: users

**Purpose:** stores login credentials. The identity anchor for the entire database.

**Columns:**
- `id` INT AUTO_INCREMENT PK — surrogate key, used as FK in every other table
- `email` VARCHAR(255) UNIQUE NOT NULL — natural key, login identifier
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `password_hash` VARCHAR(100) NULL — added via ALTER TABLE; bcrypt hash of the password

**Relationships:**
- 1:1 with `profiles` (profiles.id = users.id)
- 1:N with routines, workout_sessions, food_logs, body_metrics, nutrition_targets
- 1:N with exercises and foods (as `created_by` for custom items)

**Design decisions:**
- Email stored lowercase (enforced in API). UNIQUE constraint prevents duplicate accounts.
- `password_hash` was added after initial schema creation (ALTER TABLE) — shows schema evolution.
- No name/goal stored here — those are in `profiles`. Separation of concerns: auth vs personal data.

**Viva Q:** "Why is the password not stored in plain text?"
**A:** Plain text passwords are a critical security vulnerability. We store bcrypt hashes. bcrypt is a one-way hash with a salt, so even if the database is leaked, passwords cannot be recovered.

---

## Table 2: profiles

**Purpose:** personal details, fitness goal, and access control for each user.

**Columns:**
- `id` INT PK, FK → users(id) ON DELETE CASCADE — same value as users.id
- `full_name` VARCHAR(100) NULL
- `goal` VARCHAR(10) CHECK IN ('bulk','cut','maintain') NULL
- `goal_rate_kg_week` DECIMAL(4,2) NULL — e.g. -0.50 for cutting 500g/week
- `height_cm` DECIMAL(5,1) NULL
- `onboarded` BOOLEAN DEFAULT 0 — has the user completed the setup wizard?
- `approved` BOOLEAN DEFAULT 0 — admin must approve before full access
- `role` VARCHAR(10) DEFAULT 'user' CHECK IN ('user','admin')
- `timezone` VARCHAR(50) DEFAULT 'UTC'

**Design decisions:**
- Shared PK with users (profiles.id = users.id). No AUTO_INCREMENT — the id comes from users.
- `approved = 0` by default. In local dev, AUTO_APPROVE=true in .env skips this.
- Negative `goal_rate_kg_week` = cutting (losing weight). Positive = bulking.
- NULL goal means the user hasn't completed onboarding yet (user3 in sample data).

**Viva Q:** "Why separate users and profiles instead of one table?"
**A:** Separation of concerns. `users` handles authentication (email, password). `profiles` handles application data (name, goal, height). This mirrors the Supabase pattern where auth.users is separate from public.profiles. It also means you can change auth logic without touching profile data.

---

## Table 3: exercises

**Purpose:** the exercise library — both built-in and user-created custom exercises.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `name` VARCHAR(100) NOT NULL
- `muscle_group` VARCHAR(50) NOT NULL — chest, back, legs, shoulders, arms, core
- `equipment` VARCHAR(50) NULL — barbell, dumbbell, machine, bodyweight
- `is_custom` BOOLEAN DEFAULT 0 — 0 = built-in library, 1 = user created
- `created_by` INT NULL FK → users(id) ON DELETE CASCADE — NULL for built-in
- `deleted_at` DATETIME NULL — soft delete (row stays, UI hides it)

**43 exercises in sample data.** All built-in (is_custom=0, created_by=NULL).

**Design decisions:**
- Soft delete via `deleted_at` instead of hard DELETE. Reason: if a user logged sets for a custom exercise and then deletes it, the history must remain valid. Hard delete would violate the FK on `workout_sets.exercise_id` (RESTRICT).
- `created_by` is NULL for library exercises. Only custom exercises have a creator.

**Viva Q:** "Why use soft delete instead of hard delete for exercises?"
**A:** `workout_sets.exercise_id` has a RESTRICT FK. If you hard-deleted an exercise that has sets logged against it, MySQL would reject the delete. Soft delete (setting `deleted_at`) hides the exercise from the UI while keeping the FK valid and history intact.

---

## Table 4: foods

**Purpose:** nutrition library — both built-in and user-created foods.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `name` VARCHAR(150) NOT NULL
- `brand` VARCHAR(100) NULL
- `calories_per_100g` DECIMAL(6,2) NULL
- `protein_per_100g` DECIMAL(6,2) NULL
- `carbs_per_100g` DECIMAL(6,2) NULL
- `fat_per_100g` DECIMAL(6,2) NULL
- `serving_label` VARCHAR(60) NULL — e.g. "1 breast (150 g)"
- `serving_g` DECIMAL(6,1) NULL — default serving size in grams
- `is_custom` BOOLEAN DEFAULT 0
- `created_by` INT NULL FK → users(id) ON DELETE CASCADE
- `deleted_at` DATETIME NULL — soft delete

**43 foods in sample data.** Nutrition stored per 100g — actual calories calculated at query time by multiplying by quantity_g/100.

**Design decisions:**
- Storing per 100g is the standard nutritional convention. It means one food row works for any portion size.
- Calories are NEVER stored in food_logs. They are always computed: `calories_per_100g * quantity_g / 100`. This is the key 3NF decision — no transitive dependency.

**Viva Q:** "Why store nutrition per 100g instead of per serving?"
**A:** Per 100g is universal. A user might eat 73g of chicken, not exactly one serving. Storing per 100g means the calculation `calories_per_100g * quantity_g / 100` works for any quantity. Serving info is stored separately as a convenience label.

---

## Table 5: routines

**Purpose:** a named workout plan belonging to a user.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `user_id` INT NOT NULL FK → users(id) ON DELETE CASCADE
- `name` VARCHAR(100) NOT NULL
- `notes` TEXT NULL
- `created_at`, `updated_at` DATETIME
- `style` VARCHAR(10) NULL CHECK IN ('push','pull','legs','upper','lower','full-body','arms','core')
- `deleted_at` DATETIME NULL — soft delete

**130 routines in seed data** (3 per user for most users: Push/Pull/Legs).

**Design decisions:**
- Soft delete so workout_sessions that reference this routine via FK are not broken.
- `workout_sessions.routine_id` is SET NULL on delete — so even if a routine is hard-deleted, sessions survive.

---

## Table 6: routine_exercises

**Purpose:** junction table resolving the M:N between routines and exercises. Stores the plan for each exercise within a routine.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `routine_id` INT NOT NULL FK → routines(id) ON DELETE CASCADE
- `exercise_id` INT NOT NULL FK → exercises(id) — RESTRICT (no cascade)
- `order_index` INT NOT NULL — display order within the routine
- `target_sets` INT NULL
- `target_rep_range` VARCHAR(20) NULL — e.g. "8-12"
- `target_rpe` DECIMAL(3,1) NULL — Rate of Perceived Exertion target
- `rest_seconds` INT DEFAULT 90
- `notes` TEXT NULL

**641 rows in seed data.**

**Design decisions:**
- ON DELETE CASCADE from routines: delete a routine → delete all its exercise entries.
- RESTRICT from exercises: cannot delete an exercise that is part of a routine.
- `order_index` stored explicitly so the UI can reorder exercises without relying on insertion order.

---

## Table 7: workout_sessions

**Purpose:** one gym visit / workout session per row.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `user_id` INT NOT NULL FK → users(id) ON DELETE CASCADE
- `routine_id` INT NULL FK → routines(id) ON DELETE SET NULL
- `session_date` DATE NOT NULL
- `notes` TEXT NULL
- `started_at` DATETIME NULL
- `ended_at` DATETIME NULL
- `routine_snapshot` JSON NULL — frozen copy of routine at time of session

**800+ rows in seed data.**

**Design decisions:**
- `routine_id` is nullable: freestyle workouts have no routine.
- ON DELETE SET NULL: delete a routine → sessions keep their history, routine_id becomes NULL.
- `routine_snapshot` is the intentional denormalization. If a user edits their routine after a session, the snapshot preserves what they actually did. Left NULL in sample data.
- Duration = `TIMESTAMPDIFF(MINUTE, started_at, ended_at)`.

---

## Table 8: workout_sets

**Purpose:** junction table resolving M:N between sessions and exercises. Each row = one set performed.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `session_id` INT NOT NULL FK → workout_sessions(id) ON DELETE CASCADE
- `exercise_id` INT NOT NULL FK → exercises(id) — RESTRICT
- `set_number` INT NOT NULL
- `weight_kg` DECIMAL(6,2) NULL
- `reps` INT NULL
- `rpe` DECIMAL(3,1) NULL — actual RPE (1-10 scale)
- `set_type` VARCHAR(10) DEFAULT 'normal' CHECK IN ('normal','warmup','drop','amrap','failure')
- `notes` TEXT NULL
- `is_pr` BOOLEAN DEFAULT 0 — personal record flag

**17,000+ rows in seed data.**

**Design decisions:**
- ON DELETE CASCADE from sessions: delete a session → delete all its sets.
- RESTRICT from exercises: cannot delete an exercise with logged sets.
- `is_pr` is a derived flag (could be computed from previous sets). Stored for fast UI rendering — intentional denormalization.
- DECIMAL for weight_kg, not FLOAT — exact arithmetic, no rounding errors in volume calculations.

---

## Table 9: food_logs

**Purpose:** junction table — each row = one food item eaten by a user on a specific day.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `user_id` INT NOT NULL FK → users(id) ON DELETE CASCADE
- `food_id` INT NOT NULL FK → foods(id) — RESTRICT
- `log_date` DATE NOT NULL
- `quantity_g` DECIMAL(7,2) NOT NULL
- `meal_type` VARCHAR(10) NOT NULL CHECK IN ('breakfast','lunch','dinner','snack','other')

**25,000+ rows in seed data.**

**Design decisions:**
- No calories stored here — computed at query time. This is the core 3NF decision.
- RESTRICT on food_id: cannot delete a food that has been logged.
- No UNIQUE constraint on (user_id, food_id, log_date) — a user can eat the same food twice in one day (two separate log entries).

---

## Table 10: nutrition_targets

**Purpose:** a user's daily calorie and macro targets, effective from a given date.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `user_id` INT NOT NULL FK → users(id) ON DELETE CASCADE
- `effective_date` DATE NOT NULL
- `calories` INT NOT NULL
- `protein_g` INT NOT NULL
- `carbs_g` INT NOT NULL
- `fat_g` INT NOT NULL
- `source` VARCHAR(30) DEFAULT 'manual'
- UNIQUE(user_id, effective_date)

**66 rows in seed data.**

**Design decisions:**
- UNIQUE(user_id, effective_date): one target per user per date. Upsert replaces it.
- "Effective from" design: to find the target for a given day, find the latest effective_date <= that day. This allows targets to change over time without losing history.
- `source` = 'manual' means the user set it themselves (vs a future auto-calculated value).

---

## Table 11: body_metrics

**Purpose:** daily weigh-ins and body measurements.

**Columns:**
- `id` INT AUTO_INCREMENT PK
- `user_id` INT NOT NULL FK → users(id) ON DELETE CASCADE
- `log_date` DATE NOT NULL
- `weight_kg` DECIMAL(5,2) NULL
- `waist_cm` DECIMAL(5,1) NULL
- `chest_cm` DECIMAL(5,1) NULL
- `arm_cm` DECIMAL(5,1) NULL
- `photo_url` TEXT NULL
- UNIQUE(user_id, log_date)

**1,994 rows in seed data.**

**Design decisions:**
- UNIQUE(user_id, log_date): one weigh-in per user per day. Upsert replaces it.
- All measurement columns are NULL — most users only log weight, not all measurements.
- DECIMAL(5,2) for weight: stores values like 86.50 exactly.

---

# PHASE 4 — REVIEW PREPARATION

---

## 4.1 What Faculty Will Most Likely Ask

These are the highest-probability questions based on your schema and the guideline marks breakdown.

### Almost certain (ask these to yourself first)

1. "Explain your ER diagram." — Walk through all 11 entities and the 3 M:N relationships.
2. "What are the foreign keys in your schema and what delete rules did you use?" — Know CASCADE vs SET NULL vs RESTRICT and WHY each was chosen.
3. "Prove your schema is in 3NF / BCNF." — Have the FD table ready. Mention the two intentional exceptions.
4. "Show me a JOIN query on your database." — Run Q1 from your PPT live.
5. "What is the difference between WHERE and HAVING?" — Classic aggregate question.
6. "What happens when you delete a user?" — CASCADE demo (Q11).
7. "What constraints does your schema have?" — List PK, FK, UNIQUE, CHECK, NOT NULL, DEFAULT.
8. "Explain normalization with an example from your project." — Use the flat log → 3NF journey.

### Very likely

9. "What is a transaction? Show one." — Signup transaction + Q11 rollback demo.
10. "What is a view? Do you have one?" — v_user_summary.
11. "What indexes does your database have?" — PK, UNIQUE, FK auto-indexes.
12. "Why did you use MySQL and not MongoDB?" — Relational data, FK enforcement, ACID.
13. "What is the difference between INNER JOIN and LEFT JOIN?" — With an example.
14. "What is a subquery? Show a correlated subquery." — Q4 (latest weigh-in).
15. "What is BCNF? How is it different from 3NF?" — Every determinant must be a superkey.

### Likely if they go deep

16. "What is a surrogate key vs natural key?" — id vs email.
17. "Why is profiles.id not AUTO_INCREMENT?" — Shared PK with users.
18. "What is soft delete? Why did you use it?" — deleted_at on exercises/foods/routines.
19. "What is connection pooling?" — mysql2.createPool reuses connections.
20. "How do you prevent SQL injection?" — Parameterized queries with ? placeholders.

---

## 4.2 Weak Areas in Your Project — Be Honest

These are real weaknesses. Know them and have answers ready.

### Weakness 1: No stored procedures or triggers
**What they'll ask:** "Do you have any stored procedures or triggers?"
**Your answer:** "No. Profile creation is handled in a transaction in the application layer. Triggers and stored procedures are listed as future scope — they would move that logic into the database for better encapsulation."
**Do NOT claim you have them.**

### Weakness 2: routine_snapshot is NULL in all sample data
**What they'll ask:** "What is routine_snapshot? Show me a value."
**Your answer:** "It's a JSON column that stores a frozen copy of the routine as it was when the session happened. In the sample data it's NULL because the seed script didn't populate it. In the real app, the frontend sends the routine data when finishing a session and it gets stored here."

### Weakness 3: is_pr is a derived value stored redundantly
**What they'll ask:** "Isn't is_pr a violation of normalization?"
**Your answer:** "Yes, it's a deliberate denormalization. It could be computed by comparing against all previous sets for that exercise by that user. We store it as a flag for fast UI rendering — showing a PR badge without running a complex query on every page load. It's documented as an intentional exception."

### Weakness 4: waist_cm, chest_cm, arm_cm are all NULL in sample data
**What they'll ask:** "Why are these columns always NULL?"
**Your answer:** "The sample data only populates weight_kg. The columns exist in the schema for future use — the app UI has fields for them but the seed script only generated weight data."

### Weakness 5: No secondary indexes beyond PK/UNIQUE/FK
**What they'll ask:** "What indexes would you add for performance?"
**Your answer:** "The most impactful would be a composite index on food_logs(user_id, log_date) since the daily calorie query filters and groups by both. Also workout_sets(session_id) for the volume queries, though InnoDB may already index that via the FK."

### Weakness 6: The data is synthetic
**What they'll ask:** "Is this real user data?"
**Your answer:** "No, it's generated sample data — 47 users over 60 days created by tools/make_seed.js. The schema, constraints, and queries are real. The numbers demonstrate the method; with real users the same queries give real insights."

---

## 4.3 Questions a Strict Reviewer May Ask

These are the hard questions. Prepare exact answers.

**"Your profiles table has id as PK but it's not AUTO_INCREMENT. How does a new profile get its id?"**
The application inserts into `users` first (which IS AUTO_INCREMENT), gets the new `insertId`, then inserts into `profiles` with that same id. Both happen in a single transaction. If the profile insert fails, the user insert is rolled back.

**"What happens if two users try to register with the same email simultaneously?"**
The UNIQUE constraint on `users.email` means only one INSERT will succeed. The second will get MySQL error 1062 (duplicate key). The application catches this and returns "User already registered."

**"You said BCNF. Prove it for food_logs."**
food_logs has columns: id, user_id, food_id, log_date, quantity_g, meal_type. The only candidate key is `id`. Every non-key attribute (user_id, food_id, log_date, quantity_g, meal_type) depends on `id` and nothing else. There is no FD where a non-key determines another attribute. Therefore BCNF holds.

**"Why DECIMAL and not FLOAT for weight_kg?"**
FLOAT uses binary floating-point which cannot represent all decimal fractions exactly. `86.5 + 0.1` in FLOAT might give `86.59999...`. DECIMAL stores exact decimal values. For weight and nutrition calculations that are summed and compared, exact arithmetic matters.

**"What is the difference between ON DELETE CASCADE and ON DELETE SET NULL? Give a real example from your schema."**
CASCADE: delete a user → their food_logs are deleted too (the logs are owned by the user, meaningless without them). SET NULL: delete a routine → workout_sessions.routine_id becomes NULL (the session history is valuable even without the routine reference).

**"Can a workout_set exist without a workout_session?"**
No. `workout_sets.session_id` is NOT NULL with a FK to workout_sessions. A set must belong to a session.

**"Can a workout_session exist without a routine?"**
Yes. `workout_sessions.routine_id` is nullable. A user can do a freestyle workout.

**"What is the purpose of the `effective_date` in nutrition_targets?"**
It allows targets to change over time. To find the target for a given day, you query: `SELECT * FROM nutrition_targets WHERE user_id = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1`. This gives the most recent target that was active on that day.

**"Your schema has CHECK constraints. Does MySQL actually enforce them?"**
Yes, from MySQL 8.0.16 onwards, CHECK constraints are enforced. Before that version they were parsed but ignored. Since we're on MySQL 8, they are enforced.

---

## 4.4 Scalability Questions

**"How would this database scale to 1 million users?"**

1. **Indexes first:** Add composite indexes on `food_logs(user_id, log_date)`, `workout_sets(session_id, exercise_id)`, `body_metrics(user_id, log_date)`.
2. **Partitioning:** Partition `food_logs` and `workout_sets` by month (RANGE partitioning on log_date/session_date). Old partitions can be archived.
3. **Read replicas:** Route SELECT queries to read replicas, writes to primary.
4. **Connection pooling:** Already implemented with mysql2.createPool.
5. **Caching:** Cache daily calorie totals in Redis (invalidate on new food_log insert).
6. **Archive old data:** Move sessions older than 2 years to an archive table.

**"What is the biggest performance bottleneck in your current schema?"**
The daily calorie query: it joins food_logs (25k+ rows) with foods, groups by user_id and log_date. Without an index on `food_logs(user_id, log_date)`, this is a full table scan. Adding that composite index would be the first optimization.

---

## 4.5 Database Choice Questions

**"Why MySQL and not PostgreSQL?"**
The live app uses PostgreSQL (Supabase). For the course we migrated to MySQL because MySQL Workbench is the standard tool for the DBMS course — it provides the EER diagram, visual schema editor, and query runner that the course requires. The schema differences are minor (BOOLEAN vs TINYINT, DATETIME vs TIMESTAMPTZ, JSON support exists in both).

**"Why a relational database and not a NoSQL database like MongoDB?"**
FitStack data is highly relational. A workout set belongs to a session, which belongs to a user, which has a profile, a routine, food logs, and body metrics — all linked. An RDBMS enforces these links with foreign keys and prevents orphan data. MongoDB would require the application to manually maintain referential integrity, which is error-prone. SQL also makes complex analytical queries (daily intake vs target, weight loss rankings) much simpler than MongoDB aggregation pipelines.

---

# PHASE 5 — MOCK VIVA: 100 Questions

---

## Easy (1–35)

1. How many tables does your database have?
2. What is the name of your database?
3. What is the primary key of the users table?
4. What does AUTO_INCREMENT do?
5. What is a foreign key?
6. What is the difference between CHAR and VARCHAR?
7. What does NULL mean in a database?
8. What is the purpose of the profiles table?
9. How many exercises are in your database?
10. What muscle groups are covered in your exercise library?
11. What is the meal_type CHECK constraint in food_logs?
12. What is the default value of rest_seconds in routine_exercises?
13. What does the approved column in profiles mean?
14. What are the possible values for goal in profiles?
15. What is the difference between DATE and DATETIME?
16. What does DISTINCT do in a SELECT query?
17. What does ORDER BY DESC mean?
18. What does LIMIT do?
19. What is the purpose of the body_metrics table?
20. What does ON DELETE CASCADE mean?
21. What is a UNIQUE constraint?
22. What does COUNT(*) return?
23. What is the difference between COUNT(*) and COUNT(column)?
24. What does GROUP BY do?
25. What is the purpose of the foods table?
26. How do you find all exercises for a specific muscle group?
27. What is the purpose of the workout_sessions table?
28. What columns does workout_sets have?
29. What is is_pr in workout_sets?
30. What is the purpose of nutrition_targets?
31. What does effective_date mean in nutrition_targets?
32. What is a junction table? Give an example from your schema.
33. What is the difference between a primary key and a unique key?
34. What does NOT NULL mean?
35. What is the purpose of created_at columns?

## Medium (36–70)

36. Explain the relationship between users and profiles.
37. Why is profiles.id not AUTO_INCREMENT?
38. What are the three M:N relationships in your schema?
39. What extra attributes does routine_exercises store beyond the FK columns?
40. What is the difference between ON DELETE CASCADE and ON DELETE SET NULL?
41. Which tables use ON DELETE SET NULL? Why?
42. Which tables use ON DELETE RESTRICT? Why?
43. What is soft delete? Which tables use it?
44. Why are calories not stored in food_logs?
45. How do you calculate calories from food_logs?
46. What is the UNIQUE constraint on body_metrics? Why?
47. What is the UNIQUE constraint on nutrition_targets? Why?
48. What is the difference between INNER JOIN and LEFT JOIN?
49. Write a query to get all exercises with their muscle group.
50. Write a query to count sessions per user.
51. What is HAVING? How is it different from WHERE?
52. Write a query to find users with more than 10 sessions.
53. What is a subquery? Write one using your database.
54. What is a correlated subquery?
55. What is a view? Do you have one?
56. What does v_user_summary show?
57. What is a transaction? Where does your project use one?
58. What are ACID properties?
59. What is atomicity? Give an example from your project.
60. What is a CHECK constraint? Give three examples from your schema.
61. What is 1NF? Is your schema in 1NF?
62. What is 2NF? Give an example of a partial dependency you removed.
63. What is 3NF? Give an example of a transitive dependency you removed.
64. What is BCNF?
65. What is a functional dependency? Give an example.
66. What is a surrogate key? What is a natural key?
67. What indexes exist in your database automatically?
68. What is connection pooling? Does your project use it?
69. How does your project prevent SQL injection?
70. How are passwords stored in your database?

## Hard (71–100)

71. Prove that food_logs is in BCNF.
72. What are the two intentional denormalizations in your schema? Justify each.
73. Write a query to find each user's latest weigh-in using a correlated subquery.
74. Write a query to calculate daily protein intake for user 2.
75. Write a query to rank 'cut' users by total weight lost using a window function.
76. Write a CTE to count weekly active users.
77. What is the difference between RANK() and ROW_NUMBER()?
78. Write a query using NOT EXISTS to find users who never trained.
79. What happens step by step when you delete a user from your database?
80. Demonstrate the CASCADE effect with a transaction and ROLLBACK.
81. Write the query to find the "effective" nutrition target for a given user on a given date.
82. What is the engagement funnel query? Explain each stage.
83. What window functions does your project use? Explain LAG and FIRST_VALUE.
84. What is the difference between a clustered and non-clustered index?
85. Why does InnoDB automatically index FK columns?
86. What composite indexes would you add for performance? Why?
87. What is the difference between TRUNCATE and DELETE?
88. What is a deadlock? How can it occur in your schema?
89. What is the difference between REPEATABLE READ and READ COMMITTED isolation levels?
90. What is a stored procedure? Write one for your database.
91. What is a trigger? Write one that auto-creates a profile on user insert.
92. What is the difference between a view and a materialized view?
93. Can you INSERT into a view? Under what conditions?
94. What is the difference between a subquery in SELECT, FROM, and WHERE?
95. What is the purpose of routine_snapshot? Why is it a denormalization?
96. How would you partition the food_logs table for scale?
97. What is the difference between MySQL and PostgreSQL? Why did you migrate?
98. What is bcrypt? Why is it better than MD5 for password hashing?
99. What is the difference between ON DELETE CASCADE and application-level deletion?
100. If two users register with the same email at the exact same time, what happens?

---

# PHASE 6 — SQL INTERVIEW MODE: 7-DAY PLAN

---

## DAY 1 — SQL Basics

**Topics:** SELECT, WHERE, ORDER BY, LIMIT, DISTINCT, NULL handling, LIKE, BETWEEN, IN

**Practice tasks:**
1. Open MySQL Workbench, load `schema.sql` then `seed_data.sql`.
2. Run `SELECT COUNT(*) FROM` on every table. Memorize the numbers.
3. Write every Level 1 query from Phase 2 by hand without looking.

**SQL queries to write today:**
```sql
-- 1. All users and when they registered
SELECT id, email, created_at FROM users ORDER BY created_at;

-- 2. All 'cut' users sorted by goal_rate_kg_week
SELECT full_name, goal_rate_kg_week FROM profiles WHERE goal = 'cut' ORDER BY goal_rate_kg_week;

-- 3. All chest exercises using a barbell
SELECT name FROM exercises WHERE muscle_group = 'chest' AND equipment = 'barbell';

-- 4. Foods with more than 20g protein per 100g
SELECT name, protein_per_100g FROM foods WHERE protein_per_100g > 20 ORDER BY protein_per_100g DESC;

-- 5. The 10 heaviest sets ever logged
SELECT exercise_id, weight_kg, reps FROM workout_sets ORDER BY weight_kg DESC LIMIT 10;

-- 6. All distinct equipment types in exercises
SELECT DISTINCT equipment FROM exercises WHERE equipment IS NOT NULL;

-- 7. Users who have not completed onboarding
SELECT id FROM profiles WHERE onboarded = 0;

-- 8. Body metrics logged in September 2026
SELECT user_id, log_date, weight_kg FROM body_metrics
WHERE log_date BETWEEN '2026-09-01' AND '2026-09-30' ORDER BY log_date;
```

**Viva questions to answer out loud:**
- What is the difference between `=` and `LIKE`?
- What does `IS NULL` check? Why can't you use `= NULL`?
- What is the execution order of a SELECT statement? (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT)

---

## DAY 2 — JOINs

**Topics:** INNER JOIN, LEFT JOIN, RIGHT JOIN, SELF JOIN, multi-table JOINs

**Practice tasks:**
1. Draw the join path on paper: users → profiles, users → workout_sessions → workout_sets → exercises.
2. Write every Level 4 query from Phase 2 by hand.
3. Explain each JOIN to yourself out loud before running it.

**SQL queries to write today:**
```sql
-- 1. Every user with their goal (INNER JOIN)
SELECT u.email, p.full_name, p.goal
FROM users u JOIN profiles p ON u.id = p.id;

-- 2. Every workout session with routine name (LEFT JOIN — some sessions have no routine)
SELECT ws.session_date, ws.notes, r.name AS routine
FROM workout_sessions ws
LEFT JOIN routines r ON r.id = ws.routine_id
WHERE ws.user_id = 2 ORDER BY ws.session_date DESC;

-- 3. All exercises with how many times they've been used in sets
SELECT e.name, e.muscle_group, COUNT(ws.id) AS times_used
FROM exercises e
LEFT JOIN workout_sets ws ON ws.exercise_id = e.id
GROUP BY e.id, e.name, e.muscle_group
ORDER BY times_used DESC;

-- 4. Full chain: user → session → set → exercise for user 2
SELECT u.email, s.session_date, e.name, ws.weight_kg, ws.reps, ws.rpe
FROM workout_sets ws
JOIN workout_sessions s ON ws.session_id = s.id
JOIN users u ON s.user_id = u.id
JOIN exercises e ON ws.exercise_id = e.id
WHERE u.id = 2
ORDER BY s.session_date DESC, ws.set_number
LIMIT 30;

-- 5. Food logs with food names and calculated calories for 2026-10-08
SELECT fl.meal_type, f.name, fl.quantity_g,
       ROUND(f.calories_per_100g * fl.quantity_g / 100, 1) AS calories
FROM food_logs fl
JOIN foods f ON fl.food_id = f.id
WHERE fl.user_id = 2 AND fl.log_date = '2026-10-08'
ORDER BY fl.meal_type;

-- 6. Users who have NEVER logged a workout (LEFT JOIN + IS NULL)
SELECT u.email
FROM users u
LEFT JOIN workout_sessions ws ON ws.user_id = u.id
WHERE ws.id IS NULL;

-- 7. Routine with all its exercises in order
SELECT r.name AS routine, e.name AS exercise,
       re.order_index, re.target_sets, re.target_rep_range, re.rest_seconds
FROM routines r
JOIN routine_exercises re ON re.routine_id = r.id
JOIN exercises e ON e.id = re.exercise_id
WHERE r.id = 5
ORDER BY re.order_index;
```

**Viva questions to answer out loud:**
- What is the difference between INNER JOIN and LEFT JOIN?
- If a LEFT JOIN returns NULL in the right table columns, what does that mean?
- Can you JOIN a table to itself? Give an example.
- What happens if you JOIN without an ON condition?

---

## DAY 3 — Aggregations

**Topics:** COUNT, SUM, AVG, MAX, MIN, GROUP BY, HAVING, ROUND, calculated columns

**Practice tasks:**
1. Write every Level 3 query from Phase 2 by hand.
2. For every query, predict the result before running it.
3. Practice explaining what GROUP BY does step by step.

**SQL queries to write today:**
```sql
-- 1. Sessions per user, sorted most active first
SELECT user_id, COUNT(*) AS sessions
FROM workout_sessions
GROUP BY user_id ORDER BY sessions DESC;

-- 2. Total volume (weight x reps) per session for user 2
SELECT ws.session_id, s.session_date,
       ROUND(SUM(ws.weight_kg * ws.reps)) AS volume_kg
FROM workout_sets ws
JOIN workout_sessions s ON s.id = ws.session_id
WHERE s.user_id = 2
GROUP BY ws.session_id, s.session_date
ORDER BY s.session_date DESC;

-- 3. Daily calorie intake for user 2
SELECT fl.log_date,
       ROUND(SUM(f.calories_per_100g * fl.quantity_g / 100)) AS calories,
       ROUND(SUM(f.protein_per_100g * fl.quantity_g / 100)) AS protein_g
FROM food_logs fl
JOIN foods f ON f.id = fl.food_id
WHERE fl.user_id = 2
GROUP BY fl.log_date ORDER BY fl.log_date;

-- 4. Exercises per muscle group
SELECT muscle_group, COUNT(*) AS exercise_count
FROM exercises
GROUP BY muscle_group ORDER BY exercise_count DESC;

-- 5. Max weight ever lifted per exercise (top 10)
SELECT e.name, MAX(ws.weight_kg) AS max_kg
FROM workout_sets ws
JOIN exercises e ON e.id = ws.exercise_id
GROUP BY e.id, e.name
ORDER BY max_kg DESC LIMIT 10;

-- 6. Users who trained more than 15 times in September 2026
SELECT user_id, COUNT(*) AS sessions
FROM workout_sessions
WHERE session_date BETWEEN '2026-09-01' AND '2026-09-30'
GROUP BY user_id
HAVING sessions > 15
ORDER BY sessions DESC;

-- 7. Average daily calories per user (across all logged days)
SELECT fl.user_id, p.full_name,
       ROUND(AVG(daily.kcal)) AS avg_daily_kcal
FROM (
  SELECT fl.user_id, fl.log_date,
         SUM(f.calories_per_100g * fl.quantity_g / 100) AS kcal
  FROM food_logs fl JOIN foods f ON f.id = fl.food_id
  GROUP BY fl.user_id, fl.log_date
) daily
JOIN food_logs fl ON fl.user_id = daily.user_id
JOIN profiles p ON p.id = fl.user_id
GROUP BY fl.user_id, p.full_name
ORDER BY avg_daily_kcal DESC LIMIT 10;
```

**Viva questions to answer out loud:**
- What is the difference between WHERE and HAVING?
- Can you use an alias defined in SELECT inside HAVING?
- What does GROUP BY do with NULL values?
- What is the order of execution: WHERE, GROUP BY, HAVING?

---

## DAY 4 — Advanced Queries

**Topics:** Subqueries, CTEs, Window Functions, RANK, LAG, FIRST_VALUE, NOT EXISTS, correlated subqueries

**Practice tasks:**
1. Write every Level 5 query from Phase 2 by hand.
2. Run the engagement funnel query from your PPT (Added slide D).
3. Run the window function queries from Slide 9 of your PPT.

**SQL queries to write today:**
```sql
-- 1. Each user's latest weigh-in (correlated subquery)
SELECT p.full_name, b.log_date, b.weight_kg
FROM body_metrics b
JOIN profiles p ON p.id = b.user_id
WHERE b.log_date = (
  SELECT MAX(b2.log_date) FROM body_metrics b2 WHERE b2.user_id = b.user_id
)
ORDER BY b.weight_kg DESC LIMIT 10;

-- 2. Users who never trained (NOT EXISTS)
SELECT u.id, u.email FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.user_id = u.id);

-- 3. Rank 'cut' users by weight lost (window function)
SELECT p.full_name,
       first_w.weight_kg AS start_weight,
       last_w.weight_kg AS current_weight,
       ROUND(first_w.weight_kg - last_w.weight_kg, 1) AS lost_kg,
       RANK() OVER (ORDER BY (first_w.weight_kg - last_w.weight_kg) DESC) AS rnk
FROM profiles p
JOIN (
  SELECT user_id, weight_kg FROM body_metrics b1
  WHERE log_date = (SELECT MIN(log_date) FROM body_metrics b2 WHERE b2.user_id = b1.user_id)
) first_w ON first_w.user_id = p.id
JOIN (
  SELECT user_id, weight_kg FROM body_metrics b3
  WHERE log_date = (SELECT MAX(log_date) FROM body_metrics b4 WHERE b4.user_id = b3.user_id)
) last_w ON last_w.user_id = p.id
WHERE p.goal = 'cut'
ORDER BY rnk LIMIT 10;

-- 4. Weekly active users (CTE)
WITH weekly AS (
  SELECT YEARWEEK(session_date, 1) AS wk,
         COUNT(DISTINCT user_id) AS active_users,
         COUNT(*) AS total_sessions
  FROM workout_sessions
  GROUP BY YEARWEEK(session_date, 1)
)
SELECT wk, active_users, total_sessions FROM weekly ORDER BY wk;

-- 5. Body weight change day over day for user 2 (LAG window function)
SELECT log_date, weight_kg,
       LAG(weight_kg) OVER (ORDER BY log_date) AS prev_weight,
       ROUND(weight_kg - LAG(weight_kg) OVER (ORDER BY log_date), 2) AS daily_change
FROM body_metrics
WHERE user_id = 2
ORDER BY log_date;

-- 6. Intake vs target for user 2 (subquery inside JOIN)
SELECT d.log_date,
       ROUND(d.kcal) AS eaten,
       t.calories AS target,
       ROUND(d.kcal - t.calories) AS gap
FROM (
  SELECT fl.user_id, fl.log_date,
         SUM(fl.quantity_g * f.calories_per_100g / 100) AS kcal
  FROM food_logs fl JOIN foods f ON f.id = fl.food_id
  WHERE fl.user_id = 2
  GROUP BY fl.user_id, fl.log_date
) d
JOIN nutrition_targets t ON t.user_id = d.user_id
  AND t.effective_date = (
    SELECT MAX(t2.effective_date) FROM nutrition_targets t2
    WHERE t2.user_id = d.user_id AND t2.effective_date <= d.log_date
  )
ORDER BY d.log_date DESC;

-- 7. Transaction + CASCADE demo
START TRANSACTION;
SELECT COUNT(*) FROM profiles WHERE id = 47;
SELECT COUNT(*) FROM food_logs WHERE user_id = 47;
DELETE FROM users WHERE id = 47;
SELECT COUNT(*) FROM profiles WHERE id = 47;
SELECT COUNT(*) FROM food_logs WHERE user_id = 47;
ROLLBACK;
SELECT COUNT(*) FROM profiles WHERE id = 47;
```

**Viva questions to answer out loud:**
- What is the difference between a CTE and a subquery?
- What does RANK() do when two rows have the same value?
- What is LAG()? What does it return for the first row?
- What is the difference between correlated and non-correlated subqueries?

---

## DAY 5 — Project Database Analysis

**Topics:** Deep dive into your specific schema, constraints, design decisions

**Practice tasks:**
1. Open Workbench → Database → Reverse Engineer → generate the EER diagram. Study it for 10 minutes.
2. Run `SHOW CREATE TABLE` for every table. Read every constraint name.
3. Answer every question in Phase 4.3 out loud.

**SQL queries to write today:**
```sql
-- 1. Show all constraints on workout_sets
SHOW CREATE TABLE workout_sets\G

-- 2. Verify CASCADE: count user 47's data before and after delete (use ROLLBACK)
START TRANSACTION;
SELECT 'before' AS state,
  (SELECT COUNT(*) FROM profiles WHERE id=47) AS profiles,
  (SELECT COUNT(*) FROM routines WHERE user_id=47) AS routines,
  (SELECT COUNT(*) FROM workout_sessions WHERE user_id=47) AS sessions,
  (SELECT COUNT(*) FROM food_logs WHERE user_id=47) AS food_logs,
  (SELECT COUNT(*) FROM body_metrics WHERE user_id=47) AS body_metrics;
DELETE FROM users WHERE id = 47;
SELECT 'after' AS state,
  (SELECT COUNT(*) FROM profiles WHERE id=47) AS profiles,
  (SELECT COUNT(*) FROM routines WHERE user_id=47) AS routines,
  (SELECT COUNT(*) FROM workout_sessions WHERE user_id=47) AS sessions,
  (SELECT COUNT(*) FROM food_logs WHERE user_id=47) AS food_logs,
  (SELECT COUNT(*) FROM body_metrics WHERE user_id=47) AS body_metrics;
ROLLBACK;

-- 3. Verify CHECK constraint violation
INSERT INTO food_logs (user_id, food_id, log_date, quantity_g, meal_type)
VALUES (2, 1, '2026-10-16', 100, 'brunch');
-- Expected: ERROR 3819 (HY000): Check constraint 'food_logs_meal_type_check' is violated.

-- 4. Verify UNIQUE constraint violation
INSERT INTO body_metrics (user_id, log_date, weight_kg) VALUES (2, '2026-10-08', 99.9);
-- Expected: ERROR 1062 - Duplicate entry for key 'body_metrics_user_id_log_date_key'

-- 5. Verify RESTRICT: try to delete an exercise that has sets
DELETE FROM exercises WHERE id = 1;
-- Expected: ERROR 1451 - Cannot delete or update a parent row: a foreign key constraint fails

-- 6. View the v_user_summary
SELECT * FROM v_user_summary ORDER BY workouts DESC LIMIT 10;

-- 7. Engagement funnel
WITH u AS (
  SELECT p.id, p.approved,
    EXISTS(SELECT 1 FROM body_metrics b WHERE b.user_id=p.id) AS w,
    EXISTS(SELECT 1 FROM food_logs f WHERE f.user_id=p.id) AS fl,
    (SELECT COUNT(*) FROM workout_sessions s WHERE s.user_id=p.id) AS n
  FROM profiles p
)
SELECT 'Registered' AS stage, COUNT(*) AS members FROM u
UNION ALL SELECT 'Approved', SUM(approved) FROM u
UNION ALL SELECT '+ Logged weight', SUM(approved AND w) FROM u
UNION ALL SELECT '+ Logged food', SUM(approved AND w AND fl) FROM u
UNION ALL SELECT '+ Any workout', SUM(approved AND w AND fl AND n>=1) FROM u
UNION ALL SELECT '+ Active 20+', SUM(approved AND w AND fl AND n>=20) FROM u;
```

**Viva questions to answer out loud:**
- Walk me through what happens when a new user registers (step by step in the database).
- Why does `profiles.id` not have AUTO_INCREMENT?
- What is the difference between `deleted_at` and actually deleting a row?
- Why is `routine_snapshot` stored as JSON?

---

## DAY 6 — Mock Viva

**Topics:** Full simulation. No notes. Answer everything out loud.

**Practice tasks:**
1. Close all notes. Open only Workbench.
2. Have someone ask you questions from Phase 5 randomly — or ask yourself.
3. For every answer, run a query to prove it.

**Must-demonstrate queries (run these live, no copy-paste):**
```sql
-- 1. Prove your schema has 11 tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'fitstack' AND table_type = 'BASE TABLE';

-- 2. Show all foreign keys in your schema
SELECT table_name, constraint_name, referenced_table_name
FROM information_schema.referential_constraints
WHERE constraint_schema = 'fitstack';

-- 3. Multi-table JOIN with aggregate (Q1 from PPT)
SELECT ws.session_date, r.name AS routine,
       COUNT(s.id) AS sets,
       ROUND(SUM(s.weight_kg * s.reps)) AS volume_kg
FROM workout_sessions ws
JOIN routines r ON r.id = ws.routine_id
JOIN workout_sets s ON s.session_id = ws.id
WHERE ws.user_id = 6
GROUP BY ws.id, ws.session_date, r.name
ORDER BY ws.session_date DESC LIMIT 5;

-- 4. Correlated subquery (latest weigh-in per user)
SELECT p.full_name, b.log_date, b.weight_kg
FROM body_metrics b JOIN profiles p ON p.id = b.user_id
WHERE b.log_date = (SELECT MAX(b2.log_date) FROM body_metrics b2 WHERE b2.user_id = b.user_id)
ORDER BY p.full_name LIMIT 5;

-- 5. Transaction + ROLLBACK (ACID demo)
START TRANSACTION;
DELETE FROM users WHERE id = 47;
SELECT COUNT(*) AS profiles_remaining FROM profiles WHERE id = 47;
ROLLBACK;
SELECT COUNT(*) AS profiles_restored FROM profiles WHERE id = 47;
```

**Self-evaluation checklist:**
- [ ] Can explain all 11 tables without notes
- [ ] Can draw the ER diagram from memory
- [ ] Can explain CASCADE vs SET NULL vs RESTRICT with examples
- [ ] Can prove BCNF for food_logs
- [ ] Can write a 4-table JOIN query from scratch
- [ ] Can explain the two intentional denormalizations
- [ ] Can run the transaction demo live
- [ ] Can answer "why MySQL not MongoDB" confidently

---

## DAY 7 — Final Revision

**Topics:** Consolidation. Fix weak spots. Rehearse the 4-minute presentation script.

**Practice tasks:**
1. Re-read Phase 4.2 (weak areas). Practice those answers specifically.
2. Run through the 4-minute script from your PPT_FINAL_REVIEW.md out loud, timed.
3. Open Workbench and run the 5 must-demonstrate queries from Day 6 from memory.
4. Read through the 100 viva questions. Mark any you still can't answer confidently.

**Final checklist before the review:**
- [ ] `schema.sql` loads cleanly in Workbench
- [ ] `seed_data.sql` loads after schema
- [ ] EER diagram exported as PNG
- [ ] `v_user_summary` view exists and returns data
- [ ] Q11 (transaction demo) tested and works
- [ ] App runs: `npm run api` + `npm run app`
- [ ] Login tested: `user2@example.com` / `user2123` / `123456`
- [ ] PPT has all 17 slides in order
- [ ] Know your team number and roll numbers

**The 5 sentences that will save you in any viva:**
1. "Every table exists to remove a specific redundancy."
2. "Every constraint exists to prevent a specific bad row."
3. "Calories are never stored in food_logs — they are always computed by joining foods."
4. "CASCADE where data is owned by the user, SET NULL where history must survive, RESTRICT where deleting would corrupt history."
5. "The two intentional denormalizations are routine_snapshot (history preservation) and is_pr (performance optimization) — both documented."

---

*End of REVIEW_PREPARATION_ROADMAP.md*
