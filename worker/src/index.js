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
    const { name, comment } = await c.req.json();
    
    if (!name?.trim()) {
      return c.json({ 
        success: false, 
        error: 'Имя обязательно для заполнения' 
      }, 400);
    }

    // Generate UUID
    const uuid = crypto.randomUUID();
    
    // Prepare data for Google Sheets
    const timestamp = getCurrentDateTime();
    
    // Create invite link
    const inviteLink = `https://xavescor.github.io/tima_wedding/?uuid=${uuid}`;
    
    const rowData = [
      'Создано',               // Column A: Status (always "Создано" for new invites)
      timestamp,               // Column B: Date/time  
      name.trim(),            // Column C: Admin name (reference name)
      name.trim(),            // Column D: User name (same as admin name initially)
      comment?.trim() || '',  // Column E: Admin comment
      '',                     // Column F: Additional guests (empty for new invites)
      '',                     // Column G: User comments (empty for new invites)
      uuid,                   // Column H: Service info (UUID)
      inviteLink              // Column I: Invite link
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
      // Use internal data for backend operations
      const internalData = invitation._internal;
      
      // Always update date, but only update status if it's "Создано"
      if (internalData.status === 'Создано') {
        await updateInvitationStatus(internalData, 'Просмотрено', c.env);
      } else {
        // Just update the date without changing status
        await updateInvitationDate(internalData, c.env);
      }
      
      // Return only filtered public data to frontend
      return c.json({ 
        success: true, 
        invitation: invitation.data  // This is the filtered publicData
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

    // Update the existing invitation row using internal data
    const result = await updateInvitationRSVP(uuid, {
      attendance,
      name: name?.trim() || invitation.data.name,  // Use filtered data for fallback
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

// Helper function to get current date/time in Asia/Almaty timezone
function getCurrentDateTime() {
  const now = new Date();
  const almatyTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Almaty"}));
  return `${almatyTime.getMonth() + 1}/${almatyTime.getDate()}/${almatyTime.getFullYear()} ${almatyTime.getHours().toString().padStart(2, '0')}:${almatyTime.getMinutes().toString().padStart(2, '0')}:${almatyTime.getSeconds().toString().padStart(2, '0')}`;
}

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
    
    // Find the row with matching UUID (column H, index 7)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][7] === uuid) { // Column H contains UUID
        // Full internal data structure for backend operations
        const fullData = {
          rowIndex: i + 1, // 1-based index for Google Sheets
          status: rows[i][0] || '',          // Column A: Status
          timestamp: rows[i][1] || '',       // Column B: Date/time (PRIVATE)
          adminName: rows[i][2] || '',       // Column C: Admin name (PRIVATE)
          name: rows[i][3] || '',            // Column D: User name
          adminComment: rows[i][4] || '',    // Column E: Admin comment (PRIVATE)
          guest: rows[i][5] || '',           // Column F: Additional guests
          message: rows[i][6] || '',         // Column G: User message
          uuid: rows[i][7] || '',            // Column H: Service info (PRIVATE)
          inviteLink: rows[i][8] || ''       // Column I: Invite link (PRIVATE)
        };
        
        // Filtered data for frontend - ONLY user-safe fields
        const publicData = {
          status: fullData.status,           // Column A: Status
          name: fullData.name,               // Column D: User name
          guest: fullData.guest,             // Column F: Additional guests
          message: fullData.message          // Column G: User message
        };
        
        return { 
          success: true, 
          data: publicData,                  // Send only filtered data to frontend
          _internal: fullData                // Keep full data for backend operations
        };
      }
    }
    
    return { success: false, error: 'UUID not found' };

  } catch (error) {
    console.error('Error finding invitation:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to update invitation date only (keep existing status)
async function updateInvitationDate(invitationData, env) {
  try {
    const sheets = await getSheets(env);

    // Prepare updated data with new timestamp but keep existing status
    const timestamp = getCurrentDateTime();
    
    const updatedRow = [
      invitationData.status,         // Column A: Status (keep original)
      timestamp,                     // Column B: Date/time (updated)
      invitationData.adminName,      // Column C: Admin name (keep original)
      invitationData.name,           // Column D: User name (keep original)
      invitationData.adminComment,   // Column E: Admin comment (keep original)
      invitationData.guest,          // Column F: Additional guests (keep original)
      invitationData.message,        // Column G: User message (keep original)
      invitationData.uuid,           // Column H: Service info/UUID (keep original)
      invitationData.inviteLink      // Column I: Invite link (keep original)
    ];

    // Update the specific row
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `Sheet1!A${invitationData.rowIndex}:I${invitationData.rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [updatedRow],
        majorDimension: 'ROWS'
      }
    });

    console.log('Google Sheets date update response:', updateResult.data);
    return { success: true, result: updateResult.data };

  } catch (error) {
    console.error('Error updating invitation date:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to update invitation status only
async function updateInvitationStatus(invitationData, status, env) {
  try {
    const sheets = await getSheets(env);

    // Prepare updated data with new status and timestamp
    const timestamp = getCurrentDateTime();
    
    const updatedRow = [
      status,                        // Column A: Status (updated)
      timestamp,                     // Column B: Date/time (updated)
      invitationData.adminName,      // Column C: Admin name (keep original)
      invitationData.name,           // Column D: User name (keep original)
      invitationData.adminComment,   // Column E: Admin comment (keep original)
      invitationData.guest,          // Column F: Additional guests (keep original)
      invitationData.message,        // Column G: User message (keep original)
      invitationData.uuid,           // Column H: Service info/UUID (keep original)
      invitationData.inviteLink      // Column I: Invite link (keep original)
    ];

    // Update the specific row
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `Sheet1!A${invitationData.rowIndex}:I${invitationData.rowIndex}`,
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
    
    // Use internal data for backend operations
    const internalData = invitation._internal;

    // Prepare updated data
    const timestamp = getCurrentDateTime();
    
    const statusText = rsvpData.attendance === 'yes' ? 'Принято' : 'Отклонено';
    
    const updatedRow = [
      statusText,                    // Column A: Status
      timestamp,                     // Column B: Date/time (updated)
      internalData.adminName,        // Column C: Admin name (keep original)
      rsvpData.name,                // Column D: User name (updated by user)
      internalData.adminComment,     // Column E: Admin comment (keep original)
      rsvpData.guest,               // Column F: Additional guests (updated by user)
      rsvpData.message,             // Column G: User message (updated by user)
      internalData.uuid,             // Column H: Service info/UUID (keep original)
      internalData.inviteLink        // Column I: Invite link (keep original)
    ];

    // Update the specific row
    const updateResult = await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `Sheet1!A${internalData.rowIndex}:I${internalData.rowIndex}`,
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

