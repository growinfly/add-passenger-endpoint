// This is a basic Express endpoint for handling WhatsApp Flow submissions for adding passengers

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

app.use(bodyParser.json());

app.post('/api/add-passenger', (req, res) => {
  try {
    const { flight, title, first_name, last_name, dob } = req.body;

    // Log or store the submission for debugging/demo
    console.log(`✈️ New passenger added to ${flight}`);
    console.log(`👤 ${title} ${first_name} ${last_name} | DOB: ${dob}`);

    // Save to a file (mock DB for demo)
    const paxData = {
      timestamp: new Date().toISOString(),
      flight,
      title,
      first_name,
      last_name,
      dob
    };

    const filePath = path.join(__dirname, 'passenger_log.json');
    let existing = [];
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath));
    }
    existing.push(paxData);
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    // Respond back to WhatsApp flow
    res.json({
      screen: 'CONFIRM',
      data: {
        flight,
        title,
        first_name,
        last_name,
        dob
      }
    });
  } catch (err) {
    console.error('❌ Error handling passenger:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Add Passenger Endpoint listening on port ${PORT}`);
});
