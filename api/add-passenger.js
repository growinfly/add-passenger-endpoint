// pages/api/add-passenger.js

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Load private RSA key (PKCS8 unencrypted PEM format)
const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');

function decryptAESKey(encryptedAESKeyBase64) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedAESKeyBase64, 'base64')
  );
}

function decryptPayload(encryptedFlowDataBase64, aesKey, ivBase64) {
  const iv = Buffer.from(ivBase64, 'base64');
  const encrypted = Buffer.from(encryptedFlowDataBase64, 'base64');
  const tag = encrypted.slice(-16);
  const ciphertext = encrypted.slice(0, -16);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

function encryptResponsePayload(payload, aesKey, originalIVBase64) {
  const originalIV = Buffer.from(originalIVBase64, 'base64');
  const flippedIV = Buffer.from(originalIV.map((byte) => ~byte & 0xff));

  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIV);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(buffers).toString());

    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;
    const aesKey = decryptAESKey(encrypted_aes_key);
    const decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);

    console.log('📥 Decrypted Payload:', decrypted);

    const { action, screen, data } = decrypted;
    if (action === 'data_exchange' && screen === 'CONFIRM') {
      const { flight, title, first_name, last_name, dob } = data;

      if (!flight || !title || !first_name || !last_name || !dob) {
        const response = {
          screen: 'CONFIRM',
          data: {
            error_message: 'Missing required fields',
          },
        };
        const encrypted = encryptResponsePayload(response, aesKey, initial_vector);
        return res.status(200).send(encrypted);
      }

      const response = {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: {
              flow_token: decrypted.flow_token,
              summary: `✅ ${title} ${first_name} ${last_name} booked on flight ${flight}`,
            },
          },
        },
      };
      const encrypted = encryptResponsePayload(response, aesKey, initial_vector);
      return res.status(200).send(encrypted);
    }

    // Return to flight selection screen
    const response = {
      screen: 'SELECT_FLIGHT',
      data: {
        flights: [
          { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
          { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' },
        ],
      },
    };
    const encrypted = encryptResponsePayload(response, aesKey, initial_vector);
    return res.status(200).send(encrypted);
  } catch (err) {
    console.error('❌ Failed to handle encrypted request:', err);
    return res.status(421).send('Encryption error');
  }
}
