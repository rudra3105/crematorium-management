import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import API from '../api';

export default function PublicPage() {
  const [form, setForm] = useState({ name: '', booking_date: dayjs().format('YYYY-MM-DD'), slot_time: '', contact_number: '', address: '' });
  const [slots, setSlots] = useState([]);
  const [calendarData, setCalendarData] = useState([]);
  const [bookingResult, setBookingResult] = useState(null);
  const [statusId, setStatusId] = useState('');
  const [statusResult, setStatusResult] = useState(null);

  const currentMonth = useMemo(() => dayjs(form.booking_date).format('YYYY-MM'), [form.booking_date]);

  const loadAvailableSlots = async (date) => {
    const res = await API.get('/public/slots', { params: { date } });
    setSlots(res.data);
  };

  const loadCalendar = async (month) => {
    const res = await API.get('/public/calendar', { params: { month } });
    setCalendarData(res.data);
  };

  useEffect(() => {
    loadAvailableSlots(form.booking_date);
    loadCalendar(currentMonth);
  }, [form.booking_date, currentMonth]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const res = await API.post('/public/bookings', form);
    setBookingResult(res.data);
    setForm((prev) => ({ ...prev, slot_time: '' }));
    loadAvailableSlots(form.booking_date);
    loadCalendar(currentMonth);
  };

  const checkStatus = async () => {
    const res = await API.get(`/public/bookings/${statusId}`);
    setStatusResult(res.data);
  };

  return (
    <div className="grid two-col">
      <section className="card">
        <h2>Book Crematorium Slot</h2>
        <form onSubmit={onSubmit} className="stack">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input type="date" value={form.booking_date} onChange={(e) => setForm({ ...form, booking_date: e.target.value })} required />
          <select value={form.slot_time} onChange={(e) => setForm({ ...form, slot_time: e.target.value })} required>
            <option value="">Select available time slot</option>
            {slots.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
          <input placeholder="Contact Number" value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} required />
          <textarea placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          <button type="submit">Confirm Booking</button>
        </form>

        {bookingResult && (
          <div className="success">
            <h3>Booking Confirmed</h3>
            <p>Booking ID: <strong>{bookingResult.booking_id}</strong></p>
            <p>Status: {bookingResult.status}</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Available Slots Calendar ({currentMonth})</h2>
        <div className="calendar">
          {calendarData.map((day) => (
            <button type="button" key={day.date} onClick={() => setForm({ ...form, booking_date: day.date })}>
              <strong>{dayjs(day.date).date()}</strong>
              <span>{day.available}/{day.total} free</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card full-width">
        <h2>Check Booking Status</h2>
        <div className="inline">
          <input placeholder="Enter booking ID (e.g., CRM-2024-0001)" value={statusId} onChange={(e) => setStatusId(e.target.value)} />
          <button type="button" onClick={checkStatus}>Check</button>
        </div>
        {statusResult && (
          <table>
            <tbody>
              <tr><th>Booking ID</th><td>{statusResult.booking_id}</td></tr>
              <tr><th>Name</th><td>{statusResult.name}</td></tr>
              <tr><th>Date</th><td>{statusResult.booking_date}</td></tr>
              <tr><th>Slot</th><td>{statusResult.slot_time}</td></tr>
              <tr><th>Status</th><td>{statusResult.status}</td></tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
