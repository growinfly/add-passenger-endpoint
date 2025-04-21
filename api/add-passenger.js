export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { screen, data } = req.body;

    console.log("🟡 Incoming WhatsApp Flow payload:", req.body);

    if (screen === "CONFIRM") {
      const { flight, title, first_name, last_name, dob } = data;

      // 🚧 Here you'd typically update your PNL or DB
      console.log("🧾 Confirmed Passenger:");
      console.log(`✈️ Flight: ${flight}`);
      console.log(`👤 Name: ${title} ${first_name} ${last_name}`);
      console.log(`🎂 DOB: ${dob}`);

      return res.status(200).json({
        screen: "CONFIRM",
        data: {
          confirmation: `✅ ${title} ${first_name} ${last_name} added to ${flight}`
        }
      });
    }

    // Optional: handle mid-screen data exchange (like validations or dynamic updates)
    return res.status(200).json({
      screen,
      data: {} // No change to flow data unless needed
    });

  } catch (err) {
    console.error("❌ Flow processing failed:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
