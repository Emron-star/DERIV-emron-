export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code, code_verifier, redirect_uri, client_id } = req.body;
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code, code_verifier, redirect_uri, client_id,
    });
    const r = await fetch('https://oauth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
