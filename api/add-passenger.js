import { parse } from 'querystring';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    let body = '';

    // Read stream manually
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
      parsedBody = parse(body);
    }

    console.log('📨 Parsed Body:', parsedBody);

    const { flight, title, first_name, last_name, dob } = parsedBody;

    if (!flight || !title || !first_name || !last_name || !dob) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const passenger = {
      flight,
      title,
      first_name,
      last_name,
      dob
    };

    return res.status(200).json({
      success: true,
      message: `Passenger ${title} ${first_name} ${last_name} added for flight ${flight}.`
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
