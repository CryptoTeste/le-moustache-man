// Shared helpers for the notification service (files starting with "_" are not public endpoints on Vercel).
// Only one secret is configured: FIREBASE_SERVICE_ACCOUNT (the JSON key Firebase generates).
// The push keys (VAPID) are derived from it, so no other secret has to be created or copied anywhere.
const crypto = require('crypto');
const admin = require('firebase-admin');
const webpush = require('web-push');

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set in Vercel');
  return JSON.parse(raw);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A stable P-256 key pair for Web Push, derived from the service account's private key.
function vapidKeys() {
  const sa = serviceAccount();
  let seed = crypto.createHash('sha256').update('le-moustache-man/vapid/' + sa.private_key).digest();
  const ecdh = crypto.createECDH('prime256v1');
  // A valid private key is any value between 1 and the curve order; re-hash in the astronomically rare other case.
  for (let i = 0; i < 5; i++) {
    try { ecdh.setPrivateKey(seed); break; } catch (e) { seed = crypto.createHash('sha256').update(seed).digest(); }
  }
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(seed) };
}

let ready = false;
function init() {
  if (ready) return;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  const k = vapidKeys();
  webpush.setVapidDetails('mailto:irmandade@le-moustache-man.app', k.publicKey, k.privateKey);
  ready = true;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + MONTHS[m - 1];
}
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s || '');

// What each event says. The text is built here from the database, never taken from the phone that asked.
// committee: only Committee members may trigger it. only: send just to these members.
function buildMessage(event, st, actorId, extra) {
  const actor = st.people[actorId] || {};
  const e = st.edition || {};
  const name = id => (st.people[id] && st.people[id].name) || '';
  switch (event) {
    case 'notice': {
      const n = st.notes && st.notes[extra.id];
      if (!n) return null;
      return { committee: true, payload: { title: 'Aviso da Comissão', body: trunc(n.text, 140), url: '#jantar', tag: 'notice-' + extra.id } };
    }
    case 'noticefile': {
      const f = extra.file;
      if (!f || f.kind === 'group') return null;
      return { committee: true, payload: { title: 'Aviso da Comissão', body: trunc(f.caption || ('Novo ficheiro: ' + f.name), 140), url: '#jantar', tag: 'notice-' + extra.id } };
    }
    case 'comment': {
      // Tell whoever posted the notice, the Committee, and the others in the conversation. Not everyone.
      const c = extra.comment, n = extra.notice;
      if (!c || !n || c.by !== actorId) return null;
      const committee = Object.keys(st.people || {}).filter(id => st.people[id].committee);
      const only = [...new Set([n.by].concat(committee, extra.thread || []))].filter(id => id && id !== actorId);
      return { only, throttleMin: 2, payload: { title: (actor.name || 'Um membro') + ' comentou um aviso', body: trunc(c.text, 140), url: '#jantar', tag: 'comment-' + c.target } };
    }
    case 'details':
      return { committee: true, payload: { title: 'O jantar foi atualizado', body: [shortDate(e.date) + (e.time ? ', ' + e.time.replace(':', 'h') : ''), e.place].filter(Boolean).join(' · '), url: '#jantar', tag: 'details' } };
    case 'night':
      return { committee: true, payload: { title: 'A noite do jantar começou', body: 'O registo de membros está aberto. Bom jantar!', url: '#jantar', tag: 'night' } };
    case 'open': {
      const k = extra.k === 'mascote' ? 'mascote' : 'bigode';
      const present = Object.keys(st.present || {}).filter(id => st.present[id]);
      return { committee: true, only: present, payload: { title: 'A urna está aberta', body: k === 'bigode' ? 'Vote no Melhor Bigode do Ano.' : 'Vote na nova Mascote do Bigode.', url: '#votar', tag: 'open-' + k } };
    }
    case 'reveal': {
      const k = extra.k === 'mascote' ? 'mascote' : 'bigode';
      return { committee: true, payload: { title: k === 'bigode' ? 'Melhor Bigode: a urna foi selada' : 'Mascote: a urna foi selada', body: 'Abra a app para ver quem venceu.', url: '#votar', tag: 'reveal-' + k } };
    }
    case 'closed':
      return { committee: true, payload: { title: 'Edição encerrada', body: 'O Livro de honra foi atualizado. Até ao próximo jantar!', url: '#galeria', tag: 'closed' } };
    case 'nominate': {
      const p = st.people[extra.id];
      if (!p || p.nominatedBy !== actorId) return null;
      return { committee: false, payload: { title: 'Nova proposta de Mascote', body: `${actor.name} propôs ${p.name}` + (p.note ? ` («${trunc(p.note, 60)}»)` : '') + '.', url: '#votar', tag: 'nominate-' + extra.id } };
    }
    case 'photos':
      return { committee: false, throttleMin: 20, payload: { title: 'Novas fotografias no álbum', body: `${actor.name} partilhou fotografias da noite.`, url: '#jantar', tag: 'photos' } };
    case 'test':
      return { committee: false, self: true, payload: { title: 'Le Moustache Man', body: 'As notificações estão a funcionar neste telemóvel.', url: '#jantar', tag: 'test' } };
    default:
      return null;
  }
}

// Send to every registered phone (except the person who triggered it, unless it's a test).
async function sendToAll(db, payload, { exclude, only, onlySelf } = {}) {
  const subs = await db.collection('push').get();
  let sent = 0;
  await Promise.all(subs.docs.map(async d => {
    const v = d.data();
    if (onlySelf ? v.member !== onlySelf : v.member === exclude) return;
    if (only && !only.includes(v.member)) return;
    try {
      await webpush.sendNotification(v.sub, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (err) {
      // The phone unsubscribed or reinstalled the app: forget it.
      if (err.statusCode === 404 || err.statusCode === 410) await d.ref.delete().catch(() => {});
    }
  }));
  return sent;
}

module.exports = { admin, init, vapidKeys, buildMessage, sendToAll, shortDate };
