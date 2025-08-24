import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Create invitation endpoint
app.post('/create-invite', async (c) => {
  try {
    const { name } = await c.req.json();
    
    if (!name?.trim()) {
      return c.json({ 
        success: false, 
        error: 'Имя обязательно для заполнения' 
      }, 400);
    }

    // Generate UUID
    const uuid = crypto.randomUUID();
    
    // Prepare data for Google Sheets
    const now = new Date();
    const almatyTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Almaty"}));
    const timestamp = `${almatyTime.getMonth() + 1}/${almatyTime.getDate()}/${almatyTime.getFullYear()} ${almatyTime.getHours().toString().padStart(2, '0')}:${almatyTime.getMinutes().toString().padStart(2, '0')}`;
    
    // Create invite link
    const inviteLink = `https://xavescor.github.io/tima_wedding/?uuid=${uuid}`;
    
    // Service info
    const serviceInfo = Math.floor(Math.random() * 1000) + 1;
    
    const rowData = [
      'Создано',               // Column A: Status (always "Создано" for new invites)
      timestamp,               // Column B: Date/time  
      name.trim(),            // Column C: Name
      '',                     // Column D: Guest name (empty for new invites)
      '',                     // Column E: Comment (empty for new invites)
      serviceInfo,            // Column F: Service info
      uuid,                   // Column G: UUID
      inviteLink              // Column H: Invite link
    ];

    // Save to Google Sheets
    const result = await saveToGoogleSheets(rowData, c.env);
    
    if (result.success) {
      return c.json({ 
        success: true, 
        uuid: uuid,
        inviteLink: inviteLink,
        message: 'Приглашение создано успешно!' 
      });
    } else {
      console.error('Google Sheets error:', result.error);
      return c.json({ 
        success: false, 
        error: 'Ошибка сохранения приглашения. Попробуйте еще раз.' 
      }, 500);
    }

  } catch (error) {
    console.error('Create invite error:', error);
    return c.json({ 
      success: false, 
      error: 'Ошибка создания приглашения. Попробуйте еще раз.' 
    }, 500);
  }
});

// Get invitation by UUID
app.get('/invite/:uuid', async (c) => {
  try {
    const uuid = c.req.param('uuid');
    
    if (!uuid) {
      return c.json({ 
        success: false, 
        error: 'UUID не указан' 
      }, 400);
    }

    // Find invitation in Google Sheets
    const invitation = await findInvitationByUUID(uuid, c.env);
    
    if (invitation.success) {
      // Update status to "Просмотрено" when user views the invitation
      await updateInvitationStatus(invitation.data, 'Просмотрено', c.env);
      
      return c.json({ 
        success: true, 
        invitation: invitation.data
      });
    } else {
      return c.json({ 
        success: false, 
        error: 'Приглашение не найдено' 
      }, 404);
    }

  } catch (error) {
    console.error('Get invitation error:', error);
    return c.json({ 
      success: false, 
      error: 'Ошибка получения приглашения' 
    }, 500);
  }
});

// RSVP form submission endpoint
app.post('/', async (c) => {
  try {
    // Parse form data
    const formData = await c.req.json();
    console.log('Received form data:', formData);

    // Validate required fields
    const { attendance, name, guest, message, uuid } = formData;
    
    if (!attendance) {
      return c.json({ 
        success: false, 
        error: 'Пожалуйста, выберите вариант посещения' 
      }, 400);
    }

    if (!uuid) {
      return c.json({ 
        success: false, 
        error: 'UUID приглашения не указан' 
      }, 400);
    }

    // Validate UUID exists
    const invitation = await findInvitationByUUID(uuid, c.env);
    if (!invitation.success) {
      return c.json({ 
        success: false, 
        error: 'Приглашение не найдено' 
      }, 404);
    }

    // Name is only required when attending
    if (attendance === 'yes' && !name?.trim()) {
      return c.json({ 
        success: false, 
        error: 'Пожалуйста, укажите ваше имя' 
      }, 400);
    }

    // Update the existing invitation row
    const result = await updateInvitationRSVP(uuid, {
      attendance,
      name: name?.trim() || invitation.data.name,
      guest: guest?.trim() || '',
      message: message?.trim() || ''
    }, c.env);
    
    if (result.success) {
      const responseMessage = attendance === 'yes' 
        ? 'Ответ отправлен! Спасибо за подтверждение!'
        : 'Зафиксировано что вы не придёте';
      
      return c.json({ 
        success: true, 
        message: responseMessage 
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

// Global Google Sheets authentication
async function getSheets(env) {
  const { google } = await import('googleapis');
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Helper function to save data to Google Sheets
async function saveToGoogleSheets(rowData, env) {
  try {
    const sheets = await getSheets(env);

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

// Helper function to find invitation by UUID
async function findInvitationByUUID(uuid, env) {
  try {
    const sheets = await getSheets(env);

    // Get all data from the sheet
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: 'Sheet1',
    });

    const rows = result.data.values || [];
    
    // Find the row with matching UUID (column G, index 6)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][6] === uuid) { // Column G contains UUID
        return { 
          success: true, 
          data: {
            rowIndex: i + 1, // 1-based index for Google Sheets
            status: rows[i][0] || '',
            timestamp: rows[i][1] || '',
            name: rows[i][2] || '',
            guest: rows[i][3] || '',
            message: rows[i][4] || '',
            serviceInfo: rows[i][5] || '',
            uuid: rows[i][6] || '',
            inviteLink: rows[i][7] || ''
          }
        };
      }
    }
    
    return { success: false, error: 'UUID not found' };

  } catch (error) {
    console.error('Error finding invitation:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to update invitation status only
async function updateInvitationStatus(invitationData, status, env) {
  try {
    const sheets = await getSheets(env);

    // Prepare updated data with new status and timestamp
    const now = new Date();
    const almatyTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Almaty"}));
    const timestamp = `${almatyTime.getMonth() + 1}/${almatyTime.getDate()}/${almatyTime.getFullYear()} ${almatyTime.getHours().toString().padStart(2, '0')}:${almatyTime.getMinutes().toString().padStart(2, '0')}`;
    
    const updatedRow = [
      status,                        // Column A: Status (updated)
      timestamp,                     // Column B: Date/time (updated)
      invitationData.name,           // Column C: Name (keep original)
      invitationData.guest,          // Column D: Guest name (keep original)
      invitationData.message,        // Column E: Comment (keep original)
      invitationData.serviceInfo,    // Column F: Service info (keep original)
      invitationData.uuid,           // Column G: UUID (keep original)
      invitationData.inviteLink      // Column H: Invite link (keep original)
    ];

    // Update the specific row
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `Sheet1!A${invitationData.rowIndex}:H${invitationData.rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [updatedRow],
        majorDimension: 'ROWS'
      }
    });

    console.log('Google Sheets status update response:', updateResult.data);
    return { success: true, result: updateResult.data };

  } catch (error) {
    console.error('Error updating invitation status:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to update invitation RSVP
async function updateInvitationRSVP(uuid, rsvpData, env) {
  try {
    const sheets = await getSheets(env);

    // First find the invitation
    const invitation = await findInvitationByUUID(uuid, env);
    if (!invitation.success) {
      return { success: false, error: 'Invitation not found' };
    }

    // Prepare updated data
    const now = new Date();
    const almatyTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Almaty"}));
    const timestamp = `${almatyTime.getMonth() + 1}/${almatyTime.getDate()}/${almatyTime.getFullYear()} ${almatyTime.getHours().toString().padStart(2, '0')}:${almatyTime.getMinutes().toString().padStart(2, '0')}`;
    
    const statusText = rsvpData.attendance === 'yes' ? 'Принято' : 'Отклонено';
    
    const updatedRow = [
      statusText,                    // Column A: Status
      timestamp,                     // Column B: Date/time (updated)
      rsvpData.name,                // Column C: Name
      rsvpData.guest,               // Column D: Guest name
      rsvpData.message,             // Column E: Comment
      invitation.data.serviceInfo,   // Column F: Service info (keep original)
      invitation.data.uuid,          // Column G: UUID (keep original)
      invitation.data.inviteLink     // Column H: Invite link (keep original)
    ];

    // Update the specific row
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `Sheet1!A${invitation.data.rowIndex}:H${invitation.data.rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [updatedRow],
        majorDimension: 'ROWS'
      }
    });

    console.log('Google Sheets update response:', updateResult.data);
    return { success: true, result: updateResult.data };

  } catch (error) {
    console.error('Error updating invitation:', error);
    return { success: false, error: error.message };
  }
}

