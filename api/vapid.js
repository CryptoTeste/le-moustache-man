// GET /api/vapid — the public key phones need to register for notifications.
const { vapidKeys } = require('./_lib');

module.exports = (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({ publicKey: vapidKeys().publicKey });
  } catch (e) {
    res.status(503).json({ error: 'not-configured' });
  }
};
