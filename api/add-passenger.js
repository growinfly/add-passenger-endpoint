const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports.config = {
  api: {
    bodyParser: false
  }
};

const FLIGHTS = {
  '5O765': '5O765 | EGC → FAO | 24/04/2025',
  '5O766': '5O766 | FAO → CHR | 24/04/2025'
};

const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');
const VERIFY_TOKEN = 'mySecretToken123';

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
  const data = flowDataBuffer.subarray(0, flowDataBuffer.length - TAG_LENGTH);
  const tag = flowDataBuffer.subarray(flowDataBuffer.length - TAG_LENGTH);
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

async function sendWhatsAppMessage(to, message) {
  const replyBody = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message }
  };

  return fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
    },
    body: JSON.stringify(replyBody)
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        return res.status(200).send(challenge);
      }
      console.warn('❌ Verification failed');
      return res.status(403).send('Forbidden');
    }

    if (req.method !== 'POST') return res.status(200).send('OK');

    let rawBody = '';
    await new Promise((resolve, reject) => {
      req.on('data', chunk => (rawBody += chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const json = JSON.parse(rawBody);
    console.log('📥 Received payload:', JSON.stringify(json, null, 2));

    if (json.entry?.[0]?.changes?.[0]?.value?.messages) {
      const message = json.entry[0].changes[0].value.messages[0];
      await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.from,
          type: 'text',
          text: {
            body: '👋 Welcome to GrowIN Fly!\n\nManage your flights:\n✈️ Add Passenger\n💬 Special Request\n🔍 View Flights\n📩 View PNLs'
          }
        })
      });
      return res.status(200).send('OK');
    }

    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = json;
    if (!encrypted_aes_key || !encrypted_flow_data || !initial_vector) {
      return res.status(400).json({ error: 'Missing encrypted data fields' });
    }

    let aesKey, decrypted;
    try {
      aesKey = decryptAESKey(encrypted_aes_key);
      decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);
    } catch (err) {
      console.error('🔐 Decryption failed:', err);
      return res.status(400).json({ error: 'Invalid encrypted payload' });
    }

    console.log('🔓 Decrypted:', decrypted);

    const flowVersion = decrypted.version || '3.0';
    const ivBuffer = Buffer.from(initial_vector, 'base64');

    switch (decrypted.action) {
      case 'ping':
        return res.status(200).send(encryptResponse({
          version: flowVersion,
          data: { status: 'active' }
        }, aesKey, ivBuffer));

      case 'INIT':
        return res.status(200).send(encryptResponse({
          version: flowVersion,
          screen: 'SELECT_FLIGHT',
          data: {
            flights: Object.keys(FLIGHTS).map(id => ({
              id,
              title: FLIGHTS[id]
            }))
          }
        }, aesKey, ivBuffer));

      case 'data_exchange': {
        const { screen, data, flow_token } = decrypted;

        if (screen === 'PASSENGER_DETAILS') {
          if (!data.first_name?.trim() || !data.last_name?.trim() || !data.dob?.trim()) {
            return res.status(200).send(encryptResponse({
              version: flowVersion,
              screen: 'PASSENGER_DETAILS',
              data: {
                error: 'All fields are required',
                flight: data.flight
              }
            }, aesKey, ivBuffer));
          }

          return res.status(200).send(encryptResponse({
            version: flowVersion,
            screen: 'CONFIRM',
            data: {
              extension_message_response: {
                params: {
                  flight: data.flight ? (FLIGHTS[data.flight] || data.flight) : 'Unknown flight',
                  title: data.title || 'Mr./Ms.',
                  first_name: data.first_name,
                  last_name: data.last_name,
                  dob: data.dob
                }
              }
            }
          }, aesKey, ivBuffer));
        }

        if (screen === 'CONFIRM') {
          await fetch(`https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.ACCESS_TOKEN}`
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: decrypted.user_id,
              type: 'text',
              text: {
                body: `✅ Passenger confirmed!\n\n${data.title || 'Mr./Ms.'} ${data.first_name} ${data.last_name}\nFlight: ${data.flight}\nDOB: ${data.dob}`
              }
            })
          });

          return res.status(200).send(encryptResponse({
            version: flowVersion,
            screen: 'CONFIRM',
            data: {
              extension_message_response: {
                params: {
                  flow_token,
                  flight: data.flight,
                  title: data.title || 'Mr./Ms.',
                  first_name: data.first_name,
                  last_name: data.last_name,
                  dob: data.dob
                }
              }
            }
          }, aesKey, ivBuffer));
        }
        break;
      }

      default:
        return res.status(200).send(encryptResponse({
          version: flowVersion,
          screen: 'ERROR_SCREEN',
          data: { error_message: `Unhandled action: ${decrypted.action}` }
        }, aesKey, ivBuffer));
    }
  } catch (error) {
    console.error('❌ Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};