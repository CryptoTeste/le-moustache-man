# Le Moustache Man

The app for the Irmandade do Bigode: the dinner invitation and replies, the Mascot and Best Moustache votes with their reveal ceremony, the photo album, the gallery and book of honour, the rules, member profiles, and the Committee's tools.

It is a single web page (`index.html`). Members open their personal link and add it to the home screen, so no app store is involved.

## Two modes

- **Test mode**: while `firebase-config.js` contains `null`, all data stays on the phone it's opened on, and you can pick any member to try things out.
- **Online**: once `firebase-config.js` holds the Firebase settings, everyone shares the same data in real time, and each member signs in with a personal link.

## Going online (one time)

1. **Firebase**: create the project in [console.firebase.google.com](https://console.firebase.google.com), on the free plan.
   - Build → **Authentication** → Get started → Sign-in method → **Anonymous** → Enable.
   - Build → **Firestore Database** → Create database → location `europe-west` → start in **production mode**.
   - Firestore → **Rules**: paste all of `firestore.rules` and click **Publish**.
   - Project settings → Your apps → **Web** (`</>`): register the app and copy the `firebaseConfig` values into `firebase-config.js`.
2. **Vercel**: sign in with GitHub at [vercel.com](https://vercel.com), choose **Add New → Project**, import `le-moustache-man`, and click **Deploy**. Leave all the settings as they are.
3. Open the Vercel address. The first time, the app shows **"Fundar a Irmandade"** (found the brotherhood). Whoever fills it in becomes the administrator.
4. In **Comissão → Pessoas**, tap **Link** next to each member to copy a ready-made WhatsApp message with their personal link.

## How the data is kept

| Where | What |
|---|---|
| `app/state` | members, replies, votes, history, the current edition |
| `media/*` | album photos (compressed, about 1400 px) |
| `photos/*` | profile photos (400 px) |
| `files/*` | Committee documents (up to 650 KB) |
| `keys/*` | personal links |
| `sessions/*` | which member each phone belongs to |

Everything stays on Firebase's free plan (Spark), so no credit card is needed. Videos are switched off online because they don't fit the free database. Turning on Cloud Storage would require the paid Blaze plan.

## Permissions (enforced by `firestore.rules`)

- **Members** can reply to the invitation (but not approve their own excuse), vote once while a ballot is open and they're marked present, propose and withdraw mascots, post photos and give *bigodaços* (likes), and change their own photo.
- **The Committee** can do everything else: dinner details, attendance, opening and sealing ballots, notices and documents, members and links, and closing an edition.
- **The administrator** (the founder) is the only one who decides who is on the Committee.
