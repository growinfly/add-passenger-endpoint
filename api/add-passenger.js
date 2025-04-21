import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false
  }
};

const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');

function decryptAESKey(encryptedAESKey) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(encryptedAESKey, 'base64')
  );
}

function decryptPayload(encryptedData, aesKey, ivBase64) {
  const encryptedBuffer = Buffer.from(encryptedData, 'base64');
  const tag = encryptedBuffer.slice(-16);
  const ciphertext = encryptedBuffer.slice(0, -16);
  const iv = Buffer.from(ivBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

function encryptPayload(payload, aesKey, ivBase64) {
  const flippedIv = Buffer.from(ivBase64, 'base64').map(b => ~b);
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString('base64');
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const rawBody = await getRawBody(req);

  try {
    const parsed = JSON.parse(rawBody.toString());

    // ✅ Health Check
    if (parsed.action === 'ping') {
      return res.status(200).json({ data: { status: 'active' } });
    }

    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = parsed;
    const aesKey = decryptAESKey(encrypted_aes_key);
    const decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);

    console.log('✅ Decrypted payload:', decrypted);

    const { screen, action, data } = decrypted;

    let response;

    if (action === 'INIT') {
      response = {
        screen: 'SELECT_FLIGHT',
        data: {
          flights: [
            { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
            { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
          ]
        }
      };
    } else if (action === 'data_exchange') {
      const { flight, title, first_name, last_name, dob } = data;
      if (!flight || !title || !first_name || !last_name || !dob) {
        response = {
          screen: screen,
          data: {
            error_message: 'Missing required fields'
          }
        };
      } else {
        response = {
          screen: 'SUCCESS',
          data: {
            extension_message_response: {
              params: {
                flow_token: decrypted.flow_token,
                name: `${title} ${first_name} ${last_name}`,
                dob,
                flight
              }
            }
          }
        };
      }
    } else {
      response = {
        screen: screen,
        data: {
          error_message: 'Unhandled action'
        }
      };
    }

    const encryptedResponse = encryptPayload(response, aesKey, initial_vector);
    return res.status(200).send(encryptedResponse);

  } catch (err) {
    console.error('❌ Failed to handle encrypted request:', err);
    return res.status(421).send('Encryption error');
  }
}
