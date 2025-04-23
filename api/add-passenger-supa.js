const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = {
  api: {
    bodyParser: false
  }
};

const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');

// Supabase config
const SUPABASE_URL = 'https://hjpfoxxnoopxmiukthpf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUz...'; // Replace with actual key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLIENT_FLOW_TOKEN_MAP = {
  'fram-token-xx': '76990aea-ad41-4b33-8b1e-5f20aed120fc',
  'tn1-token-xx': 'a416cf25-0404-47b8-9aec-5d17f6e0ad3f',
  'mt-token-xx': 'c9d6e6ad-3b3e-4024-8348-412136015c8d',
  'tui-token-xx': 'ff519970-5edf-44b8-8191-d012299e0362'
};

function decryptAESKey(encryptedAESKey) {
  return crypto.privateDecrypt({
    key: crypto.createPrivateKey({ key: privateKey, format: 'pem', type: 'pkcs8' }),
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'
  }, Buffer.from(encryptedAESKey, 'base64'));
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
    const { ['hub.mode']: mode, ['hub.verify_token']: token, ['hub.challenge']: challenge } = req.query;

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
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
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = json;

    const aesKey = decryptAESKey(encrypted_aes_key);
    const decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);
    const flowVersion = decrypted.version || '3.0';
    const flow_token = decrypted.flow_token;

    if (decrypted.action === 'INIT') {
      const clientId = CLIENT_FLOW_TOKEN_MAP[flow_token];
      let flights = [];

      if (clientId) {
        const { data: flightClients } = await supabase
          .from('flight_clients')
          .select('flight_id')
          .eq('client_id', clientId);

        const flightIds = flightClients.map(f => f.flight_id);
        const { data: flightData } = await supabase
          .from('flights')
          .select('id, flight_id, from_airport, to_airport, flight_date')
          .in('id', flightIds);

        flights = flightData.map(f => ({
          id: f.id,
          title: `${f.flight_id} | ${f.from_airport} → ${f.to_airport} | ${new Date(f.flight_date).toLocaleDateString()}`
        }));
      }

      const response = {
        version: flowVersion,
        screen: 'SELECT_FLIGHT',
        data: { flights }
      };
      const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
      return res.status(200).send(encrypted);
    }

    if (decrypted.action === 'data_exchange') {
      const { screen, data } = decrypted;

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
            summary: `${data.title} ${data.first_name} ${data.last_name} on flight ${data.flight}, born ${data.dob}`
          }
        };
        const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
        return res.status(200).send(encrypted);
      }

      if (screen === 'CONFIRM') {
        const response = {
          version: flowVersion,
          screen: 'SUCCESS',
          data: {
            extension_message_response: {
              params: {
                flow_token,
                passenger_name: `${data.title} ${data.first_name} ${data.last_name}`,
                flight: data.flight
              }
            }
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
