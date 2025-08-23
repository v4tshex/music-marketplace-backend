const axios = require('axios');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize Azure Blob Storage client (optional for local development)
let blobServiceClient = null;
let containerClient = null;

if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    try {
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        containerClient = blobServiceClient.getContainerClient('album-covers');
        console.log('Azure Blob Storage initialized');
    } catch (error) {
        console.warn('Azure Blob Storage initialization failed:', error.message);
        console.warn('   Album covers will not be downloaded (local development mode)');
    }
} else {
    console.log('No Azure Storage connection string found - running in local development mode');
}

// Ensure the album-covers container exists
async function ensureContainerExists() {
    if (!containerClient) {
        console.log('Skipping blob container creation (no Azure Storage configured)');
        return;
    }
    
    try {
        const exists = await containerClient.exists();
        if (!exists) {
            await containerClient.create();
            console.log('Created album-covers container in blob storage');
        } else {
            console.log('Album-covers container already exists');
        }
    } catch (error) {
        console.error('Error ensuring container exists:', error.message);
        console.log('Continuing without blob storage...');
    }
}

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PLAYLIST_ID = '6WQ2yb15wZ6fST8PAWrYrw';

// Rate limiting configuration
const RATE_LIMIT_DELAY = 1000; // 1 second delay between requests
const MAX_TRACKS_PER_REQUEST = 100; // Spotify allows up to 100 tracks per request

class SpotifySeeder {
    constructor() {
        this.accessToken = null;
        this.tokenExpiry = null;
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
            
            console.log('Spotify access token obtained successfully');
            return this.accessToken;
        } catch (error) {
            console.error('Error getting Spotify access token:', error.response?.data || error.message);
            throw error;
        }
    }

    // Fetch playlist data from Spotify with pagination
    async fetchPlaylist(playlistId, limit = 100) {
        try {
            const token = await this.getAccessToken();
            
            console.log(`Fetching playlist ${playlistId}...`);
            
            // First, get the playlist metadata
            const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const playlist = playlistResponse.data;
            const totalTracks = playlist.tracks.total;
            
            console.log(`Playlist: "${playlist.name}" by ${playlist.owner.display_name}`);
            console.log(`Total tracks: ${totalTracks}`);
            console.log(`Fetching all tracks in batches of ${limit}...`);
            
            // Calculate estimated time (assuming 1 second per batch)
            const estimatedBatches = Math.ceil(totalTracks / limit);
            const estimatedTime = Math.ceil(estimatedBatches * RATE_LIMIT_DELAY / 1000);
            console.log(`Estimated time: ~${estimatedTime} seconds (${estimatedBatches} batches)`);
            
            // Fetch all tracks using pagination
            const allTracks = [];
            let offset = 0;
            let batchNumber = 1;
            
            while (offset < totalTracks) {
                console.log(`   Fetching batch ${batchNumber}: tracks ${offset + 1}-${Math.min(offset + limit, totalTracks)}`);
                
                const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    params: {
                        limit: limit,
                        offset: offset
                    }
                });
                
                const batchTracks = tracksResponse.data.items;
                allTracks.push(...batchTracks);
                
                console.log(`   Batch ${batchNumber} fetched: ${batchTracks.length} tracks`);
                
                offset += limit;
                batchNumber++;
                
                // Add delay between batches to respect rate limits
                if (offset < totalTracks) {
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                }
            }
            
            // Replace the tracks.items with our complete list
            playlist.tracks.items = allTracks;
            playlist.tracks.total = allTracks.length;
            
            console.log(`All ${allTracks.length} tracks fetched successfully!`);
            
            return playlist;
        } catch (error) {
            console.error('Error fetching playlist:', error.response?.data || error.message);
            throw error;
        }
    }

    // Process and upsert artist data
    async upsertArtist(artistData) {
        try {
            const artist = await prisma.artist.upsert({
                where: { spotify_id: artistData.id },
                update: {
                    name: artistData.name,
                    spotify_url: artistData.external_urls?.spotify,
                    popularity: artistData.popularity,
                    updated_at: new Date()
                },
                create: {
                    spotify_id: artistData.id,
                    name: artistData.name,
                    spotify_url: artistData.external_urls?.spotify,
                    popularity: artistData.popularity
                }
            });
            return artist;
        } catch (error) {
            console.error(` Error upserting artist ${artistData.name}:`, error.message);
            throw error;
        }
    }

    // Process and upsert album data
    async upsertAlbum(albumData) {
        try {
            const album = await prisma.album.upsert({
                where: { spotify_id: albumData.id },
                update: {
                    name: albumData.name,
                    album_type: albumData.album_type,
                    total_tracks: albumData.total_tracks,
                    release_date: albumData.release_date,
                    release_date_precision: albumData.release_date_precision,
                    spotify_url: albumData.external_urls?.spotify,
                    updated_at: new Date()
                },
                create: {
                    spotify_id: albumData.id,
                    name: albumData.name,
                    album_type: albumData.album_type,
                    total_tracks: albumData.total_tracks,
                    release_date: albumData.release_date,
                    release_date_precision: albumData.release_date_precision,
                    spotify_url: albumData.external_urls?.spotify
                }
            });
            return album;
        } catch (error) {
            console.error(` Error upserting album ${albumData.name}:`, error.message);
            throw error;
        }
    }

    // Create album-artist relationships
    async createAlbumArtistRelations(albumId, artistIds) {
        try {
            for (const artistId of artistIds) {
                await prisma.albumArtist.upsert({
                    where: {
                        album_id_artist_id: {
                            album_id: albumId,
                            artist_id: artistId
                        }
                    },
                    update: {},
                    create: {
                        album_id: albumId,
                        artist_id: artistId
                    }
                });
            }
        } catch (error) {
            console.error(' Error creating album-artist relationships:', error.message);
            throw error;
        }
    }

    // Process and upsert track data
    async upsertTrack(trackData, albumId) {
        try {
            const track = await prisma.track.upsert({
                where: { spotify_id: trackData.id },
                update: {
                    name: trackData.name,
                    track_number: trackData.track_number,
                    disc_number: trackData.disc_number,
                    duration_ms: trackData.duration_ms,
                    popularity: trackData.popularity,
                    preview_url: trackData.preview_url,
                    spotify_url: trackData.external_urls?.spotify,
                    isrc: trackData.external_ids?.isrc,
                    explicit: trackData.explicit,
                    available_markets: trackData.available_markets?.join(',') || null,
                    updated_at: new Date()
                },
                create: {
                    spotify_id: trackData.id,
                    name: trackData.name,
                    album_id: albumId,
                    track_number: trackData.track_number,
                    disc_number: trackData.disc_number,
                    duration_ms: trackData.duration_ms,
                    popularity: trackData.popularity,
                    preview_url: trackData.preview_url,
                    spotify_url: trackData.external_urls?.spotify,
                    isrc: trackData.external_ids?.isrc,
                    explicit: trackData.explicit,
                    available_markets: trackData.available_markets?.join(',') || null
                }
            });
            return track;
        } catch (error) {
            console.error(` Error upserting track ${trackData.name}:`, error.message);
            throw error;
        }
    }

    // Create track-artist relationships
    async createTrackArtistRelations(trackId, artistIds) {
        try {
            for (const artistId of artistIds) {
                await prisma.trackArtist.upsert({
                    where: {
                        track_id_artist_id: {
                            track_id: trackId,
                            artist_id: artistId
                        }
                    },
                    update: {},
                    create: {
                        track_id: trackId,
                        artist_id: artistId
                    }
                });
            }
        } catch (error) {
            console.error(' Error creating track-artist relationships:', error.message);
            throw error;
        }
    }

    // Download and store album cover in blob storage
    async downloadAndStoreAlbumCover(albumData, albumId) {
        if (!containerClient) {
            console.log(' Skipping album cover download (no Azure Storage configured)');
            return null;
        }

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

            return media;
        } catch (error) {
            console.error(`    Error downloading album cover:`, error.message);
            return null;
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

    // Process and upsert playlist data
    async upsertPlaylist(playlistData) {
        try {
            const playlist = await prisma.playlist.upsert({
                where: { spotify_id: playlistData.id },
                update: {
                    name: playlistData.name,
                    description: playlistData.description,
                    owner_id: playlistData.owner.id,
                    owner_name: playlistData.owner.display_name,
                    owner_url: playlistData.owner.external_urls?.spotify,
                    public: playlistData.public,
                    collaborative: playlistData.collaborative,
                    total_tracks: playlistData.tracks.total,
                    spotify_url: playlistData.external_urls?.spotify,
                    updated_at: new Date()
                },
                create: {
                    spotify_id: playlistData.id,
                    name: playlistData.name,
                    description: playlistData.description,
                    owner_id: playlistData.owner.id,
                    owner_name: playlistData.owner.display_name,
                    owner_url: playlistData.owner.external_urls?.spotify,
                    public: playlistData.public,
                    collaborative: playlistData.collaborative,
                    total_tracks: playlistData.tracks.total,
                    spotify_url: playlistData.external_urls?.spotify
                }
            });
            return playlist;
        } catch (error) {
            console.error(` Error upserting playlist ${playlistData.name}:`, error.message);
            throw error;
        }
    }

    // Create playlist-track relationships
    async createPlaylistTrackRelations(playlistId, tracks, addedAt) {
        try {
            for (let i = 0; i < tracks.length; i++) {
                const trackItem = tracks[i];
                const track = await prisma.track.findUnique({
                    where: { spotify_id: trackItem.track.id }
                });

                if (track) {
                    await prisma.playlistTrack.upsert({
                        where: {
                            playlist_id_track_id_position: {
                                playlist_id: playlistId,
                                track_id: track.id,
                                position: i + 1
                            }
                        },
                        update: {
                            added_at: new Date(trackItem.added_at),
                            added_by_id: trackItem.added_by?.id || null,
                            added_by_name: trackItem.added_by?.display_name || null,
                            position: i + 1
                        },
                        create: {
                            playlist_id: playlistId,
                            track_id: track.id,
                            added_at: new Date(trackItem.added_at),
                            added_by_id: trackItem.added_by?.id || null,
                            added_by_name: trackItem.added_by?.display_name || null,
                            position: i + 1
                        }
                    });
                }
            }
        } catch (error) {
            console.error(' Error creating playlist-track relationships:', error.message);
            throw error;
        }
    }

    // Process tracks and insert into database
    async processTracks(playlist) {
        const tracks = playlist.tracks.items;
        const processedData = {
            artists: new Map(),
            albums: new Map(),
            tracks: [],
            playlist: null
        };

        console.log('\n Processing tracks and inserting into database...');

        try {
            // First, upsert the playlist
            processedData.playlist = await this.upsertPlaylist(playlist);
            console.log(` Playlist "${processedData.playlist.name}" processed`);

            // Process each track
            for (let i = 0; i < tracks.length; i++) {
                const trackItem = tracks[i];
                const track = trackItem.track;
                
                // Show progress every 100 tracks or for the last track
                if (i % 100 === 0 || i === tracks.length - 1) {
                    const progress = ((i + 1) / tracks.length * 100).toFixed(1);
                    console.log(`\n Progress: ${progress}% (${i + 1}/${tracks.length})`);
                }
                
                console.log(` Processing track ${i + 1}/${tracks.length}: ${track.name}`);

                // Process artists
                const artistIds = [];
                for (const artist of track.artists) {
                    const processedArtist = await this.upsertArtist(artist);
                    artistIds.push(processedArtist.id);
                    processedData.artists.set(artist.id, processedArtist);
                }

                // Process album
                const processedAlbum = await this.upsertAlbum(track.album);
                processedData.albums.set(track.album.id, processedAlbum);
                console.log(`    Album: ${processedAlbum.name}`);

                // Download and store album cover (only if we haven't processed this album before)
                const albumKey = track.album.id;
                if (!processedData.albums.has(albumKey)) {
                    await this.downloadAndStoreAlbumCover(track.album, processedAlbum.id);
                } else {
                    console.log('    Album cover already processed');
                }

                // Create album-artist relationships
                await this.createAlbumArtistRelations(processedAlbum.id, artistIds);

                // Process track
                const processedTrack = await this.upsertTrack(track, processedAlbum.id);
                processedData.tracks.push(processedTrack);
                console.log(`    Track: ${processedTrack.name}`);

                // Create track-artist relationships
                await this.createTrackArtistRelations(processedTrack.id, artistIds);

                // Add delay to respect rate limits
                if (i < tracks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                }
            }

            // Create playlist-track relationships
            console.log('\n Creating playlist-track relationships...');
            await this.createPlaylistTrackRelations(processedData.playlist.id, tracks, playlist.tracks.items[0]?.added_at);

            console.log('\n All tracks processed and inserted successfully!');
            return processedData;

        } catch (error) {
            console.error(' Error processing tracks:', error.message);
            throw error;
        }
    }

    // Display summary of processed data
    displaySummary(processedData) {
        console.log('\n DATABASE SEEDING SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Playlist: ${processedData.playlist.name}`);
        console.log(`Albums processed: ${processedData.albums.size}`);
        console.log(`Artists processed: ${processedData.artists.size}`);
        console.log(`Tracks processed: ${processedData.tracks.length}`);
        
        console.log('\n TRACKS INSERTED:');
        console.log('='.repeat(50));
        processedData.tracks.forEach((track, index) => {
            console.log(`${index + 1}. ${track.name}`);
        });
    }

    // Main seeding function
    async seedDatabase() {
        const startTime = Date.now();
        
        try {
            console.log(' Starting Spotify playlist seeding to database...');
            console.log(` Playlist ID: ${PLAYLIST_ID}`);
            console.log(' Fetching ALL tracks from playlist...');
            console.log('');
            console.log(' What will be created:');
            console.log('   • Artists from Spotify');
            console.log('   • Albums with metadata');
            console.log('   • Tracks with full details');
            console.log('   • Playlist information');
            console.log('   • Album covers (if Azure Storage configured)');
            console.log('   • All relationships between entities');
            console.log('');

            // Fetch playlist data (all tracks)
            const playlist = await this.fetchPlaylist(PLAYLIST_ID);
            
            // Process tracks and insert into database
            const processedData = await this.processTracks(playlist);
            
            // Display summary
            this.displaySummary(processedData);
            
            const totalTime = Math.round((Date.now() - startTime) / 1000);
            console.log(`\n  Total processing time: ${totalTime} seconds`);
            console.log('\n Database seeding completed successfully!');
            
            return processedData;
        } catch (error) {
            console.error(' Seeding failed:', error.message);
            throw error;
        }
    }
}

// Main execution
async function main() {
    console.log(' Checking environment configuration...');
    
    // Check if required environment variables are set
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        console.error(' Missing required environment variables:');
        console.error('   SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env file');
        console.error('');
        console.error('To get these credentials:');
        console.error('1. Go to https://developer.spotify.com/dashboard');
        console.error('2. Create a new app');
        console.error('3. Copy Client ID and Client Secret');
        console.error('4. Add them to your .env file');
        process.exit(1);
    }
    
    // Check database connection
    if (!process.env.DATABASE_URL) {
        console.error(' Missing DATABASE_URL environment variable');
        console.error('   Please set DATABASE_URL in your .env file');
        process.exit(1);
    }
    
    console.log(' Environment configuration looks good');

    const seeder = new SpotifySeeder();
    
    try {
        // Test database connection
        console.log(' Testing database connection...');
        await prisma.$connect();
        console.log(' Database connection successful');
        
        // Ensure blob storage container exists
        await ensureContainerExists();
        
        // Fetch all tracks from playlist
        await seeder.seedDatabase();
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

module.exports = SpotifySeeder;
