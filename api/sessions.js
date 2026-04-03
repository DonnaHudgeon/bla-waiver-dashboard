const fetch = require('node-fetch');
const checkAuth = require('./_auth');

// GET /api/sessions
// Returns today's sessions from Rezdy with booking counts

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Dashboard-Pin, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const REZDY_API_KEY = process.env.REZDY_API_KEY;
  if (!REZDY_API_KEY) {
    return res.status(500).json({ error: 'Rezdy API key not configured' });
  }

  try {
    // Get today's date range in local Bonaire time (UTC-4, AST)
    const now = new Date();
    const bonaireOffset = -4 * 60; // UTC-4 in minutes
    const localNow = new Date(now.getTime() + (bonaireOffset + now.getTimezoneOffset()) * 60000);
    const dateStr = localNow.toISOString().split('T')[0];

    const startLocal = `${dateStr} 00:00:00`;
    const endLocal = `${dateStr} 23:59:59`;

    // Fetch bookings for today from Rezdy
    const url = `https://api.rezdy.com/v1/bookings?apiKey=${REZDY_API_KEY}&startTimeLocal=${encodeURIComponent(startLocal)}&endTimeLocal=${encodeURIComponent(endLocal)}&status=CONFIRMED&limit=200`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Rezdy API error:', response.status, errorText);
      return res.status(502).json({ error: 'Failed to fetch from Rezdy', detail: response.status });
    }

    const data = await response.json();
    const bookings = data.bookings || [];

    // Group bookings by session time
    const sessionMap = {};

    for (const booking of bookings) {
      if (!booking.items || booking.items.length === 0) continue;

      for (const item of booking.items) {
        const startTime = item.startTimeLocal || item.startTime;
        if (!startTime) continue;

        const sessionKey = startTime;
        if (!sessionMap[sessionKey]) {
          sessionMap[sessionKey] = {
            id: sessionKey,
            startTime: startTime,
            productName: item.productName || 'Landsailing Excursion',
            bookings: [],
            totalPax: 0,
          };
        }

        // Extract guest info
        const customer = booking.customer || {};
        const totalQuantity = (item.quantities || []).reduce((sum, q) => sum + (q.quantity || 0), 0) || 1;

        // Determine source/agent
        let source = 'Direct / Online';
        if (booking.resellerName) {
          source = booking.resellerName;
        } else if (booking.source) {
          source = booking.source;
        }

        sessionMap[sessionKey].bookings.push({
          orderNumber: booking.orderNumber,
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: (customer.email || '').toLowerCase().trim(),
          phone: customer.phone || '',
          pax: totalQuantity,
          source: source,
        });

        sessionMap[sessionKey].totalPax += totalQuantity;
      }
    }

    // Convert to array sorted by time
    const sessions = Object.values(sessionMap).sort((a, b) =>
      new Date(a.startTime) - new Date(b.startTime)
    );

    // Format times for display
    sessions.forEach(session => {
      const d = new Date(session.startTime);
      // Format as HH:MM
      const hours = d.getHours ? d.getHours() : parseInt(session.startTime.substring(11, 13));
      const mins = session.startTime.substring(14, 16);
      session.displayTime = `${String(hours).padStart(2, '0')}:${mins}`;

      // Determine primary source for the session
      const sourceCounts = {};
      session.bookings.forEach(b => {
        sourceCounts[b.source] = (sourceCounts[b.source] || 0) + b.pax;
      });
      const topSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0];
      session.primarySource = topSource ? topSource[0] : 'Mixed';
    });

    return res.status(200).json({
      date: dateStr,
      sessionCount: sessions.length,
      sessions: sessions,
    });

  } catch (err) {
    console.error('Sessions endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
