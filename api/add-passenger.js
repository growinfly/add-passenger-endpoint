export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { screen, data } = req.body;

    console.log("📨 Incoming Flow payload:", req.body);

    // Handle the CONFIRM screen submission
    if (screen === "CONFIRM") {
      const { flight, title, first_name, last_name, dob } = data;

      // Here you can connect to PNL, validate, store to DB, send alerts etc.
      console.log(`✈️ Flight: ${flight}`);
      console.log(`👤 Passenger: ${title} ${first_name} ${last_name}`);
      console.log(`🎂 DOB: ${dob}`);

      return res.status(200).json({
        screen: "CONFIRM",
        data: {
          confirmation: `✅ ${title} ${first_name} ${last_name} was added to flight ${flight}.`
        }
      });
    }

    // Default case (non-terminal screen) – echo back to Flow
    return res.status(200).json({ screen, data: {} });

  } catch (error) {
    console.error("❌ Flow Handler Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
