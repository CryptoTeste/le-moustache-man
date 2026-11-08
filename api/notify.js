// POST /api/notify  { event, k?, id? }  with header  Authorization: Bearer <Firebase ID token>
// Checks who is asking, builds the message from the database, and sends it to the other members' phones.
const { admin, init, buildMessage, sendToAll } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  try { init(); } catch (e) { return res.status(503).json({ error: 'not-configured' }); }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let uid;
  try { uid = (await admin.auth().verifyIdToken(token)).uid; } catch (e) { return res.status(401).json({ error: 'auth' }); }

  const db = admin.firestore();
  const sess = await db.doc('sessions/' + uid).get();
  if (!sess.exists) return res.status(403).json({ error: 'not-member' });
  const member = sess.data().member;
  const st = (await db.doc('app/state').get()).data() || {};
  const me = st.people && st.people[member];
  if (!me) return res.status(403).json({ error: 'not-member' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const msg = buildMessage(String(body.event || ''), st, member, { k: body.k, id: body.id });
  if (!msg) return res.status(400).json({ error: 'event' });
  if (msg.committee && !me.committee) return res.status(403).json({ error: 'committee-only' });

  // Avoid a burst of identical alerts (e.g. several photos in a row)
  if (msg.throttleMin) {
    const ref = db.doc('pushmeta/' + msg.payload.tag + '-' + member);
    const last = await ref.get();
    if (last.exists && Date.now() - last.data().at < msg.throttleMin * 60000) return res.json({ sent: 0, throttled: true });
    await ref.set({ at: Date.now() });
  }

  const sent = await sendToAll(db, msg.payload, msg.self ? { onlySelf: member } : { exclude: member, only: msg.only });
  res.json({ sent });
};
