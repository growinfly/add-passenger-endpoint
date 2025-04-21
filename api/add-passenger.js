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
  
  console.log('🔐 Headers:', req.headers);

  const signatureHeader = req.headers['x-meta-hub-signature'];
  let rawBody = '';

  await new Promise((resolve, reject) => {
    req.on('data', chunk => (rawBody += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  if (signatureHeader) {
    try {
      const [keyBase64, ivBase64] = signatureHeader.split('::');

      let decrypted = {};
      if (rawBody && rawBody.trim() !== '') {
        decrypted = decryptBody(rawBody, keyBase64, ivBase64);
        console.log('📩 Decrypted:', decrypted);
      } else {
        console.log('📩 No body — assuming initial flight list request');
      }

      // If no passenger data, assume it's the first screen asking for flights
      const isFlightListRequest =
        !decrypted.title &&
        !decrypted.first_name &&
        !decrypted.last_name &&
        !decrypted.dob;

      if (isFlightListRequest) {
        const flights = [
          { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
          { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
        ];
        const encryptedFlights = encryptBody({ flights }, keyBase64, ivBase64);
        return res.status(200).send(encryptedFlights);
      }

      const { flight, title, first_name, last_name, dob } = decrypted;

      if (!flight || !title || !first_name || !last_name || !dob) {
        const errorPayload = {
          success: false,
          message: 'Missing one or more required fields.'
        };
        const encryptedError = encryptBody(errorPayload, keyBase64, ivBase64);
        return res.status(200).send(encryptedError);
      }

      const successPayload = {
        success: true,
        message: `Passenger ${title} ${first_name} ${last_name} added to flight ${flight}`
      };
      const encryptedSuccess = encryptBody(successPayload, keyBase64, ivBase64);
      return res.status(200).send(encryptedSuccess);
    } catch (error) {
      console.error('❌ Encryption/decryption failed:', error);
      return res.status(200).send('Encryption error');
    }
  }

  // Just in case (unencrypted fallback)
  return res.status(200).json({
    flights: [
      { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
      { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
    ]
  });
}
