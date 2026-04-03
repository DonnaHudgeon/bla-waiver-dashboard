// Simple PIN-based access control for the dashboard
// PIN is stored as an environment variable, never in code

module.exports = function checkAuth(req) {
  const pin = req.headers['x-dashboard-pin'];
  const validPin = process.env.DASHBOARD_PIN;

  if (!validPin) {
    // If no PIN is configured, allow access (development mode)
    return true;
  }

  return pin === validPin;
};
