-- FitStack: MySQL 8.0+ copy of the Supabase (PostgreSQL) schema, for MySQL Workbench.
--
-- The live app stays on Supabase. This file is a snapshot for the DBMS course:
-- ER/EER diagram, practice queries, and INSERT/UPDATE/DELETE demos.
--
-- Simplified for the course: no TDEE / adaptive-target tables (tdee_estimates, dismissed_suggestions, audit_log).
--
-- Differences from Supabase:
--   * auth.users is replaced by a plain `users` table (id, email, created_at); emails are made-up examples.
--   * ids are plain INT AUTO_INCREMENT numbers (1, 2, 3, ...); timestamptz -> DATETIME (UTC), boolean -> BOOLEAN, jsonb -> JSON.
--   * Row-level security, triggers and the edge function do not exist here.
--   * Sample data only: all exercises/foods/routines, 3 workout sessions' sets, 2 days of food logs,
--     and a selection of body_metrics. `routine_snapshot` is left NULL.
--
-- How to load: MySQL Workbench -> open a connection -> File -> Open SQL Script -> this file -> run (lightning bolt).
-- Then: Database -> Reverse Engineer... -> pick `fitstack` -> finish, to get the EER diagram.

DROP DATABASE IF EXISTS fitstack;
CREATE DATABASE fitstack CHARACTER SET utf8mb4;
USE fitstack;

-- ---------------------------------------------------------------- schema

CREATE TABLE users (
  id          INT     NOT NULL AUTO_INCREMENT,
  email       VARCHAR(255) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE profiles (
  id                 INT      NOT NULL,
  full_name          VARCHAR(100)  NULL,
  goal               VARCHAR(10)   NULL,
  goal_rate_kg_week  DECIMAL(4,2)  NULL,
  height_cm          DECIMAL(5,1)  NULL,
  onboarded          BOOLEAN       NOT NULL DEFAULT 0,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved           BOOLEAN       NOT NULL DEFAULT 0,
  role               VARCHAR(10)   NOT NULL DEFAULT 'user',
  timezone           VARCHAR(50)   NOT NULL DEFAULT 'UTC',
  PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT profiles_goal_check CHECK (goal IN ('bulk','cut','maintain')),
  CONSTRAINT profiles_role_check CHECK (role IN ('user','admin'))
);

CREATE TABLE exercises (
  id            INT     NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  muscle_group  VARCHAR(50)  NOT NULL,
  equipment     VARCHAR(50)  NULL,
  is_custom     BOOLEAN      NOT NULL DEFAULT 0,
  created_by    INT     NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE routines (
  id          INT     NOT NULL AUTO_INCREMENT,
  user_id     INT     NOT NULL,
  name        VARCHAR(100) NOT NULL,
  notes       TEXT         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  style       VARCHAR(10)  NULL,
  deleted_at  DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT routines_style_check CHECK (style IS NULL OR style IN ('push','pull','legs','upper','lower','full-body','arms','core'))
);

CREATE TABLE routine_exercises (
  id                INT     NOT NULL AUTO_INCREMENT,
  routine_id        INT     NOT NULL,
  exercise_id       INT     NOT NULL,
  order_index       INT          NOT NULL,
  target_sets       INT          NULL,
  target_rep_range  VARCHAR(20)  NULL,
  target_rpe        DECIMAL(3,1) NULL,
  rest_seconds      INT          NOT NULL DEFAULT 90,
  notes             TEXT         NULL,
  PRIMARY KEY (id),
  CONSTRAINT routine_exercises_routine_id_fkey  FOREIGN KEY (routine_id)  REFERENCES routines (id)  ON DELETE CASCADE,
  CONSTRAINT routine_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE TABLE workout_sessions (
  id                INT  NOT NULL AUTO_INCREMENT,
  user_id           INT  NOT NULL,
  routine_id        INT  NULL,
  session_date      DATE      NOT NULL,
  notes             TEXT      NULL,
  started_at        DATETIME  NULL,
  ended_at          DATETIME  NULL,
  routine_snapshot  JSON      NULL,
  PRIMARY KEY (id),
  CONSTRAINT workout_sessions_user_id_fkey    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT workout_sessions_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES routines (id) ON DELETE SET NULL
);

CREATE TABLE workout_sets (
  id           INT     NOT NULL AUTO_INCREMENT,
  session_id   INT     NOT NULL,
  exercise_id  INT     NOT NULL,
  set_number   INT          NOT NULL,
  weight_kg    DECIMAL(6,2) NULL,
  reps         INT          NULL,
  rpe          DECIMAL(3,1) NULL,
  set_type     VARCHAR(10)  NOT NULL DEFAULT 'normal',
  notes        TEXT         NULL,
  is_pr        BOOLEAN      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT workout_sets_session_id_fkey  FOREIGN KEY (session_id)  REFERENCES workout_sessions (id) ON DELETE CASCADE,
  CONSTRAINT workout_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises (id),
  CONSTRAINT workout_sets_set_type_check CHECK (set_type IN ('normal','warmup','drop','amrap','failure'))
);

CREATE TABLE foods (
  id                 INT     NOT NULL AUTO_INCREMENT,
  name               VARCHAR(150) NOT NULL,
  brand              VARCHAR(100) NULL,
  calories_per_100g  DECIMAL(6,2) NULL,
  protein_per_100g   DECIMAL(6,2) NULL,
  carbs_per_100g     DECIMAL(6,2) NULL,
  fat_per_100g       DECIMAL(6,2) NULL,
  serving_label      VARCHAR(60)  NULL,
  serving_g          DECIMAL(6,1) NULL,
  is_custom          BOOLEAN      NOT NULL DEFAULT 0,
  created_by         INT     NULL,
  deleted_at         DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT foods_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE food_logs (
  id          INT     NOT NULL AUTO_INCREMENT,
  user_id     INT     NOT NULL,
  food_id     INT     NOT NULL,
  log_date    DATE         NOT NULL,
  quantity_g  DECIMAL(7,2) NOT NULL,
  meal_type   VARCHAR(10)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT food_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT food_logs_food_id_fkey FOREIGN KEY (food_id) REFERENCES foods (id),
  CONSTRAINT food_logs_meal_type_check CHECK (meal_type IN ('breakfast','lunch','dinner','snack','other'))
);

CREATE TABLE nutrition_targets (
  id              INT    NOT NULL AUTO_INCREMENT,
  user_id         INT    NOT NULL,
  effective_date  DATE        NOT NULL,
  calories        INT         NOT NULL,
  protein_g       INT         NOT NULL,
  carbs_g         INT         NOT NULL,
  fat_g           INT         NOT NULL,
  source          VARCHAR(30) NOT NULL DEFAULT 'manual',
  PRIMARY KEY (id),
  CONSTRAINT nutrition_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE body_metrics (
  id         INT     NOT NULL AUTO_INCREMENT,
  user_id    INT     NOT NULL,
  log_date   DATE         NOT NULL,
  weight_kg  DECIMAL(5,2) NULL,
  waist_cm   DECIMAL(5,1) NULL,
  chest_cm   DECIMAL(5,1) NULL,
  arm_cm     DECIMAL(5,1) NULL,
  photo_url  TEXT         NULL,
  PRIMARY KEY (id),
  CONSTRAINT body_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------- sample data

INSERT INTO users (id, email, created_at) VALUES
(1,'user1@example.com','2026-08-16 12:51:59'),
(2,'user2@example.com','2026-08-29 14:56:56'),
(3,'user3@example.com','2026-10-07 13:41:29'),
(4,'user4@example.com','2026-10-08 10:46:51');

INSERT INTO profiles (id, full_name, goal, goal_rate_kg_week, height_cm, onboarded, created_at, approved, role, timezone) VALUES
(2,'WORKING PRA','cut','-0.60','180.0',1,'2026-08-29 14:56:56',1,'user','UTC'),
(1,'charith','cut','-0.50','190.0',1,'2026-08-16 12:51:59',1,'user','UTC'),
(3,NULL,NULL,NULL,NULL,0,'2026-10-07 13:41:29',1,'admin','UTC'),
(4,'Virinchi Sai Chalasani','bulk','0.25','162.0',1,'2026-10-08 10:46:51',0,'user','UTC');

INSERT INTO exercises (id, name, muscle_group, equipment, is_custom, created_by, deleted_at) VALUES
(1,'Barbell Bench Press','chest','barbell',0,NULL,NULL),
(2,'Incline Barbell Bench Press','chest','barbell',0,NULL,NULL),
(3,'Dumbbell Bench Press','chest','dumbbell',0,NULL,NULL),
(4,'Incline Dumbbell Press','chest','dumbbell',0,NULL,NULL),
(5,'Cable Chest Fly','chest','machine',0,NULL,NULL),
(6,'Pec Deck','chest','machine',0,NULL,NULL),
(7,'Chest Dips','chest','bodyweight',0,NULL,NULL),
(8,'Conventional Deadlift','back','barbell',0,NULL,NULL),
(9,'Barbell Row','back','barbell',0,NULL,NULL),
(10,'Pendlay Row','back','barbell',0,NULL,NULL),
(11,'Pull-Up','back','bodyweight',0,NULL,NULL),
(12,'Chin-Up','back','bodyweight',0,NULL,NULL),
(13,'Lat Pulldown','back','machine',0,NULL,NULL),
(14,'Seated Cable Row','back','machine',0,NULL,NULL),
(15,'Single-Arm Dumbbell Row','back','dumbbell',0,NULL,NULL),
(16,'Face Pull','back','machine',0,NULL,NULL),
(17,'Barbell Back Squat','legs','barbell',0,NULL,NULL),
(18,'Front Squat','legs','barbell',0,NULL,NULL),
(19,'Romanian Deadlift','legs','barbell',0,NULL,NULL),
(20,'Leg Press','legs','machine',0,NULL,NULL),
(21,'Hack Squat','legs','machine',0,NULL,NULL),
(22,'Bulgarian Split Squat','legs','dumbbell',0,NULL,NULL),
(23,'Lying Leg Curl','legs','machine',0,NULL,NULL),
(24,'Leg Extension','legs','machine',0,NULL,NULL),
(25,'Walking Lunge','legs','dumbbell',0,NULL,NULL),
(26,'Standing Calf Raise','legs','machine',0,NULL,NULL),
(27,'Overhead Press','shoulders','barbell',0,NULL,NULL),
(28,'Seated Dumbbell Shoulder Press','shoulders','dumbbell',0,NULL,NULL),
(29,'Dumbbell Lateral Raise','shoulders','dumbbell',0,NULL,NULL),
(30,'Cable Lateral Raise','shoulders','machine',0,NULL,NULL),
(31,'Rear Delt Fly','shoulders','dumbbell',0,NULL,NULL),
(32,'Barbell Curl','arms','barbell',0,NULL,NULL),
(33,'Incline Dumbbell Curl','arms','dumbbell',0,NULL,NULL),
(34,'Hammer Curl','arms','dumbbell',0,NULL,NULL),
(35,'Preacher Curl','arms','machine',0,NULL,NULL),
(36,'EZ-Bar Skullcrusher','arms','barbell',0,NULL,NULL),
(37,'Tricep Rope Pushdown','arms','machine',0,NULL,NULL),
(38,'Overhead Cable Tricep Extension','arms','machine',0,NULL,NULL),
(39,'Close-Grip Bench Press','arms','barbell',0,NULL,NULL),
(40,'Hanging Leg Raise','core','bodyweight',0,NULL,NULL),
(41,'Cable Crunch','core','machine',0,NULL,NULL),
(42,'Weighted Plank','core','bodyweight',0,NULL,NULL),
(43,'Ab Wheel Rollout','core','bodyweight',0,NULL,NULL);

INSERT INTO foods (id, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_label, serving_g, is_custom, created_by, deleted_at) VALUES
(1,'Chicken Breast, grilled',NULL,'165.00','31.00','0.00','3.60','1 breast (150 g)','150.0',0,NULL,NULL),
(2,'Chicken Thigh, skinless',NULL,'179.00','24.80','0.00','8.20','1 thigh (95 g)','95.0',0,NULL,NULL),
(3,'Beef Mince 5% fat',NULL,'137.00','21.50','0.00','5.00','Portion (200 g)','200.0',0,NULL,NULL),
(4,'Salmon Fillet',NULL,'208.00','20.40','0.00','13.40','1 fillet (130 g)','130.0',0,NULL,NULL),
(5,'Cod Fillet',NULL,'82.00','17.80','0.00','0.70','1 fillet (150 g)','150.0',0,NULL,NULL),
(6,'Tuna in Spring Water','John West','109.00','25.50','0.00','0.60','1 tin (112 g)','112.0',0,NULL,NULL),
(7,'Whole Egg',NULL,'143.00','12.60','0.70','9.50','1 large egg (58 g)','58.0',0,NULL,NULL),
(8,'Egg White',NULL,'52.00','10.90','0.70','0.20','1 white (33 g)','33.0',0,NULL,NULL),
(9,'Turkey Mince 2% fat',NULL,'116.00','24.00','0.00','2.00','Portion (200 g)','200.0',0,NULL,NULL),
(10,'Whey Protein Isolate','Bulk','373.00','82.00','4.50','2.50','1 scoop (30 g)','30.0',0,NULL,NULL),
(11,'Micellar Casein','MyProtein','358.00','78.00','4.00','2.00','1 scoop (30 g)','30.0',0,NULL,NULL),
(12,'Greek Yogurt 0%','Fage','57.00','10.30','3.60','0.20','Pot (170 g)','170.0',0,NULL,NULL),
(13,'Cottage Cheese',NULL,'98.00','11.10','3.40','4.30','Portion (200 g)','200.0',0,NULL,NULL),
(14,'Firm Tofu',NULL,'144.00','15.80','2.80','8.70','Block (200 g)','200.0',0,NULL,NULL),
(15,'King Prawns, cooked',NULL,'99.00','20.90','0.20','1.40','Portion (150 g)','150.0',0,NULL,NULL),
(16,'White Rice, cooked',NULL,'130.00','2.70','28.20','0.30','Portion (200 g)','200.0',0,NULL,NULL),
(17,'Basmati Rice, cooked',NULL,'121.00','3.50','25.20','0.40','Portion (200 g)','200.0',0,NULL,NULL),
(18,'Jasmine Rice, cooked',NULL,'129.00','2.90','28.00','0.30','Portion (200 g)','200.0',0,NULL,NULL),
(19,'Rolled Oats, dry',NULL,'379.00','13.20','67.70','6.50','Serving (80 g)','80.0',0,NULL,NULL),
(20,'Sweet Potato, baked',NULL,'90.00','2.00','20.70','0.20','1 medium (150 g)','150.0',0,NULL,NULL),
(21,'White Potato, boiled',NULL,'87.00','1.90','20.10','0.10','Portion (250 g)','250.0',0,NULL,NULL),
(22,'Pasta, cooked',NULL,'158.00','5.80','30.90','0.90','Portion (250 g)','250.0',0,NULL,NULL),
(23,'Sourdough Bread',NULL,'246.00','9.80','47.20','1.70','1 slice (55 g)','55.0',0,NULL,NULL),
(24,'Wholemeal Bread','Hovis','236.00','10.50','39.20','2.70','1 slice (44 g)','44.0',0,NULL,NULL),
(25,'Plain Bagel',NULL,'275.00','11.00','52.00','1.60','1 bagel (85 g)','85.0',0,NULL,NULL),
(26,'Banana',NULL,'89.00','1.10','22.80','0.30','1 medium (118 g)','118.0',0,NULL,NULL),
(27,'Apple',NULL,'52.00','0.30','13.80','0.20','1 medium (180 g)','180.0',0,NULL,NULL),
(28,'Blueberries',NULL,'57.00','0.70','14.50','0.30','Handful (80 g)','80.0',0,NULL,NULL),
(29,'Honey',NULL,'304.00','0.30','82.40','0.00','1 tbsp (21 g)','21.0',0,NULL,NULL),
(30,'Rice Cakes','Kallo','387.00','8.20','81.10','3.10','1 cake (8 g)','8.0',0,NULL,NULL),
(31,'Olive Oil',NULL,'884.00','0.00','0.00','100.00','1 tbsp (14 g)','14.0',0,NULL,NULL),
(32,'Peanut Butter, smooth','Meridian','606.00','27.00','12.50','50.00','1 tbsp (16 g)','16.0',0,NULL,NULL),
(33,'Almonds',NULL,'579.00','21.20','21.60','49.90','Handful (30 g)','30.0',0,NULL,NULL),
(34,'Avocado',NULL,'160.00','2.00','8.50','14.70','Half (100 g)','100.0',0,NULL,NULL),
(35,'Cheddar Cheese',NULL,'402.00','25.00','1.30','33.10','Slice (30 g)','30.0',0,NULL,NULL),
(36,'Dark Chocolate 85%','Lindt','592.00','10.00','19.00','51.00','2 squares (20 g)','20.0',0,NULL,NULL),
(37,'Broccoli, steamed',NULL,'35.00','2.40','7.20','0.40','Portion (150 g)','150.0',0,NULL,NULL),
(38,'Spinach',NULL,'23.00','2.90','3.60','0.40','Handful (50 g)','50.0',0,NULL,NULL),
(39,'Mixed Vegetables',NULL,'45.00','2.30','8.10','0.40','Portion (200 g)','200.0',0,NULL,NULL),
(40,'Semi-Skimmed Milk',NULL,'50.00','3.60','4.80','1.80','Glass (250 g)','250.0',0,NULL,NULL),
(41,'Oat Milk, barista','Oatly','59.00','1.00','6.70','3.00','Glass (250 g)','250.0',0,NULL,NULL),
(42,'Protein Bar, cookie dough','Grenade','388.00','34.00','33.00','15.00','1 bar (60 g)','60.0',0,NULL,NULL),
(43,'Tomato Ketchup','Heinz','102.00','1.20','23.20','0.10','1 tbsp (15 g)','15.0',0,NULL,NULL);

INSERT INTO routines (id, user_id, name, notes, created_at, updated_at, style, deleted_at) VALUES
(1,1,'LOWER','LEGS,BUTT','2026-08-16 15:41:58','2026-08-16 15:41:58',NULL,NULL),
(2,3,'Pull A','Back thickness then width, arms last.','2026-08-16 19:40:29','2026-08-28 18:17:32','pull',NULL),
(3,3,'Legs A','Quads then posterior chain.','2026-08-16 19:40:29','2026-08-28 18:17:32','legs',NULL),
(4,3,'Push A','Chest and shoulders. Bench first while fresh.','2026-08-16 19:40:29','2026-08-28 18:21:50','push',NULL),
(5,2,'Push Day',NULL,'2026-10-08 12:02:34','2026-10-08 12:02:34','push',NULL),
(6,2,'Pull Day',NULL,'2026-10-08 12:02:34','2026-10-08 12:02:34','pull',NULL),
(7,2,'Leg Day',NULL,'2026-10-08 12:02:34','2026-10-08 12:02:34','legs',NULL);

INSERT INTO routine_exercises (id, routine_id, exercise_id, order_index, target_sets, target_rep_range, target_rpe, rest_seconds, notes) VALUES
(1,1,26,'0','3','12',NULL,'90',NULL),
(2,1,24,'1','3','8-12',NULL,'90',NULL),
(3,1,23,'2','3','8-12',NULL,'90',NULL),
(4,2,9,'0','3','6-8','8.0','150',NULL),
(5,2,13,'1','3','8-12','8.5','105',NULL),
(6,2,32,'2','3','8-12','9.0','75',NULL),
(7,3,20,'0','3','8-12','8.5','150',NULL),
(8,3,19,'1','3','6-10','8.0','135',NULL),
(9,4,1,'0','3','6-8','8.0','150',NULL),
(10,4,4,'1','3','8-12','8.5','105',NULL),
(11,4,27,'2','3','6-10','8.0','120',NULL),
(12,5,1,'1','4','6-8',NULL,'120',NULL),
(13,5,27,'2','3','8-10',NULL,'90',NULL),
(14,5,4,'3','3','8-10',NULL,'90',NULL),
(15,5,29,'4','3','12-15',NULL,'60',NULL),
(16,5,37,'5','3','10-12',NULL,'60',NULL),
(17,6,8,'1','3','4-6',NULL,'150',NULL),
(18,6,9,'2','4','6-8',NULL,'120',NULL),
(19,6,13,'3','3','8-10',NULL,'90',NULL),
(20,6,14,'4','3','10-12',NULL,'90',NULL),
(21,6,32,'5','3','8-10',NULL,'60',NULL),
(22,7,17,'1','4','5-8',NULL,'150',NULL),
(23,7,19,'2','3','6-8',NULL,'120',NULL),
(24,7,20,'3','3','10-12',NULL,'90',NULL),
(25,7,24,'4','3','12-15',NULL,'60',NULL),
(26,7,26,'5','4','12-15',NULL,'45',NULL);

INSERT INTO workout_sessions (id, user_id, routine_id, session_date, notes, started_at, ended_at) VALUES
(1,2,5,'2026-08-31',NULL,'2026-08-31 18:22:00','2026-08-31 19:41:00'),
(2,1,1,'2026-08-16','good','2026-08-16 15:42:04','2026-08-16 15:44:10'),
(3,3,4,'2026-07-28','Felt heavy, bar speed slow.','2026-07-28 18:05:00','2026-07-28 19:12:00'),
(4,3,2,'2026-07-30',NULL,'2026-07-30 18:10:00','2026-07-30 19:20:00'),
(5,3,3,'2026-08-01',NULL,'2026-08-01 17:55:00','2026-08-01 18:58:00'),
(6,3,4,'2026-08-04','Bench moved better today.','2026-08-04 18:00:00','2026-08-04 19:08:00'),
(7,3,2,'2026-08-06',NULL,'2026-08-06 18:15:00','2026-08-06 19:25:00'),
(8,3,3,'2026-08-08',NULL,'2026-08-08 18:05:00','2026-08-08 19:10:00'),
(9,3,4,'2026-08-11','PR on bench.','2026-08-11 17:50:00','2026-08-11 19:00:00'),
(10,3,2,'2026-08-13',NULL,'2026-08-13 18:20:00','2026-08-13 19:30:00'),
(11,3,3,'2026-08-15','Legs felt strong.','2026-08-15 18:00:00','2026-08-15 19:05:00'),
(12,1,1,'2026-08-28',NULL,'2026-08-28 17:45:10','2026-08-29 14:40:20'),
(13,3,4,'2026-08-30','Good session, bench felt strong today.','2026-08-30 03:29:13','2026-08-30 03:31:12'),
(14,1,1,'2026-08-31','Cutting session, legs felt strong. Lying leg curl up to 20 kg.','2026-08-31 03:30:27','2026-08-31 03:31:39'),
(15,2,6,'2026-09-01',NULL,'2026-09-01 18:32:00','2026-09-01 19:33:00'),
(16,2,7,'2026-09-03',NULL,'2026-09-03 18:32:00','2026-09-03 19:49:00'),
(17,2,5,'2026-09-04',NULL,'2026-09-04 18:19:00','2026-09-04 19:31:00'),
(18,2,6,'2026-09-07',NULL,'2026-09-07 18:32:00','2026-09-07 19:38:00'),
(19,2,7,'2026-09-08',NULL,'2026-09-08 18:33:00','2026-09-08 19:49:00'),
(20,2,5,'2026-09-10',NULL,'2026-09-10 18:33:00','2026-09-10 19:32:00'),
(21,2,6,'2026-09-11',NULL,'2026-09-11 18:27:00','2026-09-11 19:31:00'),
(22,2,7,'2026-09-14',NULL,'2026-09-14 18:34:00','2026-09-14 19:44:00'),
(23,2,5,'2026-09-15',NULL,'2026-09-15 18:21:00','2026-09-15 19:45:00'),
(24,2,6,'2026-09-17',NULL,'2026-09-17 18:33:00','2026-09-17 19:33:00'),
(25,2,7,'2026-09-18',NULL,'2026-09-18 18:31:00','2026-09-18 19:48:00'),
(26,2,5,'2026-09-21',NULL,'2026-09-21 18:15:00','2026-09-21 19:31:00'),
(27,2,6,'2026-09-22',NULL,'2026-09-22 18:24:00','2026-09-22 19:40:00'),
(28,2,7,'2026-09-24',NULL,'2026-09-24 18:18:00','2026-09-24 19:38:00'),
(29,2,5,'2026-09-25',NULL,'2026-09-25 18:20:00','2026-09-25 19:48:00'),
(30,2,6,'2026-09-28',NULL,'2026-09-28 18:21:00','2026-09-28 19:42:00'),
(31,2,7,'2026-09-29',NULL,'2026-09-29 18:23:00','2026-09-29 19:37:00'),
(32,2,5,'2026-10-01',NULL,'2026-10-01 18:23:00','2026-10-01 19:47:00'),
(33,2,6,'2026-10-02',NULL,'2026-10-02 18:26:00','2026-10-02 19:47:00'),
(34,2,7,'2026-10-05',NULL,'2026-10-05 18:18:00','2026-10-05 19:33:00'),
(35,2,5,'2026-10-06',NULL,'2026-10-06 18:22:00','2026-10-06 19:45:00'),
(36,2,6,'2026-10-08',NULL,'2026-10-08 18:22:00','2026-10-08 19:49:00');

-- Sets for 3 sessions only (Push 2026-10-06, Pull 2026-10-08, Legs 2026-10-05).
INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight_kg, reps, rpe, set_type, notes, is_pr) VALUES
(1,35,1,'1','72.50','7','7.5','normal',NULL,0),
(2,35,1,'3','72.50','7','8.5','normal',NULL,0),
(3,35,1,'4','72.50','6','9.0','normal',NULL,0),
(4,35,27,'1','42.50','9','7.5','normal',NULL,0),
(5,35,27,'3','42.50','8','8.5','normal',NULL,0),
(6,35,4,'2','27.50','10','8.0','normal',NULL,0),
(7,35,4,'3','27.50','10','8.5','normal',NULL,0),
(8,35,29,'2','12.50','13','8.5','normal',NULL,0),
(9,35,29,'3','12.50','12','9.0','normal',NULL,0),
(10,35,37,'1','30.00','12','8.0','normal',NULL,0),
(11,35,37,'2','30.00','12','8.5','normal',NULL,0),
(12,35,37,'3','30.00','11','9.0','normal',NULL,0),
(13,35,4,'1','27.50','11','7.5','normal',NULL,1),
(14,35,29,'1','12.50','13','8.0','normal',NULL,0),
(15,35,27,'2','42.50','10','8.0','normal',NULL,1),
(16,35,1,'2','72.50','8','8.0','normal',NULL,1),
(17,36,8,'2','127.50','5','8.0','normal',NULL,0),
(18,36,8,'3','127.50','5','8.5','normal',NULL,0),
(19,36,9,'2','72.50','8','8.0','normal',NULL,0),
(20,36,9,'3','72.50','8','8.5','normal',NULL,0),
(21,36,9,'4','72.50','7','9.0','normal',NULL,0),
(22,36,13,'2','65.00','9','8.0','normal',NULL,0),
(23,36,13,'3','65.00','10','8.5','normal',NULL,0),
(24,36,14,'1','60.00','11','8.0','normal',NULL,0),
(25,36,14,'2','60.00','11','8.5','normal',NULL,0),
(26,36,32,'1','37.50','9','8.0','normal',NULL,1),
(27,36,32,'2','37.50','9','8.5','normal',NULL,0),
(28,36,32,'3','37.50','9','9.0','normal',NULL,0),
(29,36,14,'3','60.00','12','9.0','normal',NULL,1),
(30,36,9,'1','72.50','8','7.5','normal',NULL,1),
(31,36,8,'1','127.50','5','7.5','normal',NULL,1),
(32,36,13,'1','65.00','10','7.5','normal',NULL,1),
(33,34,17,'2','102.50','6','8.0','normal',NULL,0),
(34,34,17,'3','102.50','6','8.5','normal',NULL,0),
(35,34,17,'4','102.50','5','9.0','normal',NULL,0),
(36,34,19,'2','85.00','7','8.0','normal',NULL,0),
(37,34,19,'3','85.00','6','8.5','normal',NULL,0),
(38,34,20,'2','145.00','10','8.0','normal',NULL,0),
(39,34,20,'3','145.00','11','8.5','normal',NULL,0),
(40,34,24,'3','52.50','13','9.0','normal',NULL,0),
(41,34,26,'2','70.00','14','8.5','normal',NULL,0),
(42,34,26,'3','70.00','14','9.0','normal',NULL,0),
(43,34,26,'4','70.00','14','9.5','normal',NULL,0),
(44,34,24,'1','52.50','13','8.0','normal',NULL,0),
(45,34,20,'1','145.00','13','7.5','normal',NULL,1),
(46,34,24,'2','52.50','14','8.5','normal',NULL,1),
(47,34,26,'1','70.00','15','8.0','normal',NULL,1),
(48,34,17,'1','102.50','7','7.5','normal',NULL,1),
(49,34,19,'1','85.00','9','7.5','normal',NULL,1);

INSERT INTO nutrition_targets (id, user_id, effective_date, calories, protein_g, carbs_g, fat_g, source) VALUES
(1,3,'2026-08-16','2810','103','411','84','manual'),
(2,1,'2026-08-16','2980','124','421','89','manual'),
(3,3,'2026-08-28','2960','103','437','89','manual'),
(4,2,'2026-08-29','2470','198','264','69','manual'),
(5,4,'2026-10-08','2530','131','331','76','manual'),
(6,2,'2026-09-15','2420','195','255','67','manual'),
(7,2,'2026-09-29','2380','193','245','65','manual');

INSERT INTO body_metrics (id, user_id, log_date, weight_kg, waist_cm, chest_cm, arm_cm, photo_url) VALUES
(1,1,'2026-08-16','65.00',NULL,NULL,NULL,NULL),
(2,3,'2026-08-30','54.20',NULL,NULL,NULL,NULL),
(3,4,'2026-10-08','69.00',NULL,NULL,NULL,NULL),
(4,2,'2026-10-02','87.30',NULL,NULL,NULL,NULL),
(5,2,'2026-10-03','86.80',NULL,NULL,NULL,NULL),
(6,2,'2026-10-04','86.60',NULL,NULL,NULL,NULL),
(7,2,'2026-10-05','87.20',NULL,NULL,NULL,NULL),
(8,2,'2026-10-06','87.10',NULL,NULL,NULL,NULL),
(9,2,'2026-10-07','86.40',NULL,NULL,NULL,NULL),
(10,2,'2026-10-08','86.50',NULL,NULL,NULL,NULL);

-- Food logs for 2026-10-07 and 2026-10-08 only.
INSERT INTO food_logs (id, user_id, food_id, log_date, quantity_g, meal_type) VALUES
(1,2,36,'2026-10-07','20.00','snack'),
(2,2,40,'2026-10-07','250.00','snack'),
(3,2,11,'2026-10-07','30.00','snack'),
(4,2,38,'2026-10-07','50.00','dinner'),
(5,2,20,'2026-10-07','200.00','dinner'),
(6,2,9,'2026-10-07','200.00','dinner'),
(7,2,31,'2026-10-07','14.00','lunch'),
(8,2,39,'2026-10-07','200.00','lunch'),
(9,2,18,'2026-10-07','200.00','lunch'),
(10,2,15,'2026-10-07','150.00','lunch'),
(11,2,7,'2026-10-07','116.00','breakfast'),
(12,2,35,'2026-10-07','30.00','breakfast'),
(13,2,25,'2026-10-07','85.00','breakfast'),
(14,2,33,'2026-10-08','30.00','snack'),
(15,2,12,'2026-10-08','170.00','snack'),
(16,2,39,'2026-10-08','200.00','dinner'),
(17,2,20,'2026-10-08','200.00','dinner'),
(18,2,4,'2026-10-08','130.00','dinner'),
(19,2,31,'2026-10-08','14.00','lunch'),
(20,2,37,'2026-10-08','150.00','lunch'),
(21,2,17,'2026-10-08','200.00','lunch'),
(22,2,1,'2026-10-08','200.00','lunch'),
(23,2,32,'2026-10-08','16.00','breakfast'),
(24,2,26,'2026-10-08','118.00','breakfast'),
(25,2,10,'2026-10-08','30.00','breakfast'),
(26,2,19,'2026-10-08','100.00','breakfast');

-- Quick check after loading (expected: users 4, profiles 4, exercises 43, foods 43, routines 7, workout_sessions 36).
SELECT 'users' AS tbl, COUNT(*) AS n FROM users UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'exercises', COUNT(*) FROM exercises UNION ALL SELECT 'foods', COUNT(*) FROM foods
UNION ALL SELECT 'routines', COUNT(*) FROM routines UNION ALL SELECT 'workout_sessions', COUNT(*) FROM workout_sessions;

-- Added for the local app: password login.
ALTER TABLE users ADD COLUMN password_hash VARCHAR(100) NULL;

ALTER TABLE body_metrics ADD UNIQUE KEY body_metrics_user_id_log_date_key (user_id, log_date);
ALTER TABLE nutrition_targets ADD UNIQUE KEY nutrition_targets_user_date_unique (user_id, effective_date);
