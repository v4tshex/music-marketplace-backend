const axios = require('axios');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize Azure Blob Storage client
let blobServiceClient = null;
let containerClient = null;

if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    try {
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        containerClient = blobServiceClient.getContainerClient('album-covers');
        console.log(' Azure Blob Storage initialized');
    } catch (error) {
        console.warn(' Azure Blob Storage initialization failed:', error.message);
        console.warn('   Album covers will not be downloaded');
    }
} else {
    console.log(' No Azure Storage connection string found');
    console.log('   Please set AZURE_STORAGE_CONNECTION_STRING in your .env file');
    process.exit(1);
}

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests

class AlbumCoverSeeder {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
        this.stats = {
            total: 0,
            processed: 0,
            success: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };
    }

    // Get Spotify access token using client credentials flow
    async getAccessToken() {
        try {
            // Check if we have a valid token
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                return this.accessToken;
            }

            const response = await axios.post('https://accounts.spotify.com/api/token', 
                'grant_type=client_credentials',
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            console.log(' Spotify access token obtained successfully');
            return this.accessToken;
        } catch (error) {
            console.error(' Error getting Spotify access token:', error.response?.data || error.message);
            throw error;
        }
    }

    // Ensure the album-covers container exists
    async ensureContainerExists() {
        try {
            const exists = await containerClient.exists();
            if (!exists) {
                await containerClient.create();
                console.log(' Created album-covers container in blob storage');
            } else {
                console.log(' Album-covers container already exists');
            }
        } catch (error) {
            console.error(' Error ensuring container exists:', error.message);
            throw error;
        }
    }

    // Get image extension from MIME type
    getImageExtension(mimeType) {
        switch (mimeType) {
            case 'image/jpeg':
            case 'image/jpg':
                return 'jpg';
            case 'image/png':
                return 'png';
            case 'image/webp':
                return 'webp';
            default:
                return 'jpg';
        }
    }

    // Download and store album cover in blob storage
    async downloadAndStoreAlbumCover(albumData, albumId) {
        try {
            if (!albumData.images || albumData.images.length === 0) {
                console.log('    No album cover available');
                return null;
            }

            // Get the highest quality image (usually the first one)
            const image = albumData.images[0];
            console.log(`    Downloading album cover: ${image.width}x${image.height}`);

            // Download the image
            const imageResponse = await axios.get(image.url, {
                responseType: 'arraybuffer'
            });

            // Generate unique filename
            const fileExtension = this.getImageExtension(imageResponse.headers['content-type']);
            const filename = `${uuidv4()}.${fileExtension}`;
            const blobName = `album-covers/${filename}`;

            // Upload to blob storage
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(imageResponse.data, imageResponse.data.length, {
                blobHTTPHeaders: {
                    blobContentType: imageResponse.headers['content-type']
                }
            });

            const blobUrl = blockBlobClient.url;
            console.log(`    Album cover stored: ${blobUrl}`);

            // Create media record in database
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

            console.log(`    Media record created: ${media.id}`);
            return media;
        } catch (error) {
            console.error(`    Error downloading album cover:`, error.message);
            throw error;
        }
    }

    // Fetch album details from Spotify API
    async fetchAlbumFromSpotify(spotifyId) {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(`https://api.spotify.com/v1/albums/${spotifyId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`    Album not found on Spotify: ${spotifyId}`);
                return null;
            }
            throw error;
        }
    }

    // Process a single album
    async processAlbum(album) {
        try {
            console.log(`\n Processing album: ${album.name} (${album.spotify_id})`);
            
            // Check if album already has a cover
            const existingMedia = await prisma.media.findFirst({
                where: {
                    album_id: album.id,
                    type: 'album_cover'
                }
            });

            if (existingMedia) {
                console.log(`    Album cover already exists, skipping`);
                this.stats.skipped++;
                return;
            }

            // Fetch album details from Spotify
            const spotifyAlbum = await this.fetchAlbumFromSpotify(album.spotify_id);
            
            if (!spotifyAlbum) {
                console.log(`    Could not fetch album from Spotify, skipping`);
                this.stats.failed++;
                this.stats.errors.push(`Album ${album.name}: Spotify fetch failed`);
                return;
            }

            // Download and store album cover
            const media = await this.downloadAndStoreAlbumCover(spotifyAlbum, album.id);
            
            if (media) {
                console.log(`    Album cover processed successfully`);
                this.stats.success++;
            } else {
                console.log(`    No album cover available`);
                this.stats.failed++;
                this.stats.errors.push(`Album ${album.name}: No cover available`);
            }

        } catch (error) {
            console.error(`    Error processing album ${album.name}:`, error.message);
            this.stats.failed++;
            this.stats.errors.push(`Album ${album.name}: ${error.message}`);
        }
    }

    // Get all albums from database
    async getAlbumsFromDatabase() {
        try {
            console.log(' Fetching albums from database...');
            
            const albums = await prisma.album.findMany({
                select: {
                    id: true,
                    spotify_id: true,
                    name: true
                },
                orderBy: {
                    name: 'asc'
                }
            });

            console.log(` Found ${albums.length} albums in database`);
            return albums;
        } catch (error) {
            console.error(' Error fetching albums from database:', error.message);
            throw error;
        }
    }

    // Main processing function
    async processAllAlbums() {
        try {
            console.log(' Starting album cover seeding...');
            console.log(' This script will:');
            console.log('   • Fetch all albums from your database');
            console.log('   • Get album details from Spotify API');
            console.log('   • Download album covers to Azure Blob Storage');
            console.log('   • Create Media records in your database');
            console.log('');

            // Ensure blob storage container exists
            await this.ensureContainerExists();

            // Get albums from database
            const albums = await this.getAlbumsFromDatabase();
            this.stats.total = albums.length;

            if (albums.length === 0) {
                console.log(' No albums found in database');
                return;
            }

            console.log(`\n Processing ${albums.length} albums...`);
            console.log('  Estimated time: ~' + Math.ceil(albums.length * RATE_LIMIT_DELAY / 1000) + ' seconds');
            console.log('');

            // Process each album
            for (let i = 0; i < albums.length; i++) {
                const album = albums[i];
                
                // Show progress
                const progress = ((i + 1) / albums.length * 100).toFixed(1);
                console.log(`\n Progress: ${progress}% (${i + 1}/${albums.length})`);
                
                await this.processAlbum(album);
                this.stats.processed++;

                // Add delay to respect rate limits (except for the last album)
                if (i < albums.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                }
            }

            // Display summary
            this.displaySummary();

        } catch (error) {
            console.error(' Album cover seeding failed:', error.message);
            throw error;
        }
    }

    // Display processing summary
    displaySummary() {
        console.log('\n ALBUM COVER SEEDING SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Total albums: ${this.stats.total}`);
        console.log(`Processed: ${this.stats.processed}`);
        console.log(`Success: ${this.stats.success}`);
        console.log(`Skipped: ${this.stats.skipped}`);
        console.log(`Failed: ${this.stats.failed}`);
        
        if (this.stats.errors.length > 0) {
            console.log('\n ERRORS ENCOUNTERED:');
            console.log('='.repeat(50));
            this.stats.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error}`);
            });
        }
        
        console.log('\n Album cover seeding completed!');
    }
}

// Main execution
async function main() {
    console.log(' Checking environment configuration...');
    
    // Check if required environment variables are set
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        console.error(' Missing required environment variables:');
        console.error('   SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env file');
        process.exit(1);
    }
    
    if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
        console.error(' Missing AZURE_STORAGE_CONNECTION_STRING environment variable');
        console.error('   This is required for storing album covers');
        process.exit(1);
    }
    
    if (!process.env.DATABASE_URL) {
        console.error(' Missing DATABASE_URL environment variable');
        process.exit(1);
    }
    
    console.log(' Environment configuration looks good');

    const seeder = new AlbumCoverSeeder();
    
    try {
        // Test database connection
        console.log(' Testing database connection...');
        await prisma.$connect();
        console.log(' Database connection successful');
        
        // Process all albums
        await seeder.processAllAlbums();
        
    } catch (error) {
        console.error(' Script execution failed:', error.message);
        process.exit(1);
    } finally {
        // Close Prisma connection
        await prisma.$disconnect();
        console.log(' Database connection closed');
    }
}

// Run the script if called directly
if (require.main === module) {
    main();
}

module.exports = AlbumCoverSeeder;
