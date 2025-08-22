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
    const { google } = await import('googleapis');
    
    // Create service account credentials
    const credentials = {
      type: 'service_account',
      project_id: env.GOOGLE_PROJECT_ID,
      private_key: env.GOOGLE_PRIVATE_KEY,
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    };

    // Initialize Google Auth
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Create Google Sheets API client
    const sheets = google.sheets({ version: 'v4', auth });

    // Append data to the sheet
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: 'Sheet1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData],
        majorDimension: 'ROWS'
      }
    });

    console.log('Google Sheets response:', result.data);
    return { success: true, result: result.data };

  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    return { success: false, error: error.message };
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