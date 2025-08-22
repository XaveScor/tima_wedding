# Wedding RSVP Cloudflare Worker

This Cloudflare Worker handles RSVP form submissions for the wedding website and saves responses to Google Sheets.

## Features

- ✅ **CORS Support**: Handles cross-origin requests from the wedding website
- ✅ **Google Sheets Integration**: Saves RSVP data directly to Google Sheets
- ✅ **Service Account Authentication**: Secure authentication without user consent
- ✅ **Russian Language Support**: All messages in Russian
- ✅ **Input Validation**: Validates required fields and sanitizes data
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Auto-deployment**: GitHub Actions for CI/CD

## Configuration

### Environment Variables (in wrangler.toml)

```toml
GOOGLE_SHEETS_ID = "1W8QfsgzJn-f6ZMX6S9l1A6jG2a3jABfeegIloJgo1e0"
GOOGLE_SERVICE_ACCOUNT_EMAIL = "tima-wedding@tima-wedding.iam.gserviceaccount.com"
GOOGLE_PROJECT_ID = "tima-wedding"
```

### Secrets (in Cloudflare Worker Dashboard)

- `GOOGLE_PRIVATE_KEY`: Service account private key from Google Cloud Console

## API Endpoints

### POST /

Handles wedding RSVP form submissions.

**Request Body:**
```json
{
  "attendance": "yes|no",
  "name": "string (required)",
  "guest": "string (optional)",
  "message": "string (optional)"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Ответ отправлен! Спасибо за подтверждение!"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message in Russian"
}
```

## Google Sheets Format

The worker appends data to your Google Sheet with the following columns:

| Column A | Column B | Column C | Column D | Column E |
|----------|----------|----------|----------|----------|
| Timestamp | Attendance | Name | Guest Name | Message |

Example row:
```
22.08.2025, 14:30 | Обязательно буду! | Иван Иванов | Мария Иванова | Будем рады участвовать!
```

## Deployment

### Automatic Deployment (GitHub Actions)

The worker is automatically deployed when changes are pushed to the `worker/` directory:

1. Push changes to the `master` branch
2. GitHub Actions runs the deployment workflow
3. Worker is deployed to Cloudflare

### Manual Deployment

```bash
cd worker
npm install
npx wrangler deploy
```

## Development

### Local Development

```bash
cd worker
npm install
npx wrangler dev
```

This will start a local development server at `http://localhost:8787`

### Testing

You can test the worker using curl:

```bash
curl -X POST https://tima-wedding.xavescor.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "attendance": "yes",
    "name": "Test User",
    "guest": "Test Guest",
    "message": "Test message"
  }'
```

## Security

- ✅ **Service Account**: Uses Google Service Account for secure API access
- ✅ **Private Key**: Stored securely as Cloudflare Worker secret
- ✅ **CORS**: Configured to allow requests from wedding website
- ✅ **Input Validation**: All user inputs are validated and sanitized

## Troubleshooting

### Common Issues

1. **"Failed to get access token"**
   - Check that `GOOGLE_PRIVATE_KEY` is properly set in Cloudflare secrets
   - Ensure the private key includes the full PEM format with headers

2. **"API error: 403"**
   - Verify that the service account has access to the Google Sheet
   - Check that the sheet ID is correct in `wrangler.toml`

3. **"Method not allowed"**
   - Ensure you're making POST requests, not GET requests

### Logs

Check Cloudflare Worker logs in the dashboard:
1. Go to Workers & Pages
2. Select `tima-wedding`
3. Go to "Logs" tab

## Support

For issues or questions, check the GitHub repository or Cloudflare Worker logs.