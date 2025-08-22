import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// RSVP form submission endpoint
app.post('/', async (c) => {
  try {
    // Parse form data
    const formData = await c.req.json();
    console.log('Received form data:', formData);

    // Validate required fields
    const { attendance, name, guest, message } = formData;
    
    if (!attendance || !name) {
      return c.json({ 
        success: false, 
        error: 'Пожалуйста, заполните обязательные поля' 
      }, 400);
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
    const result = await saveToGoogleSheets(c.env, rowData);
    
    if (result.success) {
      return c.json({ 
        success: true, 
        message: 'Ответ отправлен! Спасибо за подтверждение!' 
      });
    } else {
      console.error('Google Sheets error:', result.error);
      return c.json({ 
        success: false, 
        error: 'Ошибка сохранения данных. Попробуйте еще раз.' 
      }, 500);
    }

  } catch (error) {
    console.error('Worker error:', error);
    return c.json({ 
      success: false, 
      error: 'Ошибка обработки запроса. Попробуйте еще раз.' 
    }, 500);
  }
});

// Handle other methods
app.all('*', (c) => {
  return c.text('Method not allowed', 405);
});

export default app;

// Helper function to save data to Google Sheets
async function saveToGoogleSheets(env, rowData) {
  try {
    const { google } = await import('googleapis');
    
    // Parse the service account JSON
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);

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

