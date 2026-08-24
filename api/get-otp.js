// /api/get-otp.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, accountId, appId } = req.body;

  try {
    // Call Deriv's New REST API to generate an OTP
    const derivRes = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
      method: 'POST',
      headers: {
        'Deriv-App-ID': appId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await derivRes.json();
    
    if (data.errors) {
      return res.status(400).json({ error: data.errors[0].message });
    }

    // Return the ready-to-use WebSocket URL
    res.status(200).json({ url: data.data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
