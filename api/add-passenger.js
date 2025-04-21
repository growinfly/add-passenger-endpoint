export const config = {
  api: {
    bodyParser: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const { flight, title, first_name, last_name, dob } = req.body || {};

  // If missing all values → assume first screen flight list
  if (!flight && !title && !first_name && !last_name && !dob) {
    return res.status(200).json({
      flights: [
        { id: '5O765', title: '5O765 | EGC → FAO | 24/04/2025' },
        { id: '5O766', title: '5O766 | FAO → CHR | 24/04/2025' }
      ]
    });
  }

  // Only CONFIRM screen uses encrypted payload (if x-meta-hub-signature exists)
  return res.status(200).json({
    success: true,
    message: `Passenger ${title} ${first_name} ${last_name} added to flight ${flight}`
  });
}
