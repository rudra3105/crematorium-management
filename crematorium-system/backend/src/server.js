require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const dayjs = require('dayjs');
const { initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'crematorium-admin-token';
const DB_FILE = process.env.DB_FILE || './database.sqlite';

let db;

const activeBookingStatuses = ['pending', 'approved', 'completed'];

function isAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

async function generateBookingId() {
  const row = await db.get('SELECT id FROM bookings ORDER BY id DESC LIMIT 1');
  const next = (row?.id || 0) + 1;
  return `CRM-2024-${String(next).padStart(4, '0')}`;
}

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN, username: ADMIN_USERNAME });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/public/time-slots', async (_req, res) => {
  const slots = await db.all('SELECT * FROM time_slots ORDER BY slot_time');
  res.json(slots);
});

app.get('/api/public/slots', async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const slots = await db.all('SELECT slot_time FROM time_slots ORDER BY slot_time');
  const bookedRows = await db.all(
    `SELECT slot_time FROM bookings WHERE booking_date = ? AND status IN (${activeBookingStatuses.map(() => '?').join(',')})`,
    [date, ...activeBookingStatuses]
  );
  const bookedSet = new Set(bookedRows.map((r) => r.slot_time));
  res.json(slots.filter((s) => !bookedSet.has(s.slot_time)).map((s) => s.slot_time));
});

app.get('/api/public/calendar', async (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'month is required in YYYY-MM format' });

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  const start = dayjs(`${year}-${String(monthNum).padStart(2, '0')}-01`);
  const end = start.endOf('month');
  const totalSlots = await db.get('SELECT COUNT(*) as count FROM time_slots');

  const bookings = await db.all(
    `SELECT booking_date, COUNT(*) as booked
     FROM bookings
     WHERE booking_date BETWEEN ? AND ?
       AND status IN (${activeBookingStatuses.map(() => '?').join(',')})
     GROUP BY booking_date`,
    [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'), ...activeBookingStatuses]
  );

  const bookedMap = Object.fromEntries(bookings.map((b) => [b.booking_date, b.booked]));
  const days = [];
  for (let d = 1; d <= end.date(); d += 1) {
    const date = start.date(d).format('YYYY-MM-DD');
    const booked = bookedMap[date] || 0;
    days.push({ date, available: Math.max(0, totalSlots.count - booked), total: totalSlots.count });
  }
  res.json(days);
});

app.post('/api/public/bookings', async (req, res) => {
  const { name, booking_date: bookingDate, slot_time: slotTime, contact_number: contactNumber, address } = req.body;
  if (!name || !bookingDate || !slotTime || !contactNumber || !address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const exists = await db.get(
    `SELECT id FROM bookings WHERE booking_date = ? AND slot_time = ? AND status IN (${activeBookingStatuses.map(() => '?').join(',')})`,
    [bookingDate, slotTime, ...activeBookingStatuses]
  );
  if (exists) return res.status(409).json({ error: 'Slot not available' });

  const bookingId = await generateBookingId();
  await db.run(
    `INSERT INTO bookings (booking_id, name, booking_date, slot_time, contact_number, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bookingId, name, bookingDate, slotTime, contactNumber, address]
  );

  return res.status(201).json({ booking_id: bookingId, status: 'pending' });
});

app.get('/api/public/bookings/:bookingId', async (req, res) => {
  const booking = await db.get('SELECT * FROM bookings WHERE booking_id = ?', req.params.bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  return res.json(booking);
});

app.get('/api/admin/bookings', isAdmin, async (req, res) => {
  const filter = req.query.filter || 'all';
  const today = dayjs().format('YYYY-MM-DD');
  let where = '';
  const params = [];

  if (filter === 'today') {
    where = 'WHERE booking_date = ?';
    params.push(today);
  } else if (filter === 'upcoming') {
    where = 'WHERE booking_date > ?';
    params.push(today);
  } else if (filter === 'past') {
    where = 'WHERE booking_date < ?';
    params.push(today);
  }

  const rows = await db.all(`SELECT * FROM bookings ${where} ORDER BY booking_date DESC, slot_time DESC`, params);
  res.json(rows);
});

app.patch('/api/admin/bookings/:id', isAdmin, async (req, res) => {
  const { status, usage_type: usageType, usage_amount: usageAmount } = req.body;
  const current = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!current) return res.status(404).json({ error: 'Booking not found' });

  await db.run(
    `UPDATE bookings
     SET status = COALESCE(?, status),
         usage_type = COALESCE(?, usage_type),
         usage_amount = COALESCE(?, usage_amount)
     WHERE id = ?`,
    [status || null, usageType || null, usageAmount ?? null, req.params.id]
  );

  const updated = await db.get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  res.json(updated);
});

app.get('/api/admin/stats', isAdmin, async (_req, res) => {
  const todayStart = dayjs().startOf('day').format('YYYY-MM-DD');
  const weekStart = dayjs().startOf('week').format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

  const [today, week, month] = await Promise.all([
    db.get('SELECT COUNT(*) as count FROM bookings WHERE booking_date = ?', todayStart),
    db.get('SELECT COUNT(*) as count FROM bookings WHERE booking_date BETWEEN ? AND ?', [weekStart, dayjs().format('YYYY-MM-DD')]),
    db.get('SELECT COUNT(*) as count FROM bookings WHERE booking_date BETWEEN ? AND ?', [monthStart, dayjs().format('YYYY-MM-DD')]),
  ]);

  res.json({ today: today.count, week: week.count, month: month.count });
});

app.get('/api/admin/time-slots', isAdmin, async (_req, res) => {
  const slots = await db.all('SELECT * FROM time_slots ORDER BY slot_time');
  res.json(slots);
});

app.post('/api/admin/time-slots', isAdmin, async (req, res) => {
  const { slot_time: slotTime } = req.body;
  if (!slotTime) return res.status(400).json({ error: 'slot_time is required' });
  try {
    await db.run('INSERT INTO time_slots (slot_time) VALUES (?)', slotTime);
    return res.status(201).json({ message: 'Added' });
  } catch {
    return res.status(409).json({ error: 'Slot already exists' });
  }
});

app.delete('/api/admin/time-slots/:id', isAdmin, async (req, res) => {
  await db.run('DELETE FROM time_slots WHERE id = ?', req.params.id);
  res.json({ message: 'Deleted' });
});

app.get('/api/admin/attendance', isAdmin, async (req, res) => {
  const date = req.query.date || dayjs().format('YYYY-MM-DD');
  const rows = await db.all('SELECT * FROM staff_attendance WHERE attendance_date = ? ORDER BY staff_name', date);
  res.json(rows);
});

app.post('/api/admin/attendance', isAdmin, async (req, res) => {
  const { attendance_date: attendanceDate, staff_name: staffName, present } = req.body;
  if (!attendanceDate || !staffName || typeof present !== 'boolean') {
    return res.status(400).json({ error: 'attendance_date, staff_name and present are required' });
  }

  await db.run(
    `INSERT INTO staff_attendance (attendance_date, staff_name, present)
     VALUES (?, ?, ?)
     ON CONFLICT(attendance_date, staff_name)
     DO UPDATE SET present = excluded.present, marked_at = CURRENT_TIMESTAMP`,
    [attendanceDate, staffName, present ? 1 : 0]
  );

  res.status(201).json({ message: 'Attendance marked' });
});

app.get('/api/admin/bookings/export', isAdmin, async (_req, res) => {
  const rows = await db.all('SELECT * FROM bookings ORDER BY booking_date DESC, slot_time DESC');
  const headers = [
    'id', 'booking_id', 'name', 'booking_date', 'slot_time', 'contact_number', 'address',
    'status', 'usage_type', 'usage_amount', 'created_at',
  ];

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/"/g, '""');
    return /[",\n]/.test(str) ? `"${str}"` : str;
  };

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
  res.send(csv);
});

(async () => {
  db = await initDb(DB_FILE);
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
})();
