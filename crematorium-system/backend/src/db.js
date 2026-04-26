const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const defaultSlots = ['06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00'];

async function initDb(dbFile) {
  const db = await open({
    filename: path.resolve(dbFile),
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_time TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      usage_type TEXT,
      usage_amount REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS staff_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_date TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      present INTEGER NOT NULL,
      marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(attendance_date, staff_name)
    );
  `);

  const countRow = await db.get('SELECT COUNT(*) as count FROM time_slots');
  if (countRow.count === 0) {
    const insertStmt = await db.prepare('INSERT INTO time_slots (slot_time) VALUES (?)');
    for (const slot of defaultSlots) {
      await insertStmt.run(slot);
    }
    await insertStmt.finalize();
  }

  return db;
}

module.exports = { initDb };
