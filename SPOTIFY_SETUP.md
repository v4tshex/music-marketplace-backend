# Spotify API Setup Guide

## Prerequisites

To use the Spotify seeder script, you need to create a Spotify Developer account and get API credentials.

## Step 1: Create Spotify Developer Account

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account (or create one if you don't have it)
3. Accept the terms of service

## Step 2: Create a New App

1. Click "Create App" button
2. Fill in the app details:
   - **App name**: `Music Marketplace Seeder` (or any name you prefer)
   - **App description**: `Script to seed music database from Spotify playlists`
   - **Website**: `http://localhost:3000` (or your local development URL)
   - **Redirect URI**: `http://localhost:3000/callback` (or leave blank for now)
   - **API/SDKs**: Check "Web API"
3. Click "Save"

## Step 3: Get Your Credentials

1. After creating the app, you'll see your app dashboard
2. Copy the **Client ID** and **Client Secret**
3. These are your API credentials

## Step 4: Add to Environment Variables

1. In your `music-marketplace-backend` directory, create or edit the `.env` file
2. Add these lines:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

3. Replace `your_client_id_here` and `your_client_secret_here` with your actual credentials

## Step 5: Run the Seeder Script

```bash
cd music-marketplace-backend
node spotify-seeder.js
```

## Important Notes

- **Rate Limits**: The script respects Spotify's rate limits (100 requests per second)
- **Client Credentials Flow**: This script uses the client credentials flow, which is perfect for server-side applications
- **No User Data**: This approach doesn't require user authentication, just app credentials
- **Public Playlists Only**: You can only access public playlists with this method

## Troubleshooting

### "Invalid client" error
- Double-check your Client ID and Client Secret
- Make sure there are no extra spaces or characters

### "Invalid redirect URI" error
- This shouldn't happen with client credentials flow
- Make sure you're using the correct credentials

### Rate limit errors
- The script includes built-in delays to respect rate limits
- If you still get rate limit errors, increase the `RATE_LIMIT_DELAY` value

## Security

- **Never commit your `.env` file to version control**
- Keep your Client Secret secure
- The client credentials flow is safe for server-side use
