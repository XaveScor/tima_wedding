# Wedding RSVP System - Google Sheets Structure

## Google Sheets Columns (A-I)

| Column | Name | Description | Example |
|--------|------|-------------|---------|
| A | Статус заявки | Status of invitation | Принято, Отклонено, Создано, Просмотрено |
| B | Дата последнего действия | Date of last action | 8/24/2025 15:14:00 |
| C | Имя | Admin-set reference name | Приглашение1 |
| D | Имя(пользователь) | User-provided actual name | Иван Петров |
| E | Комментарии | Admin comments (not visible to user) | Иван из офиса, не путать с другим Иваном |
| F | Доп люди | Additional guests (semicolon-separated) | Мария;Петр |
| G | Комментарии(пользователь) | User message/comments | Спасибо за приглашение! |
| H | Служебная инф | Service info (UUID) | 0fad6318-335e-40a5-9eda-4ae |
| I | Ссылка на приглашение | Invitation URL | https://xavescor.github.io/tima_wedding/?uuid=... |

## Status Flow

1. **Создано** - New invitation created via admin page (`create-link.html`)
2. **Просмотрено** - User opened the wedding page (viewed invitation)
3. **Принято** - User confirmed attendance (selected "Обязательно буду!")
4. **Отклонено** - User declined attendance (selected "На этот раз без меня")

### Status Transition Rules
- **Создано** → **Просмотрено**: Only when user first opens invitation page
- **Просмотрено** → **Принято/Отклонено**: When user submits RSVP
- **Принято/Отклонено**: Final states - never overwritten

### Date Column Behavior
- **Always updated** on any API call (viewing or RSVP submission)
- Tracks last activity regardless of status changes
- Updates even when status remains unchanged

## System Architecture

### Files Structure
- `index.html` - Main wedding invitation page (requires UUID parameter)
- `create-link.html` - Admin page for creating invitation links
- `worker/src/index.js` - Cloudflare Worker backend API

### Admin Interface (`create-link.html`)
- **Purpose**: Create personalized invitation links for guests with admin comments
- **Features**:
  - Name input form with validation (populates both Column C and D)
  - Optional admin comment field (Column E) - not visible to users
  - UUID generation and Google Sheets integration
  - Copy link functionality with visual feedback (button text changes)
  - Error handling for failed creations
  - Loading states during creation process
- **Usage**: Enter guest name + optional comment → Click "Создать ссылку" → Copy generated link
- **Output**: Unique invitation URL with UUID parameter
- **UX**: Non-intrusive copy confirmation via button label change (no alerts)

### API Endpoints
- `POST /create-invite` - Creates new invitation with UUID and "Создано" status (accepts name + comment)
- `GET /invite/:uuid` - Validates UUID, conditionally updates status, always updates date
  - **Security**: Returns filtered data (status, name, guest, message only)
  - **Internal**: Maintains full data access for backend operations
- `POST /` - Processes RSVP submission, updates status to "Принято"/"Отклонено"
  - **Security**: Uses internal data for admin fields, preserves confidentiality

### API Behavior Details

**GET /invite/:uuid (View Invitation):**
- Always updates date/timestamp column
- Status update logic:
  - If status = "Создано" → Update to "Просмотрено"
  - If status = "Просмотрено", "Принято", "Отклонено" → Keep unchanged
- Prevents overwriting final RSVP responses

**POST / (RSVP Submission):**
- Always updates both date and status
- Status set to "Принято" or "Отклонено" based on attendance choice
- Updates user data (Column D: user name, Column F: guests, Column G: user message)
- Preserves admin data (Column C: admin name, Column E: admin comment)

### Data Flow
1. Admin creates invitation → Status: "Создано"
2. User opens wedding page → Status: "Просмотрено" + timestamp updated (first time only)
3. User submits RSVP → Status: "Принято"/"Отклонено" + all data updated
4. User reopens invitation → Only timestamp updated (status preserved)

## Security & Data Privacy

### Frontend Data Filtering
The system implements strict data filtering to protect sensitive admin and system information:

**Frontend receives ONLY these fields:**
- ✅ **Column A (status)**: For attendance radio buttons
- ✅ **Column D (name)**: User name for form field
- ✅ **Column F (guest)**: User's additional guests  
- ✅ **Column G (message)**: User's message/comments

**Frontend NEVER receives these private fields:**
- ❌ **Column B (timestamp)**: System internal data
- ❌ **Column C (adminName)**: Admin reference name
- ❌ **Column E (adminComment)**: Confidential admin notes
- ❌ **Column H (uuid)**: System identifier  
- ❌ **Column I (inviteLink)**: System internal data

### Backend Data Access
- Worker API maintains full access to all columns for internal operations
- Update functions use complete data structure with private fields
- Only the filtered response is sent to frontend clients
- Admin comments remain completely confidential and backend-only

### Privacy Protection
- Admin organizational notes (Column E) are never exposed to users
- Users cannot see admin reference names or system identifiers
- Browser network requests only contain user-relevant data
- All sensitive system data remains server-side only

## Technical Notes

- Column H (Служебная инф) contains the UUID for identification
- All timestamps are in Asia/Almaty timezone with seconds precision (m/d/yyyy hh:mm:ss)
- UUID validation ensures only valid invitations can access the wedding page
- Google Sheets authentication is centralized in `getSheets()` function
- RSVP validation allows declining without name requirement
- Invitation page always displays Column D (user name) in the name field
- Response filtering implemented in `findInvitationByUUID()` function