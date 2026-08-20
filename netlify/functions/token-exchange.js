// netlify/functions/token-exchange.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { code, code_verifier, redirect_uri, client_id } = JSON.parse(event.body);

    if (!code || !code_verifier || !redirect_uri || !client_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters' }),
      };
    }

    const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        code,
        code_verifier,
        redirect_uri,
      }),
    });

    const data = await tokenResponse.json();

    if (!tokenResponse.ok || !data.access_token) {
      return {
        statusCode: tokenResponse.status || 400,
        headers,
        body: JSON.stringify({ error: data.error_description || 'Token exchange failed' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ access_token: data.access_token }),
    };
  } catch (error) {
    console.error('Token exchange error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
