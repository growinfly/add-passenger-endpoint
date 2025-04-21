export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { flight, title, first_name, last_name, dob } = req.body;

    // Basic validation
    if (!flight || !title || !first_name || !last_name || !dob) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // OPTIONAL: Format or clean data
    const passenger = {
      flight,
      title,
      first_name,
      last_name,
      dob
    };

    // 👉 TODO: Store to DB, send to webhook, or email it
    console.log('📦 Received passenger:', passenger);

    // Send a response back to WhatsApp Flow
    return res.status(200).json({
      success: true,
      message: `Passenger ${title} ${first_name} ${last_name} added for flight ${flight}.`
    });
  } catch (error) {
    console.error('❌ Error in add-passenger:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
