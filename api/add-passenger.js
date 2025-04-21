import { parse } from 'querystring';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'Only POST allowed' });
  }

  try {
    let body = '';

    // Read raw body from stream
    await new Promise((resolve, reject) => {
      req.on('data', chunk => (body += chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const contentType = req.headers['content-type'];
    let parsedBody;

    if (contentType === 'application/json') {
      parsedBody = JSON.parse(body);
    } else {
      parsedBody = parse(body); // Handles form-encoded input
    }

    console.log('📨 Received body:', parsedBody);

    const { flight, title, first_name, last_name, dob } = parsedBody;

    // If anything is missing, still return 200 OK but with a message
    if (!flight || !title || !first_name || !last_name || !dob) {
      return res.status(200).json({
        success: false,
        message: 'Missing one or more fields: flight, title, first_name, last_name, dob'
      });
    }

    const passenger = {
      flight,
      title,
      first_name,
      last_name,
      dob
    };

    console.log('✅ Passenger added:', passenger);

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
