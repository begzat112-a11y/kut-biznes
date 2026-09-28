/* =========================================================
   КУТ: БИЗНЕС — Cloud Functions v1.1
   Бот: @NexusBizIDBot
   
   • telegramAuth — HTTPS-функция для входа через Telegram
     - Проверяет HMAC-SHA256 подпись виджета
     - Создаёт Firebase-пользователя + бизнес при первом входе
     - Возвращает custom token для signInWithCustomToken
   • health — проверка живости
   
   ⚠️ Токен НЕ хранится в коде — только в Firebase Config!
   ========================================================= */

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const crypto    = require('crypto');

admin.initializeApp();
const db = admin.firestore();

/* ---------------------------------------------------------
   Получение токена бота
   Приоритет: env → functions.config → пусто
   --------------------------------------------------------- */
function getBotToken() {
  const fromEnv = process.env.TELEGRAM_BOT_TOKEN;
  if (fromEnv && fromEnv.length > 20) return fromEnv;

  const fromCfg =
    functions.config() &&
    functions.config().telegram &&
    functions.config().telegram.bot_token;

  if (fromCfg && fromCfg.length > 20) return fromCfg;

  return '';
}

/* ---------------------------------------------------------
   Проверка HMAC-подписи виджета Telegram
   https://core.telegram.org/widgets/login#checking-authorization
   --------------------------------------------------------- */
function verifyTelegramHash(data, botToken) {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(hash, 'hex')
    );
  } catch (_) {
    return false;
  }
}

/* ---------------------------------------------------------
   HTTPS: telegramAuth
   POST body: { id, first_name, last_name?, username?, photo_url?,
                auth_date, hash }
   --------------------------------------------------------- */
exports.telegramAuth = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const data = req.body || {};
    if (!data.hash || !data.id || !data.auth_date) {
      return res.status(400).json({ error: 'bad_request' });
    }

    const botToken = getBotToken();
    if (!botToken) {
      console.error('[telegramAuth] BOT_TOKEN не задан');
      return res.status(500).json({ error: 'server_misconfigured' });
    }

    if (!verifyTelegramHash(data, botToken)) {
      console.warn('[telegramAuth] invalid_hash от', data.id);
      return res.status(401).json({ error: 'invalid_hash' });
    }

    const now = Math.floor(Date.now() / 1000);
    const authTs = Number(data.auth_date) || 0;
    if (now - authTs > 86400) {
      return res.status(401).json({ error: 'expired' });
    }

    const telegramId = String(data.id);
    const displayName =
      [data.first_name, data.last_name].filter(Boolean).join(' ') ||
      data.username ||
      'Пользователь Telegram';
    const username = data.username || '';
    const photoURL = data.photo_url || '';

    let uid;
    let isNewUser = false;

    try {
      const linkRef = db.collection('telegram_link').doc(telegramId);
      const linkSnap = await linkRef.get();

      if (linkSnap.exists) {
        uid = linkSnap.data().uid;
        await linkRef.set(
          {
            username,
            displayName,
            photoURL,
            lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const userRecord = await admin.auth().createUser({
          displayName,
          photoURL: photoURL || undefined,
        });
        uid = userRecord.uid;
        isNewUser = true;

        const batch = db.batch();

        batch.set(db.collection('users').doc(uid), {
          uid,
          displayName,
          photoURL,
          email: '',
          phone: '',
          role: 'owner',
          businessId: uid,
          businessIds: [uid],
          active: true,
          authProvider: 'telegram',
          telegramId,
          telegramUsername: username,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.set(db.collection('businesses').doc(uid), {
          name: 'Компания · ' + displayName,
          ownerUid: uid,
          ownerEmail: '',
          status: 'active',
          active: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        batch.set(linkRef, {
          uid,
          telegramId,
          username,
          displayName,
          photoURL,
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();
      }

      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists && userSnap.data().active === false) {
        return res.status(403).json({ error: 'account_disabled' });
      }

      const customToken = await admin.auth().createCustomToken(uid, {
        provider: 'telegram',
        telegramId,
        isNewUser,
      });

      return res.json({
        token: customToken,
        uid,
        isNewUser,
      });
    } catch (err) {
      console.error('[telegramAuth] error:', err);
      return res.status(500).json({ error: 'server_error', message: err.message });
    }
  });

/* ---------------------------------------------------------
   Health-check
   --------------------------------------------------------- */
exports.health = functions.https.onRequest((req, res) => {
  res.json({
    ok: true,
    service: 'kut-biznes-functions',
    bot: '@NexusBizIDBot',
    botTokenConfigured: Boolean(getBotToken()),
    ts: Date.now(),
  });
});
