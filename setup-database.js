const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function setupDatabase() {
    try {
        console.log(' Testing database connection...');
        
        // Test the connection
        await prisma.$connect();
        console.log(' Database connection successful!');
        
        // Check if tables exist by trying to query them
        console.log('\n Checking database schema...');
        
        try {
            const artistCount = await prisma.artist.count();
            console.log(` Artists table exists (${artistCount} records)`);
        } catch (error) {
            console.log(' Artists table not found - you need to run migrations');
        }
        
        try {
            const albumCount = await prisma.album.count();
            console.log(` Albums table exists (${albumCount} records)`);
        } catch (error) {
            console.log(' Albums table not found - you need to run migrations');
        }
        
        try {
            const trackCount = await prisma.track.count();
            console.log(` Tracks table exists (${trackCount} records)`);
        } catch (error) {
            console.log(' Tracks table not found - you need to run migrations');
        }
        
        try {
            const playlistCount = await prisma.playlist.count();
            console.log(` Playlists table exists (${playlistCount} records)`);
        } catch (error) {
            console.log(' Playlists table not found - you need to run migrations');
        }
        
        console.log('\n Next steps:');
        console.log('1. If tables don\'t exist, run: npm run db:migrate');
        console.log('2. Generate Prisma client: npm run db:generate');
        console.log('3. Seed the database: npm run seed');
        console.log('4. View data in Prisma Studio: npm run db:studio');
        
    } catch (error) {
        console.error(' Database connection failed:', error.message);
        console.log('\n Troubleshooting:');
        console.log('1. Check your DATABASE_URL in .env file');
        console.log('2. Ensure Azure SQL Database is running');
        console.log('3. Verify firewall rules allow your IP');
        console.log('4. Check username/password in connection string');
    } finally {
        await prisma.$disconnect();
    }
}

// Run setup if called directly
if (require.main === module) {
    setupDatabase();
}

module.exports = setupDatabase;
