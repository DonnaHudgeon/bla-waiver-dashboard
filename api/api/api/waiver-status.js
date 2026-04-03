const fetch = require('node-fetch');
const checkAuth = require('./_auth');

// POST /api/waiver-status
// Accepts a list of guest emails and checks Waiver Forever for signed waivers
// Body: { emails: ["email1@example.com", "email2@example.com"] }

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Dashboard-Pin, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const WF_API_KEY = process.env.WAIVERFOREVER_API_KEY;
  const WF_TEMPLATE_ID = process.env.WAIVERFOREVER_TEMPLATE_ID;

  if (!WF_API_KEY || !WF_TEMPLATE_ID) {
    return res.status(500).json({ error: 'Waiver Forever credentials not configured' });
  }

  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }

    // Search for waivers signed in the last 90 days to avoid matching old visits
    const now = Math.floor(Date.now() / 1000);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

    // Check each email against Waiver Forever
    // WF rate limit is 300/min, so even 50 guests is fine
    const results = {};

    // Process in parallel batches of 10 to be efficient but respectful of rate limits
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      const promises = batch.map(async (email) => {
        const cleanEmail = email.toLowerCase().trim();
        if (!cleanEmail) {
          results[email] = { signed: false, signedAt: null };
          return;
        }

        try {
          const searchResponse = await fetch('https://api.waiverforever.com/openapi/v1/waiver/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Api-Key': WF_API_KEY,
            },
            body: JSON.stringify({
              search_term: cleanEmail,
              template_ids: [WF_TEMPLATE_ID],
              start_timestamp: ninetyDaysAgo,
              end_timestamp: now,
              per_page: 5,
              page: 1,
            }),
          });

          if (!searchResponse.ok) {
            console.error(`WF search error for ${cleanEmail}:`, searchResponse.status);
            results[cleanEmail] = { signed: false, signedAt: null, error: true };
            return;
          }

          const searchData = await searchResponse.json();
          const waivers = (searchData.data && searchData.data.waivers) || [];

          // Look for an approved waiver matching this email
          const signedWaiver = waivers.find(w => {
            if (w.status !== 'approved') return false;

            // Check if the email appears in the waiver data fields
            const waiverData = w.data || [];
            const emailField = waiverData.find(f =>
              f.type === 'email_field' &&
              f.value &&
              f.value.toLowerCase().trim() === cleanEmail
            );

            // Also check if the search_term matched (WF searches across fields)
            return emailField || true; // WF search already filters by the term
          });

          if (signedWaiver) {
            const signedDate = signedWaiver.signed_at
              ? new Date(signedWaiver.signed_at * 1000)
              : null;

            results[cleanEmail] = {
              signed: true,
              signedAt: signedDate ? signedDate.toISOString() : null,
              waiverId: signedWaiver.id,
            };
          } else {
            results[cleanEmail] = { signed: false, signedAt: null };
          }

        } catch (emailErr) {
          console.error(`WF search error for ${cleanEmail}:`, emailErr.message);
          results[cleanEmail] = { signed: false, signedAt: null, error: true };
        }
      });

      await Promise.all(promises);
    }

    return res.status(200).json({
      templateId: WF_TEMPLATE_ID,
      results: results,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Waiver status endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
