# Database Setup Guide

## Prerequisites

- Azure account with SQL Database access
- Node.js and npm installed

## Step 1: Create Azure SQL Database

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource"
3. Search for "SQL Database" and select it
4. Click "Create"
5. Fill in the basics:
   - **Resource group**: Create new or use existing
   - **Database name**: `music_marketplace`
   - **Server**: Create new server
     - **Server name**: `music-marketplace-server` (must be unique)
     - **Location**: Choose closest to you
     - **Authentication method**: SQL authentication
     - **Server admin login**: `admin` (or your preferred username)
     - **Password**: Create a strong password
6. Click "Next: Networking"
7. **Connectivity method**: Public endpoint
8. **Allow Azure services and resources to access this server**: Yes
9. **Add your client IPv4 address**: Yes (for development)
10. Click "Next: Security"
11. **Enable Microsoft Defender for SQL**: No (for development)
12. Click "Next: Additional settings"
13. **Use existing data**: No
14. Click "Next: Tags" (optional)
15. Click "Review + create"
16. Click "Create"

## Step 2: Get Connection String

1. Once deployment is complete, go to your SQL Database
2. Click "Connection strings" in the left menu
3. Copy the ADO.NET connection string
4. Replace the placeholders:
   - `{your_username}` → `admin` (or your username)
   - `{your_password}` → Your password

## Step 3: Configure Environment Variables

1. In your `music-marketplace-backend` directory, create a `.env` file
2. Add your database connection string:

```env
DATABASE_URL="sqlserver://your-server.database.windows.net:1433;database=music_marketplace;user=admin;password=your_password;encrypt=true;trustServerCertificate=false;loginTimeout=30;"
```

## Step 4: Generate Prisma Client

```bash
npx prisma generate
```

## Step 5: Run Database Migrations

```bash
npx prisma migrate dev --name init
```

## Step 6: Verify Setup

```bash
npx prisma studio
```

This will open a web interface to view your database.

## Database Schema Overview

- **Artists**: Individual musicians/bands
- **Albums**: Music albums containing tracks
- **Tracks**: Individual songs within albums
- **Playlists**: Collections of tracks
- **Junction Tables**: Handle many-to-many relationships

## Troubleshooting

### Connection Issues
- Ensure your IP is whitelisted in Azure SQL firewall rules
- Check username/password in connection string
- Verify server name and database name

### Migration Issues
- Run `npx prisma migrate reset` to start fresh
- Check Prisma logs for specific error messages

## Next Steps

1. Update the Spotify seeder script to use Prisma
2. Test data insertion
3. Build API endpoints using Prisma Client
