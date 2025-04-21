export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { screen, data } = req.body;

    console.log("📩 Incoming request from Flow:", req.body);

    if (screen === "CONFIRM") {
      const { flight, title, first_name, last_name, dob } = data;

      // ✨ Simulate saving or updating a PNL here
      console.log(`🛫 Flight: ${flight}`);
      console.log(`👤 Passenger: ${title} ${first_name} ${last_name}`);
      console.log(`🎂 DOB: ${dob}`);

      return res.status(200).json({
        screen: "CONFIRM",
        data: {
          confirmation: `✅ ${title} ${first_name} ${last_name} was added to flight ${flight}.`
        }
      });
    }

    // Optional handling of mid-flow steps if needed
    return res.status(200).json({
      screen,
      data: {}
    });

  } catch (err) {
    console.error("❌ Error processing Flow request:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
