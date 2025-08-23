# Album Cover Seeder

This script fetches album covers for existing albums in your database by calling the Spotify API and storing the images in Azure Blob Storage.

##  What It Does

1. **Queries your database** for all existing albums
2. **Fetches album details** from Spotify API (including image URLs)
3. **Downloads album covers** and stores them in Azure Blob Storage
4. **Creates Media records** in your database linking albums to their covers
5. **Skips albums** that already have covers (safe to run multiple times)

##  Quick Start

### 1. Test Your Configuration
```bash
npm run test:covers
```

This will check:
-  Environment variables
-  Database connection
-  Azure Blob Storage
-  Spotify API authentication
-  Existing albums in database

### 2. Run the Album Cover Seeder
```bash
npm run seed:covers
```

##  Prerequisites

### Required Environment Variables
```env
# Spotify API (for fetching album details)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Azure Blob Storage (for storing images)
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string

# Database (for reading albums and creating media records)
DATABASE_URL=your_database_connection_string
```

### Database Requirements
-  Albums must exist in your database (run `npm run seed` first)
-  Media table must exist (run `npm run db:migrate` first)
-  Prisma client must be generated (`npm run db:generate`)

##  How It Works

### 1. Database Query
```javascript
// Fetches all albums from your database
const albums = await prisma.album.findMany({
    select: { id: true, spotify_id: true, name: true },
    orderBy: { name: 'asc' }
});
```

### 2. Spotify API Call
```javascript
// For each album, fetches details including images
const spotifyAlbum = await axios.get(
    `https://api.spotify.com/v1/albums/${spotifyId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
);
```

### 3. Image Download & Storage
```javascript
// Downloads image from Spotify
const imageResponse = await axios.get(image.url, { responseType: 'arraybuffer' });

// Uploads to Azure Blob Storage
const blockBlobClient = containerClient.getBlockBlobClient(blobName);
await blockBlobClient.upload(imageResponse.data, imageResponse.data.length);
```

### 4. Database Record Creation
```javascript
// Creates Media record linking album to cover
const media = await prisma.media.create({
    data: {
        album_id: albumId,
        type: 'album_cover',
        filename: filename,
        blob_url: blobUrl,
        spotify_url: image.url,
        height: image.height,
        width: image.width,
        file_size: imageResponse.data.length,
        mime_type: imageResponse.headers['content-type']
    }
});
```

##  Progress Tracking

The script provides detailed progress information:

```
 Progress: 25.0% (50/200)
 Processing album: Abbey Road (4aawy2smqfn11sGRrqWlE0)

    Downloading album cover: 640x640
    Album cover stored: https://yourstorage.blob.core.windows.net/album-covers/...
    Media record created: clx123abc456
    Album cover processed successfully
```

##  Safety Features

### Duplicate Prevention
-  Checks if album already has a cover before processing
-  Skips albums with existing Media records
-  Safe to run multiple times

### Error Handling
-  Continues processing if individual albums fail
-  Logs all errors for review
-  Provides detailed error summary at the end

### Rate Limiting
-  1-second delay between API calls
-  Respects Spotify API rate limits
-  Prevents API throttling

##  Performance

### Estimated Time
- **Per album**: ~1 second (API call + image download + upload)
- **100 albums**: ~1.7 minutes
- **500 albums**: ~8.3 minutes
- **1000 albums**: ~16.7 minutes

### Storage Usage
- **Typical album cover**: 50-200 KB
- **1000 album covers**: ~50-200 MB
- **Blob storage cost**: Very low (cents per month)

##  Troubleshooting

### Common Issues

#### 1. "No Azure Storage connection string found"
```bash
# Add to your .env file:
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
```

#### 2. "Spotify API authentication failed"
```bash
# Check your .env file:
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

#### 3. "Database connection failed"
```bash
# Check your .env file:
DATABASE_URL=Server=localhost,1433;Database=music_marketplace;User Id=sa;Password=...
```

#### 4. "No albums found in database"
```bash
# Run the main seeder first:
npm run seed
```

### Debug Mode
```bash
# Run with verbose logging:
DEBUG=* node album-cover-seeder.js
```

##  Output Summary

After completion, you'll see a summary like:

```
 ALBUM COVER SEEDING SUMMARY:
==================================================
Total albums: 500
Processed: 500
Success: 485
Skipped: 10
Failed: 5

 ERRORS ENCOUNTERED:
==================================================
1. Album "Unknown Album": Spotify fetch failed
2. Album "Deleted Album": No cover available
...
```

##  Next Steps

After running the album cover seeder:

1. **Verify in Prisma Studio**: `npm run db:studio`
2. **Check Media table** for album cover records
3. **Verify blob storage** contains the images
4. **Test your frontend** to display album covers

##  Re-running

The script is safe to run multiple times:

-  **New albums** will get covers
-  **Existing covers** will be skipped
-  **Failed albums** will be retried
-  **No duplicate records** will be created

##  Tips

1. **Run during off-peak hours** for large datasets
2. **Monitor Azure costs** (very low for image storage)
3. **Keep Spotify credentials** secure in .env file
4. **Test with small batches** first if unsure
5. **Check blob storage** permissions before running

##  Support

If you encounter issues:

1. Run `npm run test:covers` to diagnose
2. Check the error logs in the output
3. Verify all environment variables are set
4. Ensure database and blob storage are accessible
5. Check Spotify API quota limits

---

**Happy seeding! **
