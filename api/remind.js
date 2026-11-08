// Runs once a day (see vercel.json). Three days and one day before the reply deadline,
// it reminds members who haven't replied yet. Each reminder is sent only once.
const { admin, init, sendToAll, shortDate } = require('./_lib');

module.exports = async (req, res) => {
  try { init(); } catch (e) { return res.status(503).json({ error: 'not-configured' }); }
  const db = admin.firestore();
  const st = (await db.doc('app/state').get()).data();
  if (!st || !st.edition || st.edition.phase !== 'convocatoria' || !st.edition.deadline) return res.json({ skipped: 'no-invitation' });

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = st.edition.deadline.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
  if (days !== 3 && days !== 1) return res.json({ skipped: 'not-a-reminder-day', days });

  const key = st.edition.year + '-' + days;
  const meta = db.doc('pushmeta/remind');
  const last = await meta.get();
  if (last.exists && last.data().key === key) return res.json({ skipped: 'already-sent' });
  await meta.set({ key, at: Date.now() });

  const rsvp = st.rsvp || {};
  const silent = Object.keys(st.people || {}).filter(id => {
    const p = st.people[id];
    return (p.role === 'membro' || p.role === 'mascote') && !(rsvp[id] && rsvp[id].s);
  });
  if (!silent.length) return res.json({ sent: 0 });
  const sent = await sendToAll(db, {
    title: days === 1 ? 'Último dia para responder' : 'Ainda não respondeu à convocatória',
    body: `O prazo termina a ${shortDate(st.edition.deadline)}. O silêncio não é um bigode.`,
    url: '#jantar', tag: 'remind'
  }, { only: silent });
  res.json({ sent, days });
};
