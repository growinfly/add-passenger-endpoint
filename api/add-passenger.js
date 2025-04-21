import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: true
  }
};

// Load private RSA key (used to decrypt AES key from Meta)
const privateKey = fs.readFileSync(path.resolve('private_key.pem'), 'utf8');

function decryptAESKey(encryptedAESKey) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    Buffer.from(encryptedAESKey, 'base64')
  );
}

console.log('🔐 Decrypted AES Key Length:', aesKey.length);
console.log('🔐 AES Key (Base64):', aesKey.toString('base64'));


function decryptPayload(encryptedData, aesKey, ivBase64) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, Buffer.from(ivBase64, 'base64'));
  let decrypted = decipher.update(Buffer.from(encryptedData, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function encryptResponse(response, aesKey, ivBase64) {
  const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, Buffer.from(ivBase64, 'base64'));
  let encrypted = cipher.update(JSON.stringify(response), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

export default async function handler(req, res) {
  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return res.status(400).json({ message: 'Missing encryption parameters' });
    }

    // 1. Decrypt AES key (128-bit) using your private RSA key
    const aesKey = decryptAESKey(encrypted_aes_key); // Buffer of 16 bytes

    // 2. Decrypt incoming data using AES key + IV
    const data = decryptPayload(encrypted_flow_data, aesKey, initial_vector);
    console.log('✅ Decrypted request:', data);

    const { flight, title, first_name, last_name, dob } = data;

    if (!flight || !title || !first_name || !last_name || !dob) {
      const errorPayload = { success: false, message: 'Missing one or more fields.' };
      const encryptedError = encryptResponse(errorPayload, aesKey, initial_vector);
      return res.status(200).send(encryptedError);
    }

    const successPayload = {
      success: true,
      message: `Passenger ${title} ${first_name} ${last_name} added to flight ${flight}`
    };

    const encryptedResponse = encryptResponse(successPayload, aesKey, initial_vector);
    return res.status(200).send(encryptedResponse);
  } catch (err) {
    console.error('❌ Failed to handle encrypted request:', err);
    return res.status(200).send('Encryption error'); // Still return 200 to avoid retries
  }
}
