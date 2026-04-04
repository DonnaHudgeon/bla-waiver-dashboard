const fetch = require('node-fetch');
const checkAuth = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Dashboard-Pin, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const REZDY_API_KEY = process.env.REZDY_API_KEY;
  if (!REZDY_API_KEY) {
    return res.status(500).json({ error: 'Rezdy API key not configured' });
  }

  try {
    const now = new Date();
    const bonaireNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Curacao' }));
    const year = bonaireNow.getFullYear();
    const month = String(bonaireNow.getMonth() + 1).padStart(2, '0');
    const day = String(bonaireNow.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const startLocal = `${dateStr} 00:00:00`;
    const endLocal = `${dateStr} 23:59:59`;

    const url = `https://api.rezdy.com/v1/bookings?apiKey=${REZDY_API_KEY}&startTimeLocal=${encodeURIComponent(startLocal)}&endTimeLocal=${encodeURIComponent(endLocal)}&status=CONFIRMED&limit=200`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Rezdy API error:', response.status, errorText);
      return res.status(502).json({ error: 'Failed to fetch from Rezdy', detail: response.status });
    }

    const data = await response.json();
    const bookings = data.bookings || [];

    const hourMap = {};

    for (const booking of bookings) {
      if (!booking.items || booking.items.length === 0) continue;

      for (const item of booking.items) {
        const startTime = item.startTimeLocal || item.startTime;
        if (!startTime) continue;

        let hour;
        if (startTime.includes('T')) {
          hour = startTime.substring(11, 13);
        } else {
          hour = startTime.substring(11, 13);
        }

        const bookingDate = startTime.substring(0, 10);
        if (bookingDate !== dateStr) continue;

        const hourKey = `${hour}:00`;

        if (!hourMap[hourKey]) {
          hourMap[hourKey] = {
            id: hourKey,
            displayTime: hourKey,
            hourSort: parseInt(hour),
            bookings: [],
            totalPax: 0,
          };
        }

        const customer = booking.customer || {};
        const totalQuantity = (item.quantities || []).reduce((sum, q) => sum + (q.quantity || 0), 0) || 1;

        hourMap[hourKey].bookings.push({
          orderNumber: booking.orderNumber || '',
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: (customer.email || '').toLowerCase().trim(),
          phone: customer.phone || '',
          pax: totalQuantity,
          productName: item.productName || '',
        });

        hourMap[hourKey].totalPax += totalQuantity;
      }
    }

    const sessions = Object.values(hourMap).sort((a, b) => a.hourSort - b.hourSort);

    sessions.forEach(session => {
      session.orderCount = session.bookings.length;
    });

    return res.status(200).json({
      date: dateStr,
      sessionCount: sessions.length,
      totalPax: sessions.reduce((sum, s) => sum + s.totalPax, 0),
      sessions: sessions,
    });

  } catch (err) {
    console.error('Sessions endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
