const { PrismaClient } = require('@prisma/client');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

async function testCoverSeeder() {
    console.log(' Testing Album Cover Seeder Configuration...');
    console.log('='.repeat(50));
    
    // Test 1: Environment Variables
    console.log('\n1. Environment Variables:');
    const requiredVars = [
        'SPOTIFY_CLIENT_ID',
        'SPOTIFY_CLIENT_SECRET', 
        'AZURE_STORAGE_CONNECTION_STRING',
        'DATABASE_URL'
    ];
    
    let envOk = true;
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            console.log(`    ${varName}: ${value.substring(0, 20)}...`);
        } else {
            console.log(`    ${varName}: Missing`);
            envOk = false;
        }
    });
    
    if (!envOk) {
        console.log('\n Missing required environment variables');
        return;
    }
    
    // Test 2: Database Connection
    console.log('\n2. Database Connection:');
    const prisma = new PrismaClient();
    let albumCount = 0;
    
    try {
        await prisma.$connect();
        console.log('    Database connection successful');
        
        // Test 3: Check for existing albums
        console.log('\n3. Database Content:');
        albumCount = await prisma.album.count();
        const mediaCount = await prisma.media.count();
        
        console.log(`    Albums in database: ${albumCount}`);
        console.log(`    Media records: ${mediaCount}`);
        
        if (albumCount === 0) {
            console.log('    No albums found - run the main seeder first');
        } else {
            console.log('    Albums found - ready to fetch covers');
        }
        
        // Test 4: Check for existing album covers
        if (albumCount > 0) {
            const albumsWithCovers = await prisma.media.count({
                where: { type: 'album_cover' }
            });
            
            const albumsWithoutCovers = albumCount - albumsWithCovers;
            console.log(`    Albums with covers: ${albumsWithCovers}`);
            console.log(`    Albums without covers: ${albumsWithoutCovers}`);
            
            if (albumsWithoutCovers > 0) {
                console.log(`    Ready to fetch ${albumsWithoutCovers} album covers`);
            } else {
                console.log('    All albums already have covers');
            }
        }
        
    } catch (error) {
        console.log(`    Database connection failed: ${error.message}`);
    } finally {
        await prisma.$disconnect();
    }
    
    // Test 5: Azure Blob Storage
    console.log('\n4. Azure Blob Storage:');
    
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING
        );
        
        const containerClient = blobServiceClient.getContainerClient('album-covers');
        const exists = await containerClient.exists();
        
        if (exists) {
            console.log('    album-covers container exists');
        } else {
            console.log('    album-covers container will be created');
        }
        
        console.log('    Azure Blob Storage connection successful');
        
    } catch (error) {
        console.log(`    Azure Blob Storage failed: ${error.message}`);
    }
    
    // Test 6: Spotify API (basic test)
    console.log('\n5. Spotify API:');
    
    try {
        const axios = require('axios');
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
                }
            }
        );
        
        if (response.data.access_token) {
            console.log('    Spotify API authentication successful');
            console.log(`   ⏰ Token expires in: ${response.data.expires_in} seconds`);
        } else {
            console.log('    Spotify API authentication failed');
        }
        
    } catch (error) {
        console.log(`    Spotify API test failed: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(' Next Steps:');
    
    if (envOk && albumCount > 0) {
        console.log('    Run: npm run seed:covers');
    } else if (albumCount === 0) {
        console.log('    Run: npm run seed (to get albums first)');
        console.log('    Then: npm run seed:covers (to get covers)');
    } else {
        console.log('    Fix environment variables first');
    }
    
    console.log('\n Test completed!');
}

testCoverSeeder();
