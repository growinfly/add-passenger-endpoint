import crypto from 'crypto';
import { parse } from 'querystring';

export const config = {
  api: {
    bodyParser: false
  }
};

function decryptBody(encrypted, key, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'base64'), Buffer.from(iv, 'base64'));
  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString());
}

function encryptBody(payload, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'base64'), Buffer.from(iv, 'base64'));
  let encrypted = cipher.update(JSON.stringify(payload));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'Only POST allowed' });
  }

  let body = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => (body += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  const verifyHeader = req.headers['x-meta-hub-signature'];
  const contentType = req.headers['content-type'];

  // If encrypted flow (Meta's data_exchange)
  if (verifyHeader) {
    try {
      const [keyBase64, ivBase64] = verifyHeader.split('::');
      const decryptedData = decryptBody(body, keyBase64, ivBase64);
      console.log('🔓 Decrypted data:', decryptedData);

      const { flight, title, first_name, last_name, dob } = decryptedData;

      if (!flight || !title || !first_name || !last_name || !dob) {
        const errorMessage = { success: false, message: 'Missing one or more fields' };
        const encryptedError = encryptBody(errorMessage, keyBase64, ivBase64);
        return res.status(200).send(encryptedError);
      }

      const successMessage = {
        success: true,
        message: `Passenger ${title} ${first_name} ${last_name} added to flight ${flight}`
      };

      const encryptedResponse = encryptBody(successMessage, keyBase64, ivBase64);
      return res.status(200).send(encryptedResponse);
    } catch (err) {
      console.error('❌ Decryption error:', err);
      return res.status(200).json({ message: 'Failed to decrypt or process encrypted payload' });
    }
  }

  // If it's the first screen (requesting flight list) or fallback unencrypted
  try {
    const parsedBody = contentType === 'application/json'
      ? JSON.parse(body)
      : parse(body);

    if (Object.keys(parsedBody).length === 0) {
      // This is likely the first screen loading flights
      return res.status(200).json({
        flights: [
          { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
          { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
        ]
      });
    }

    const { flight, title, first_name, last_name, dob } = parsedBody;

    if (!flight || !title || !first_name || !last_name || !dob) {
      return res.status(200).json({
        success: false,
        message: 'Missing one or more fields: flight, title, first_name, last_name, dob'
      });
    }

    console.log('✅ Unencrypted passenger added:', parsedBody);

    return res.status(200).json({
      success: true,
      message: `Passenger ${title} ${first_name} ${last_name} for flight ${flight} received.`
    });
  } catch (error) {
    console.error('❌ Handler error:', error);
    return res.status(200).json({
      success: false,
      message: 'Something went wrong while processing the request.'
    });
  }
}
