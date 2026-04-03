const checkAuth = require('./_auth');

// GET /api/sign-url?email=xxx&name=xxx
// Returns the Waiver Forever signing URL with prefilled data

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Dashboard-Pin, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const WF_TEMPLATE_ID = process.env.WAIVERFOREVER_TEMPLATE_ID;
  if (!WF_TEMPLATE_ID) {
    return res.status(500).json({ error: 'Waiver Forever template ID not configured' });
  }

  const { email, name } = req.query;

  // Build the off-site signing URL
  // WaiverForever off-site signing URL format
  const baseUrl = `https://app.waiverforever.com/sign/${WF_TEMPLATE_ID}`;
  const params = new URLSearchParams();
  if (email) params.set('prefill_email', email);
  if (name) params.set('prefill_name', name);

  const signUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

  return res.status(200).json({ url: signUrl });
};
