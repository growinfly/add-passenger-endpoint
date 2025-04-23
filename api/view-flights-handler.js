const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Config
module.exports.config = { api: { bodyParser: false } };

// Private Key (same as add-passenger)
const privateKey = fs.readFileSync(path.resolve('private_key_pkcs8.pem'), 'utf8');

// Supabase init
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Temporary phone-to-client map for testing
const PHONE_TO_CLIENT_ID = {
  '351916666626': 'ff519970-5edf-44b8-8191-d012299e0362' // Replace as needed
};

// Encryption/decryption helpers
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

// Handler
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  let rawBody = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => (rawBody += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  try {
    const json = JSON.parse(rawBody);
    const { encrypted_aes_key, encrypted_flow_data, initial_vector, user } = json;

    const aesKey = decryptAESKey(encrypted_aes_key);
    const decrypted = decryptPayload(encrypted_flow_data, aesKey, initial_vector);
    const flowVersion = decrypted.version || '3.0';
    const action = decrypted.action;
    const phone = user?.wa_id;

    console.log('🔍 WhatsApp user phone:', phone);

    const clientId = PHONE_TO_CLIENT_ID[phone];

    if (!clientId) {
      return res.status(403).send('Unauthorized client');
    }

    const { data: flightClients } = await supabase
      .from('flight_clients')
      .select('flight_id')
      .eq('client_id', clientId);

    const flightIds = flightClients.map(f => f.flight_id);

    const { data: flights } = await supabase
      .from('flights')
      .select('id, flight_id, from_airport, to_airport, flight_date')
      .in('id', flightIds);

    const formatted = flights.map(f => ({
      id: f.id,
      title: `${f.flight_id} | ${f.from_airport} → ${f.to_airport} | ${new Date(f.flight_date).toLocaleDateString()}`
    }));

    // ✅ Only send response if this is an INIT action
    if (action === 'INIT') {
      const response = {
        version: flowVersion,
        screen: 'VIEW_FLIGHTS', // This must match the screen ID in your Flow JSON
        data: { flights: formatted }
      };

      const encrypted = encryptResponse(response, aesKey, Buffer.from(initial_vector, 'base64'));
      return res.status(200).send(encrypted);
    }

    // Fallback if another action is sent
    return res.status(200).send('ACK');

  } catch (err) {
    console.error('❌ View Flights Handler Error:', err);
    return res.status(421).send('Encryption error');
  }
};
