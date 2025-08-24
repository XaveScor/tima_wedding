# Wedding RSVP System - Google Sheets Structure

## Google Sheets Columns (A-G)

| Column | Name | Description | Example |
|--------|------|-------------|---------|
| A | Статус заявки | Status of invitation | Принято, Отклонено, Создано, Просмотрено |
| B | Дата последнего действия | Date of last action | 8/24/2025 15:14:00 |
| C | Имя | Guest name | Приглашение1 |
| D | Дол люди | Additional guests | фев |
| E | Комментарий | Comments/messages | фывфыв |
| F | Служебная инф | Service info (UUID) | 0fad6318-335e-40a5-9eda-4ae |
| G | Invite link | Invitation URL | https://xavescor.github.io/tima_wedding/?uuid=... |

## Status Flow

1. **Создано** - New invitation created via admin page (`create-link.html`)
2. **Просмотрено** - User opened the wedding page (viewed invitation)
3. **Принято** - User confirmed attendance (selected "Обязательно буду!")
4. **Отклонено** - User declined attendance (selected "На этот раз без меня")

## System Architecture

### Files Structure
- `index.html` - Main wedding invitation page (requires UUID parameter)
- `create-link.html` - Admin page for creating invitation links
- `worker/src/index.js` - Cloudflare Worker backend API

### Admin Interface (`create-link.html`)
- **Purpose**: Create personalized invitation links for guests
- **Features**:
  - Simple name input form with validation
  - UUID generation and Google Sheets integration
  - Copy link functionality with visual feedback (button text changes)
  - Error handling for failed creations
  - Loading states during creation process
- **Usage**: Enter guest name → Click "Создать ссылку" → Copy generated link
- **Output**: Unique invitation URL with UUID parameter
- **UX**: Non-intrusive copy confirmation via button label change (no alerts)

### API Endpoints
- `POST /create-invite` - Creates new invitation with UUID and "Создано" status
- `GET /invite/:uuid` - Validates UUID, updates status to "Просмотрено", returns invitation data
- `POST /` - Processes RSVP submission, updates status to "Принято"/"Отклонено"

### Data Flow
1. Admin creates invitation → Status: "Создано"
2. User opens wedding page → Status: "Просмотрено" + timestamp updated
3. User submits RSVP → Status: "Принято"/"Отклонено" + all data updated

## Technical Notes

- Column F (Служебная инф) contains the UUID for identification
- All timestamps are in Asia/Almaty timezone
- UUID validation ensures only valid invitations can access the wedding page
- Google Sheets authentication is centralized in `getSheets()` function
- RSVP validation allows declining without name requirement