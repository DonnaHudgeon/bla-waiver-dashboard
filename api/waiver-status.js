const fetch = require('node-fetch');
const checkAuth = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Dashboard-Pin, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const WF_API_KEY = process.env.WAIVERFOREVER_API_KEY;
  const WF_TEMPLATE_ID = process.env.WAIVERFOREVER_TEMPLATE_ID;

  if (!WF_API_KEY || !WF_TEMPLATE_ID) {
    return res.status(500).json({ error: 'Waiver Forever credentials not configured' });
  }

  try {
    const { orderNumbers } = req.body;
    if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return res.status(400).json({ error: 'orderNumbers array is required' });
    }

    const results = {};
    const batchSize = 5;

    for (let i = 0; i < orderNumbers.length; i += batchSize) {
      const batch = orderNumbers.slice(i, i + batchSize);

      const promises = batch.map(async (orderNumber) => {
        try {
          const searchUrl = `https://api.waiverforever.com/openapi/v2/waiverRequests?template_id=${WF_TEMPLATE_ID}&name=${encodeURIComponent(orderNumber)}&per_page=5&page=1`;

          const searchResponse = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'X-Api-Key': WF_API_KEY,
            },
          });

          if (!searchResponse.ok) {
            console.error('WF search error for ' + orderNumber + ':', searchResponse.status);
            results[orderNumber] = { found: false, size: 0, signed: 0 };
            return;
          }

          const searchData = await searchResponse.json();
          const requests = searchData.waiver_requests || [];

          const match = requests.find(r => {
            const name = (r.name || '').toUpperCase();
            return name.startsWith(orderNumber.toUpperCase());
          });

          if (match) {
            results[orderNumber] = {
              found: true,
              size: match.size || 0,
              signed: match.accepted_count || 0,
              submitted: match.submitted_count || 0,
              status: match.status || '',
              requestLink: match.request_link || '',
            };
          } else {
            results[orderNumber] = { found: false, size: 0, signed: 0 };
          }

        } catch (err) {
          console.error('WF search error for ' + orderNumber + ':', err.message);
          results[orderNumber] = { found: false, size: 0, signed: 0, error: true };
        }
      });

      await Promise.all(promises);
    }

    return res.status(200).json({
      results: results,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Waiver status endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
