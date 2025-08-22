export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Handle POST requests for form submission
    if (request.method === 'POST') {
      try {
        // Parse form data
        const formData = await request.json();
        console.log('Received form data:', formData);

        // Validate required fields
        const { attendance, name, guest, message } = formData;
        
        if (!attendance || !name) {
          return createErrorResponse('Пожалуйста, заполните обязательные поля');
        }

        // Prepare data for Google Sheets
        const timestamp = new Date().toLocaleString('ru-RU', { 
          timeZone: 'Asia/Almaty',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        const attendanceText = attendance === 'yes' ? 'Обязательно буду!' : 'На этот раз без меня';
        
        const rowData = [
          timestamp,
          attendanceText,
          name.trim(),
          guest?.trim() || '',
          message?.trim() || ''
        ];

        // Save to Google Sheets
        const result = await saveToGoogleSheets(env, rowData);
        
        if (result.success) {
          return createSuccessResponse('Ответ отправлен! Спасибо за подтверждение!');
        } else {
          console.error('Google Sheets error:', result.error);
          return createErrorResponse('Ошибка сохранения данных. Попробуйте еще раз.');
        }

      } catch (error) {
        console.error('Worker error:', error);
        return createErrorResponse('Ошибка обработки запроса. Попробуйте еще раз.');
      }
    }

    // Handle other methods
    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

// Helper function to save data to Google Sheets
async function saveToGoogleSheets(env, rowData) {
  try {
    // Generate access token using service account
    const accessToken = await getAccessToken(env);
    
    if (!accessToken) {
      return { success: false, error: 'Failed to get access token' };
    }

    // Prepare the request to Google Sheets API
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_ID}/values/Sheet1:append`;
    
    const body = {
      values: [rowData],
      majorDimension: 'ROWS'
    };

    const response = await fetch(`${url}?valueInputOption=RAW`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Sheets API error:', response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const result = await response.json();
    console.log('Google Sheets response:', result);
    
    return { success: true, result };

  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    return { success: false, error: error.message };
  }
}

// Generate access token using service account private key
async function getAccessToken(env) {
  try {
    // JWT header
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    // JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // 1 hour
      iat: now
    };

    // Create JWT
    const jwt = await createJWT(header, payload, env.GOOGLE_PRIVATE_KEY);

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange error:', tokenResponse.status, errorText);
      return null;
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;

  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

// Create JWT using RS256 algorithm
async function createJWT(header, payload, privateKey) {
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  // Import private key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the data
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(data)
  );

  // Encode signature
  const encodedSignature = base64UrlEncode(signature);

  return `${data}.${encodedSignature}`;
}

// Helper functions
function base64UrlEncode(data) {
  if (typeof data === 'string') {
    data = new TextEncoder().encode(data);
  }
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToArrayBuffer(pem) {
  try {
    console.log('Processing private key, length:', pem?.length);
    
    if (!pem || typeof pem !== 'string') {
      throw new Error('Private key is missing or not a string');
    }
    
    const b64 = pem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    
    console.log('Extracted base64 length:', b64.length);
    console.log('First 50 chars:', b64.substring(0, 50));
    console.log('Last 50 chars:', b64.substring(b64.length - 50));
    
    // Validate base64 format
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      throw new Error('Invalid base64 characters in private key');
    }
    
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error('Error in pemToArrayBuffer:', error.message);
    throw error;
  }
}

function createSuccessResponse(message) {
  return new Response(JSON.stringify({ 
    success: true, 
    message 
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function createErrorResponse(message) {
  return new Response(JSON.stringify({ 
    success: false, 
    error: message 
  }), {
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}