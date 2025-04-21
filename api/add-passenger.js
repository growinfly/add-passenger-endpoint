import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

function decryptBody(encrypted, key, iv) {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'base64'),
    Buffer.from(iv, 'base64')
  );
  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString());
}

function encryptBody(payload, key, iv) {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'base64'),
    Buffer.from(iv, 'base64')
  );
  let encrypted = cipher.update(JSON.stringify(payload));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const signatureHeader = req.headers['x-meta-hub-signature'];
  let rawBody = '';

  await new Promise((resolve, reject) => {
    req.on('data', chunk => (rawBody += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  // If this is a data_exchange (CONFIRM screen)
  if (signatureHeader) {
    try {
      const [keyBase64, ivBase64] = signatureHeader.split('::');
      const decrypted = decryptBody(rawBody, keyBase64, ivBase64);
      console.log('📥 Decrypted data:', decrypted);

      const { flight, title, first_name, last_name, dob } = decrypted;

      if (!flight || !title || !first_name || !last_name || !dob) {
        const encryptedError = encryptBody(
          { success: false, message: 'Missing required fields' },
          keyBase64,
          ivBase64
        );
        return res.status(200).send(encryptedError);
      }

      const response = {
        success: true,
        message: `Passenger ${title} ${first_name} ${last_name} added to flight ${flight}`
      };

      const encryptedResponse = encryptBody(response, keyBase64, ivBase64);
      return res.status(200).send(encryptedResponse);
    } catch (error) {
      console.error('❌ Decryption or encryption failed:', error);
      return res.status(200).send('Encryption error'); // Meta will drop this but logs will help
    }
  }

  // If no signature header — assume it's the first screen loading flights
  console.log('ℹ️ No signature — returning flight list (SELECT_FLIGHT screen)');
  return res.status(200).json({
    flights: [
      { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
      { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
    ]
  });
}
