const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// Load environment variables
dotenv.config();

async function testSeederConfiguration() {
    console.log(' Testing Seeder Configuration');
    console.log('='.repeat(40));
    
    // Check environment variables
    console.log('\n Environment Variables:');
    console.log(`SPOTIFY_CLIENT_ID: ${process.env.SPOTIFY_CLIENT_ID ? ' Set' : ' Missing'}`);
    console.log(`SPOTIFY_CLIENT_SECRET: ${process.env.SPOTIFY_CLIENT_SECRET ? ' Set' : ' Missing'}`);
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? ' Set' : ' Missing'}`);
    console.log(`AZURE_STORAGE_CONNECTION_STRING: ${process.env.AZURE_STORAGE_CONNECTION_STRING ? ' Set' : ' Optional'}`);
    
    // Test database connection
    if (process.env.DATABASE_URL) {
        console.log('\n Testing Database Connection:');
        const prisma = new PrismaClient();
        
        try {
            await prisma.$connect();
            console.log(' Database connection successful');
            
            // Check if tables exist
            try {
                const artistCount = await prisma.artist.count();
                console.log(` Artists table exists (${artistCount} records)`);
            } catch (error) {
                console.log(' Artists table not found - run migrations first');
            }
            
            await prisma.$disconnect();
        } catch (error) {
            console.log(' Database connection failed:', error.message);
        }
    }
    
    // Check Prisma client
    console.log('\n Prisma Client:');
    try {
        const { PrismaClient } = require('@prisma/client');
        console.log(' Prisma client available');
    } catch (error) {
        console.log(' Prisma client not available:', error.message);
    }
    
    // Check other dependencies
    console.log('\n Dependencies:');
    try {
        require('axios');
        console.log(' Axios available');
    } catch (error) {
        console.log(' Axios not available:', error.message);
    }
    
    try {
        require('@azure/storage-blob');
        console.log(' Azure Storage Blob available');
    } catch (error) {
        console.log(' Azure Storage Blob not available:', error.message);
    }
    
    try {
        require('uuid');
        console.log(' UUID available');
    } catch (error) {
        console.log(' UUID not available:', error.message);
    }
    
    console.log('\n Next Steps:');
    console.log('1. Fix any missing environment variables above');
    console.log('2. Run database migrations: npm run db:migrate');
    console.log('3. Test the seeder: npm run seed');
}

// Run the test
testSeederConfiguration()
    .catch(console.error);
