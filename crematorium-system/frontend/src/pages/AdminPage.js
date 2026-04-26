import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import API from '../api';

export default function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [credentials, setCredentials] = useState({ username: 'admin', password: 'admin123' });
  const [filter, setFilter] = useState('today');
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState({ today: 0, week: 0, month: 0 });
  const [slotTime, setSlotTime] = useState('12:00-13:00');
  const [slots, setSlots] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [attendanceForm, setAttendanceForm] = useState({ staff_name: '', present: true });

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const loadData = async () => {
    const [bookingRes, statsRes, slotsRes, attendanceRes] = await Promise.all([
      API.get('/admin/bookings', { ...authHeaders, params: { filter } }),
      API.get('/admin/stats', authHeaders),
      API.get('/admin/time-slots', authHeaders),
      API.get('/admin/attendance', { ...authHeaders, params: { date: attendanceDate } }),
    ]);
    setBookings(bookingRes.data);
    setStats(statsRes.data);
    setSlots(slotsRes.data);
    setAttendance(attendanceRes.data);
  };

  useEffect(() => {
    if (token) loadData();
  }, [token, filter, attendanceDate]);

  const login = async (e) => {
    e.preventDefault();
    const res = await API.post('/admin/login', credentials);
    localStorage.setItem('adminToken', res.data.token);
    setToken(res.data.token);
  };

  const updateBooking = async (id, payload) => {
    await API.patch(`/admin/bookings/${id}`, payload, authHeaders);
    loadData();
  };

  const exportCsv = async () => {
    const res = await API.get('/admin/bookings/export', { ...authHeaders, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bookings.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const addSlot = async () => {
    await API.post('/admin/time-slots', { slot_time: slotTime }, authHeaders);
    setSlotTime('');
    loadData();
  };

  const removeSlot = async (id) => {
    await API.delete(`/admin/time-slots/${id}`, authHeaders);
    loadData();
  };

  const markAttendance = async (e) => {
    e.preventDefault();
    await API.post('/admin/attendance', { ...attendanceForm, attendance_date: attendanceDate }, authHeaders);
    setAttendanceForm({ staff_name: '', present: true });
    loadData();
  };

  if (!token) {
    return (
      <section className="card narrow">
        <h2>Admin Login</h2>
        <p>Default: admin / admin123</p>
        <form onSubmit={login} className="stack">
          <input value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} required />
          <input type="password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} required />
          <button type="submit">Login</button>
        </form>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="grid three-col">
        <div className="card"><h3>Today</h3><p>{stats.today}</p></div>
        <div className="card"><h3>This Week</h3><p>{stats.week}</p></div>
        <div className="card"><h3>This Month</h3><p>{stats.month}</p></div>
      </section>

      <section className="card">
        <div className="inline between">
          <h2>Bookings</h2>
          <div className="inline">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All</option>
            </select>
            <button type="button" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Date</th><th>Slot</th><th>Status</th><th>Usage</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{b.booking_id}</td>
                <td>{b.name}</td>
                <td>{b.booking_date}</td>
                <td>{b.slot_time}</td>
                <td>{b.status}</td>
                <td>
                  <div className="inline">
                    <select defaultValue={b.usage_type || 'wood'} id={`usage-type-${b.id}`}>
                      <option value="wood">Wood</option>
                      <option value="gas">Gas</option>
                    </select>
                    <input type="number" step="0.1" placeholder="Qty" id={`usage-amount-${b.id}`} defaultValue={b.usage_amount || ''} />
                  </div>
                </td>
                <td>
                  <div className="stack">
                    <button type="button" onClick={() => updateBooking(b.id, { status: 'approved' })}>Approve</button>
                    <button type="button" onClick={() => updateBooking(b.id, { status: 'rejected' })}>Reject</button>
                    <button type="button" onClick={() => updateBooking(b.id, { status: 'completed' })}>Complete</button>
                    <button
                      type="button"
                      onClick={() => {
                        const usageType = document.getElementById(`usage-type-${b.id}`).value;
                        const usageAmount = Number(document.getElementById(`usage-amount-${b.id}`).value || 0);
                        updateBooking(b.id, { usage_type: usageType, usage_amount: usageAmount });
                      }}
                    >
                      Save Usage
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid two-col">
        <div className="card">
          <h2>Time Slot Management</h2>
          <div className="inline">
            <input value={slotTime} onChange={(e) => setSlotTime(e.target.value)} placeholder="HH:MM-HH:MM" />
            <button type="button" onClick={addSlot}>Add Slot</button>
          </div>
          <ul>
            {slots.map((s) => (
              <li key={s.id}>
                {s.slot_time}
                <button type="button" onClick={() => removeSlot(s.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Staff Attendance</h2>
          <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
          <form className="inline" onSubmit={markAttendance}>
            <input placeholder="Staff Name" value={attendanceForm.staff_name} onChange={(e) => setAttendanceForm({ ...attendanceForm, staff_name: e.target.value })} required />
            <select value={attendanceForm.present ? 'present' : 'absent'} onChange={(e) => setAttendanceForm({ ...attendanceForm, present: e.target.value === 'present' })}>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
            <button type="submit">Mark</button>
          </form>
          <ul>
            {attendance.map((a) => (
              <li key={a.id}>{a.staff_name}: {a.present ? 'Present' : 'Absent'}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
