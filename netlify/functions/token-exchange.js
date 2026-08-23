exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code, code_verifier, redirect_uri, client_id } = JSON.parse(event.body);

    // Validate required parameters
    if (!code || !code_verifier || !redirect_uri || !client_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://auth.deriv.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client_id,
        code: code,
        code_verifier: code_verifier,
        redirect_uri: redirect_uri
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return {
        statusCode: tokenResponse.status,
        body: JSON.stringify({ 
          error: 'Token exchange failed',
          details: errorData 
        })
      };
    }

    const tokenData = await tokenResponse.json();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type
      })
    };

  } catch (error) {
    console.error('Error in token exchange:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
