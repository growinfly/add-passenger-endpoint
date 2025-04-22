const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports.config = {
  api: {
    bodyParser: false
  }
};

const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');

function decryptAESKey(encryptedAESKey) {
  return crypto.privateDecrypt(
    {
      key: crypto.createPrivateKey({
        key: privateKey,
        format: 'pem',
        type: 'pkcs8'
      }),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    Buffer.from(encryptedAESKey, 'base64')
  );
}

function decryptPayload(encryptedData, aesKey, ivBase64) {
  const flowDataBuffer = Buffer.from(encryptedData, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const TAG_LENGTH = 16;
  const data = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const tag = flowDataBuffer.subarray(-TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function encryptResponse(responseData, aesKey, iv) {
  const flippedIV = Buffer.from(iv.map(b => b ^ 0xff));
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flippedIV);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(responseData), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString('base64');
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const VERIFY_TOKEN = 'mySecretToken123';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ Webhook verification failed');
      return res.status(403).send('Forbidden');
    }
  }

  if (req.method !== 'POST') return res.status(200).send('OK');

  let rawBody = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => (rawBody += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  try {
    const json = JSON.parse(rawBody);
    console.log('📥 Raw body received from webhook:', JSON.stringify(json, null, 2));

    if (json.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = json.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const text = message.text?.body || '';

      console.log('📩 Incoming message from user:', from);

      const introMessage =
        '👋 Welcome to GrowIN Fly!\n\nWe are here to help you manage your upcoming flights. In here, you can:\n\n✈️ Add a Passenger\n💬 Add a Special Request\n🔍 View My Flights\n📩 View My PNLs\n\nPlease choose an option to get started 😎\nGrowIN Fly AI Assistant';

      const replyBody = {
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: { body: introMessage }
      };

      await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
        },
        body: JSON.stringify(replyBody)
      });

      return res.status(200).send('Auto-response sent');
    }

    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = json;

    const aesKey = decryptAESKey(encrypted_aes_key);
    const decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);
    console.log('📥 Decrypted payload:', decrypted);
    console.log('⚙️ Received Flow Action:', decrypted.action);

    const flowVersion = decrypted.version || '3.0';

    if (decrypted.action === 'ping') {
      const response = {
        version: flowVersion,
        data: {
          status: 'active'
        }
      };
      const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
      return res.status(200).send(encrypted);
    }

    if (decrypted.action === 'INIT') {
      const response = {
        version: flowVersion,
        screen: 'SELECT_FLIGHT',
        data: {
          flights: [
            { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
            { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
          ]
        }
      };
      const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
      return res.status(200).send(encrypted);
    }

    if (decrypted.action === 'data_exchange') {
      const { screen, data, flow_token } = decrypted;
      console.log('📤 Received data_exchange:', data);

      const summaryText = `Flight: ${data.flight}\nName: ${data.title} ${data.first_name} ${data.last_name}\nDOB: ${data.dob}`;

      if (screen === 'PASSENGER_DETAILS') {
        const response = {
          version: flowVersion,
          screen: 'CONFIRM',
          data: {
            flight: data.flight,
            title: data.title,
            first_name: data.first_name,
            last_name: data.last_name,
            dob: data.dob,
            summary: summaryText
          }
        };
        const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
        return res.status(200).send(encrypted);
      }

      if (screen === 'CONFIRM') {
        const response = {
          version: flowVersion,
          screen: 'CONFIRM',
          data: {
            flight: data.flight,
            title: data.title,
            first_name: data.first_name,
            last_name: data.last_name,
            dob: data.dob,
            summary: summaryText
          }
        };
        const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
        return res.status(200).send(encrypted);
      }
    }

    const errorResponse = {
      version: flowVersion,
      screen: 'ERROR_SCREEN',
      data: {
        error_message: `Unhandled action: ${decrypted.action}`
      }
    };
    const encrypted = encryptResponse(errorResponse, aesKey, Buffer.from(initial_vector, 'base64'));
    return res.status(200).send(encrypted);
  } catch (error) {
    console.error('❌ Failed to handle encrypted request:', error);
    return res.status(421).send('Encryption error');
  }
};
