// Add a user (or reset an existing user's password) straight in the database.
// Usage:  node tools/add_user.js <email> <password> "<Full Name>" [--admin]
// Passwords are never stored as text: this script stores a bcrypt hash in users.password_hash.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const isAdmin = process.argv.includes('--admin')
const [emailRaw, password, fullName = null] = args
if (!emailRaw || !password) {
  console.error('Usage: node tools/add_user.js <email> <password> "<Full Name>" [--admin]')
  process.exit(1)
}
const email = emailRaw.toLowerCase()

;(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fitstack',
  })
  const hash = bcrypt.hashSync(password, 10)
  const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email])
  if (existing.length) {
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, existing[0].id])
    console.log(`Password reset for ${email} (id ${existing[0].id}).`)
  } else {
    await db.beginTransaction()
    try {
      const [res] = await db.query('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hash])
      await db.query('INSERT INTO profiles (id, full_name, approved, role) VALUES (?, ?, 1, ?)',
        [res.insertId, fullName, isAdmin ? 'admin' : 'user'])
      await db.commit()
      console.log(`Created ${isAdmin ? 'admin' : 'user'} ${email} with id ${res.insertId}.`)
    } catch (e) {
      await db.rollback()
      throw e
    }
  }
  await db.end()
})().catch((e) => { console.error('Failed:', e.message); process.exit(1) })
