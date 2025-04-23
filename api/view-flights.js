// api/view_flights.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hjpfoxxnoopxmiukthpf.supabase.co';
const SUPABASE_ANON_KEY = 'your_anon_key_here'; // replace with your real key
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLIENT_FLOW_TOKEN_MAP = {
  'fram-token-xx': '76990aea-ad41-4b33-8b1e-5f20aed120fc',
  'tn1-token-xx': 'a416cf25-0404-47b8-9aec-5d17f6e0ad3f',
  'mt-token-xx': 'c9d6e6ad-3b3e-4024-8348-412136015c8d',
  'tui-token-xx': 'ff519970-5edf-44b8-8191-d012299e0362'
};

module.exports = async (req, res) => {
  const token = req.query.token;

  if (!token || !CLIENT_FLOW_TOKEN_MAP[token]) {
    return res.status(400).json({ error: 'Invalid or missing token' });
  }

  const clientId = CLIENT_FLOW_TOKEN_MAP[token];

  try {
    const { data: flightClients, error } = await supabase
      .from('flight_clients')
      .select('flight_id')
      .eq('client_id', clientId);

    if (error) throw error;

    const flightIds = flightClients.map(f => f.flight_id);

    const { data: flights, error: flightError } = await supabase
      .from('flights')
      .select('id, flight_id, from_airport, to_airport, flight_date')
      .in('id', flightIds);

    if (flightError) throw flightError;

    const formatted = flights.map(f => ({
      id: f.id,
      title: `${f.flight_id} | ${f.from_airport} → ${f.to_airport} | ${new Date(f.flight_date).toLocaleDateString()}`
    }));

    return res.status(200).json({ flights: formatted });
  } catch (err) {
    console.error('❌ Error retrieving flights:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
