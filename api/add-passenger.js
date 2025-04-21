export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    console.log("🔔 Incoming WhatsApp Flow data:", req.body);

    // Respond to confirm receipt
    res.status(200).json({
      screen: "CONFIRM",
      data: {
        confirmation: "Passenger added successfully! 🎉"
      }
    });

  } catch (err) {
    console.error("❌ Error handling request:", err);
    res.status(500).json({ error: "Server Error" });
  }
}
