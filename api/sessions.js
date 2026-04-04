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

      const customer = booking.customer || {};

      // Build display name - skip bookings with no customer name (cruise ship groups)
      let displayName = '';
      if (customer.firstName || customer.lastName) {
        displayName = ((customer.firstName || '') + ' ' + (customer.lastName || '')).trim();
      } else if (customer.name) {
        displayName = customer.name.trim();
      }
      if (!displayName || displayName.toLowerCase() === 'cruise ship') continue;

      for (const item of booking.items) {
        const startTime = item.startTimeLocal || item.startTime;
        if (!startTime) continue;

        const hour = startTime.substring(11, 13);
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

        // Calculate pax from quantities
        let pax = 0;
        if (item.quantities && item.quantities.length > 0) {
          for (const q of item.quantities) {
            pax += (q.quantity || 0);
          }
        }
        if (pax === 0) pax = 1;

        // Double kart = 2 people per kart
        const productName = (item.productName || '').toLowerCase();
        if (productName.includes('double')) {
          pax = pax * 2;
        }

        hourMap[hourKey].bookings.push({
          orderNumber: booking.orderNumber || '',
          displayName: displayName,
          pax: pax,
          productName: item.productName || '',
        });

        hourMap[hourKey].totalPax += pax;
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
