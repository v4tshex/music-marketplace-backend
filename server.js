// modules
const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const dotenv = require('dotenv'); 
const { v4: uuidv4 } = require('uuid');
const admin = require('./firebase');  // firebase admin SDK
const { PrismaClient } = require('@prisma/client');
const { BlobServiceClient } = require('@azure/storage-blob');  // blob SDK
const path = require('path');
const fs = require('fs');

// environment variables
dotenv.config();
console.log("Azure Storage Connection String:", process.env.AZURE_STORAGE_CONNECTION_STRING);

const app = express();

// Configure CORS for different environments
const corsOptions = {
  origin: [
    "http://localhost:5173",  // Vite dev server
    "https://music-marketplace-frontend.onrender.com"
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));  

let blobServiceClient = null;
let containerClient = null;
try {
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        containerClient = blobServiceClient.getContainerClient('music-files');
    }
} catch (e) {
    console.warn('Azure Blob initialization skipped:', e.message);
}

// Check if container exists, and if not, create it
async function createContainerIfNotExists() {
    if (!containerClient) return;
    const exists = await containerClient.exists();
    if (!exists) {
        await containerClient.create();
        console.log('Container created successfully!');
    }
}

// Call this function when starting the app
createContainerIfNotExists();

// Set up Prisma client
const prisma = new PrismaClient();

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Basic health check
        const healthCheck = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };

        // Check database connectivity
        if (process.env.SKIP_DB_CHECK === 'true') {
            healthCheck.database = 'skipped';
        } else {
            try {
                await prisma.$queryRaw`SELECT 1`;
                healthCheck.database = 'connected';
            } catch (dbError) {
                healthCheck.database = 'disconnected';
                healthCheck.status = 'degraded';
            }
        }

        // Check Azure Blob Storage connectivity
        if (process.env.SKIP_BLOB_CHECK === 'true') {
            healthCheck.blobStorage = 'skipped';
        } else if (containerClient) {
            try {
                await containerClient.exists();
                healthCheck.blobStorage = 'connected';
            } catch (blobError) {
                healthCheck.blobStorage = 'disconnected';
                healthCheck.status = 'degraded';
            }
        } else {
            healthCheck.blobStorage = 'disconnected';
            healthCheck.status = healthCheck.status === 'ok' ? 'degraded' : healthCheck.status;
        }

        // Return appropriate HTTP status
        const httpStatus = healthCheck.status === 'ok' ? 200 : 503;
        res.status(httpStatus).json(healthCheck);

    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Route to handle user login with Firebase Authentication
app.post('/auth/login', async (req, res) => {
    const { token } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const user = decodedToken; // User data from Firebase
        res.status(200).json({ user }); // Send user data back to the frontend
    } catch (error) {
        res.status(401).send('Unauthorized');
    }
});

// Route to create user profile
app.post('/users', async (req, res) => {
    const { 
        firebaseUid, 
        email, 
        firstName, 
        lastName, 
        displayName, 
        bio, 
        location, 
        website, 
        dateOfBirth, 
        genrePreferences, 
        isArtist, 
        artistName 
    } = req.body;

    try {
        const user = await prisma.user.create({
            data: {
                firebaseUid,
                email,
                firstName,
                lastName,
                displayName,
                bio,
                location,
                website,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                genrePreferences,
                isArtist,
                artistName
            }
        });

        res.status(201).json(user);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user profile' });
    }
});

// Route to get user profile by Firebase UID
app.get('/users/:firebaseUid', async (req, res) => {
    const { firebaseUid } = req.params;

    try {
        const user = await prisma.user.findUnique({
            where: { firebaseUid }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// Route to update user profile
app.put('/users/:firebaseUid', async (req, res) => {
    const { firebaseUid } = req.params;
    const { 
        firstName, 
        lastName, 
        displayName, 
        bio, 
        location, 
        website, 
        dateOfBirth, 
        genrePreferences, 
        isArtist, 
        artistName 
    } = req.body;

    try {
        const user = await prisma.user.update({
            where: { firebaseUid },
            data: {
                firstName,
                lastName,
                displayName,
                bio,
                location,
                website,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                genrePreferences,
                isArtist,
                artistName
            }
        });

        res.status(200).json(user);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user profile' });
    }
});

// Ensure the temp directory exists at the top of your file (after imports)
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

//upload route
app.post('/upload', async (req, res) => {
    try {
        if (!req.files || !req.files.music) {
            return res.status(400).send('No music file uploaded');
        }

        const musicFile = req.files.music;
        const imageFile = req.files.image || null;

        if (!musicFile.name.endsWith('.mp3') && !musicFile.name.endsWith('.wav')) {
            return res.status(400).send('Only .mp3 or .wav files are allowed!');
        }

        const musicBlobName = uuidv4() + path.extname(musicFile.name);
        const musicBlobClient = containerClient.getBlockBlobClient(musicBlobName);
        await musicBlobClient.upload(musicFile.data, musicFile.size);
        const musicUrl = musicBlobClient.url;

        let imageUrl = null;

        if (imageFile) {
            const imageBlobName = uuidv4() + path.extname(imageFile.name);
            const imageBlobClient = containerClient.getBlockBlobClient(imageBlobName);
            await imageBlobClient.upload(imageFile.data, imageFile.size);
            imageUrl = imageBlobClient.url;
        }

        res.status(200).json({
            message: 'Upload successful',
            fileUrl: musicUrl,
            imageUrl: imageUrl
        });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).send('Upload failed: ' + err.message);
    }
});

// route to store music metadata in database
app.post('/metadata', async (req, res) => {
    const { songId, title, artist, album, genre, trackNumber, explicit, fileUrl, imageUrl, userId } = req.body;

    try {
        const existingSong = await prisma.userSong.findUnique({
            where: { id: songId }
        });
        
        if (existingSong) {
            return res.status(400).send('Song ID already exists');
        }

        const createdItem = await prisma.userSong.create({
            data: {
                id: songId,
                title,
                artist,
                album: album || null,
                genre,
                trackNumber: trackNumber ? parseInt(trackNumber) : null,
                explicit: explicit === true || explicit === 'true',
                fileUrl,
                imageUrl: imageUrl || null,
                ownerId: userId,
                source: "user"
            }
        });

        res.status(201).json(createdItem);
    } catch (error) {
        res.status(500).send('Error saving metadata: ' + error.message);
    }
});


// Route to calculate royalties (simulated)
app.post('/calculate-royalty', (req, res) => {
    const { songId, numberOfPlays } = req.body;

    // Simulate royalty calculation (e.g., 0.005 GBP per play)
    const royaltyPerPlay = 0.005;
    const totalRoyalties = royaltyPerPlay * numberOfPlays;  // Calculate total royalties

    res.status(200).json({ songId, totalRoyalties });  // Return the calculated royalties
});

// Route to get all songs (Spotify tracks)
app.get('/metadata', async (req, res) => {
  try {
    const songs = await prisma.track.findMany({
      include: {
        album: {
          include: {
            media: {
              where: {
                type: {
                  in: ['album_art', 'cover', 'artwork', 'image', 'album_cover']
                }
              }
            },
            album_artists: {
              include: {
                artist: true
              }
            }
          }
        },
        track_artists: {
          include: {
            artist: true
          }
        }
      }
    });
    console.log('Fetched songs with media:', JSON.stringify(songs, null, 2));
    res.status(200).json(songs);
  } catch (error) {
    res.status(500).send('Error fetching songs: ' + error.message);
  }
});

// Middleware to verify Firebase token and get user ID
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { uid: decodedToken.uid };
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Route to get user-uploaded songs for the authenticated user
app.get('/user-songs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userSongs = await prisma.userSong.findMany({
      where: {
        ownerId: userId
      },
      orderBy: {
        uploadedAt: 'desc'
      }
    });
    res.status(200).json(userSongs);
  } catch (error) {
    console.error('Error fetching user songs:', error);
    res.status(500).send('Error fetching user songs: ' + error.message);
  }
});

// Route to get recent user-uploaded songs (last month) for the music catalogue
app.get('/recent-user-songs', async (req, res) => {
  try {
    // Calculate date from one month ago
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    const recentUserSongs = await prisma.userSong.findMany({
      where: {
        uploadedAt: {
          gte: oneMonthAgo
        }
      },
      orderBy: {
        uploadedAt: 'desc'
      }
    });
    res.status(200).json(recentUserSongs);
  } catch (error) {
    console.error('Error fetching recent user songs:', error);
    res.status(500).send('Error fetching recent user songs: ' + error.message);
  }
});

// Debug endpoint to check what's in the database
app.get('/debug/media', async (req, res) => {
  try {
    const media = await prisma.media.findMany({
      include: {
        album: true
      }
    });
    
    const albums = await prisma.album.findMany({
      include: {
        media: true,
        tracks: true
      }
    });
    
    const tracks = await prisma.track.findMany({
      include: {
        album: {
          include: {
            media: true
          }
        }
      }
    });
    
    res.status(200).json({
      mediaCount: media.length,
      albumCount: albums.length,
      trackCount: tracks.length,
      sampleMedia: media.slice(0, 5),
      sampleAlbums: albums.slice(0, 3),
      sampleTracks: tracks.slice(0, 3)
    });
  } catch (error) {
    res.status(500).send('Error debugging: ' + error.message);
  }
});

// Route to search songs with pagination
app.get('/search', async (req, res) => {
  try {
    const {
      q: searchTerm,
      page = 1,
      limit = 10,
      // optional filters
      explicit,
      hasPreview,
      minDurationSec,
      maxDurationSec,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const andConditions = [];

    if (searchTerm && searchTerm.trim()) {
      andConditions.push({
        OR: [
          { name: { contains: searchTerm } },
          { album: { name: { contains: searchTerm } } },
          { track_artists: { some: { artist: { name: { contains: searchTerm } } } } }
        ]
      });
    }

    if (explicit === 'true') andConditions.push({ explicit: true });
    if (explicit === 'false') andConditions.push({ explicit: false });

    if (hasPreview === 'true') andConditions.push({ preview_url: { not: null } });
    if (hasPreview === 'false') andConditions.push({ preview_url: null });

    const minMs = minDurationSec ? parseInt(minDurationSec, 10) * 1000 : undefined;
    const maxMs = maxDurationSec ? parseInt(maxDurationSec, 10) * 1000 : undefined;
    if (minMs !== undefined || maxMs !== undefined) {
      andConditions.push({
        duration_ms: {
          ...(minMs !== undefined ? { gte: minMs } : {}),
          ...(maxMs !== undefined ? { lte: maxMs } : {})
        }
      });
    }

    const whereClause = andConditions.length > 0 ? { AND: andConditions } : {};

    let orderBy = { name: sortOrder === 'desc' ? 'desc' : 'asc' };
    if (sortBy === 'duration_ms') orderBy = { duration_ms: sortOrder === 'desc' ? 'desc' : 'asc' };
    if (sortBy === 'album_release_date') orderBy = { album: { release_date: sortOrder === 'desc' ? 'desc' : 'asc' } };

    const [songs, totalCount] = await Promise.all([
      prisma.track.findMany({
        where: whereClause,
        include: {
          album: {
            include: {
              media: {
                where: {
                  type: { in: ['album_art', 'cover', 'artwork', 'image', 'album_cover'] }
                }
              },
              album_artists: { include: { artist: true } }
            }
          },
          track_artists: { include: { artist: true } }
        },
        skip,
        take: limitNum,
        orderBy
      }),
      prisma.track.count({ where: whereClause })
    ]);

    res.status(200).json({
      songs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error searching songs: ' + error.message);
  }
});

// Route to search artists with pagination
app.get('/artists', async (req, res) => {
  try {
    const { q: searchTerm, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let whereClause = {};
    
    if (searchTerm && searchTerm.trim()) {
      whereClause = {
        name: {
          contains: searchTerm
        }
      };
    }

    const [artists, totalCount] = await Promise.all([
      prisma.artist.findMany({
        where: whereClause,
        include: {
          track_artists: {
            include: {
              track: {
                include: {
                  album: {
                    include: {
                      media: {
                        where: {
                          type: {
                            in: ['album_art', 'cover', 'artwork', 'image', 'album_cover']
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            take: 5 // Limit to first 5 tracks per artist for performance
          },
          album_artists: {
            include: {
              album: {
                include: {
                  media: {
                    where: {
                      type: {
                        in: ['album_art', 'cover', 'artwork', 'image', 'album_cover']
                      }
                    }
                  }
                }
              }
            },
            take: 5 // Limit to first 5 albums per artist for performance
          },
          _count: {
            select: {
              track_artists: true,
              album_artists: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: {
          name: 'asc'
        }
      }),
      prisma.artist.count({ where: whereClause })
    ]);

    res.status(200).json({
      artists,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Artists search error:', error);
    res.status(500).send('Error searching artists: ' + error.message);
  }
});

// Route to get songs by a specific artist
app.get('/artists/:artistId/songs', async (req, res) => {
  try {
    const { artistId } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // First, get the artist details
    const artist = await prisma.artist.findUnique({
      where: { id: artistId }
    });

    if (!artist) {
      return res.status(404).json({ error: 'Artist not found' });
    }

    // Get songs where this artist is a track artist
    const [songs, totalCount] = await Promise.all([
      prisma.track.findMany({
        where: {
          track_artists: {
            some: {
              artist_id: artistId
            }
          }
        },
        include: {
          album: {
            include: {
              media: {
                where: {
                  type: {
                    in: ['album_art', 'cover', 'artwork', 'image', 'album_cover']
                  }
                }
              },
              album_artists: {
                include: {
                  artist: true
                }
              }
            }
          },
          track_artists: {
            include: {
              artist: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: [
          {
            album: {
              release_date: 'desc'
            }
          },
          {
            track_number: 'asc'
          }
        ]
      }),
      prisma.track.count({
        where: {
          track_artists: {
            some: {
              artist_id: artistId
            }
          }
        }
      })
    ]);

    res.status(200).json({
      artist,
      songs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    console.error('Artist songs error:', error);
    res.status(500).send('Error fetching artist songs: ' + error.message);
  }
});

// Delete a song (authenticated, user can only delete their own songs)
app.delete('/songs/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;
  console.log("Deleting song with id:", id, "for user:", userId);

  try {
    // First check if the song exists and belongs to the user
    const song = await prisma.userSong.findUnique({
      where: { id: id }
    });

    if (!song) {
      return res.status(404).json({ error: "Song not found" });
    }

    if (song.ownerId !== userId) {
      return res.status(403).json({ error: "You can only delete your own songs" });
    }

    await prisma.userSong.delete({
      where: { id: id }
    });
    res.status(200).json({ message: "Song deleted successfully", id });
  } catch (error) {
    console.error("Delete error:", error.message);
    res.status(500).json({ error: "Failed to delete song", details: error.message });
  }
});

// Increment play count
app.post('/songs/:id/play', async (req, res) => {
  const { id } = req.params;

  try {
    const song = await prisma.userSong.findUnique({
      where: { id: id }
    });
    
    if (!song) {
      return res.status(404).send("Song not found");
    }

    const updated = await prisma.userSong.update({
      where: { id: id },
      data: { plays: song.plays + 1 }
    });
    
    res.status(200).json(updated);
  } catch (err) {
    console.error("Error updating play count:", err.message);
    res.status(500).send("Failed to increment play count");
  }
});

// Purchase a song
app.post('/purchase', async (req, res) => {
  const { userId, songId, paymentData, songType } = req.body;

  if (!userId || !songId) {
    return res.status(400).json({ error: "Missing userId or songId" });
  }

  const TRACK_PRICE = 0.99; // Fixed price for all tracks

  try {
    // Determine song type if not provided
    let resolvedSongType = songType;
    let userSong = null;
    let track = null;

    if (!resolvedSongType) {
      userSong = await prisma.userSong.findUnique({ where: { id: songId } });
      if (userSong) {
        resolvedSongType = 'user';
      } else {
        track = await prisma.track.findUnique({ where: { id: songId } });
        if (track) resolvedSongType = 'spotify';
      }
    } else if (resolvedSongType === 'user') {
      userSong = await prisma.userSong.findUnique({ where: { id: songId } });
    } else if (resolvedSongType === 'spotify') {
      track = await prisma.track.findUnique({ where: { id: songId } });
    }

    // Validate ownership if it's a user song
    if (userSong && userSong.ownerId === userId) {
      return res.status(403).json({ error: "You cannot purchase your own uploaded songs" });
    }

    // Check if already purchased
    const existing = await prisma.purchase.findFirst({
      where: {
        userId: userId,
        songId: songId
      }
    });

    if (existing) {
      return res.status(409).json({ message: "Already purchased" });
    }

    // Simulate payment processing (in a real app, this would call a payment gateway)
    console.log(`Simulating payment for user ${userId}: £${TRACK_PRICE} for song ${songId}`);
    if (paymentData) {
      console.log(`Payment details: ${JSON.stringify(paymentData)}`);
    }

    const newPurchase = await prisma.purchase.create({
      data: {
        userId,
        songId,
        songType: resolvedSongType || 'user'
      }
    });
    
    // Return purchase confirmation with price information
    res.status(201).json({
      ...newPurchase,
      price: TRACK_PRICE,
      currency: 'GBP',
      paymentStatus: 'completed',
      message: 'Purchase successful - this is a dummy transaction for university project'
    });

  } catch (error) {
    console.error("Purchase error:", error.message);
    res.status(500).json({ error: "Purchase failed" });
  }
});

// Get user purchases
app.get('/purchases/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const purchases = await prisma.purchase.findMany({
      where: { userId: userId }
    });

    // Manually fetch song details based on songType
    const enrichedPurchases = await Promise.all(
      purchases.map(async (purchase) => {
        let songDetails = null;
        
        if (purchase.songType === 'user') {
          songDetails = await prisma.userSong.findUnique({
            where: { id: purchase.songId }
          });
          if (!songDetails) {
            // Fallback for legacy/wrong songType
            songDetails = await prisma.track.findUnique({
              where: { id: purchase.songId },
              include: {
                album: { include: { media: true, album_artists: { include: { artist: true } } } },
                track_artists: { include: { artist: true } }
              }
            });
          }
        } else if (purchase.songType === 'spotify') {
          songDetails = await prisma.track.findUnique({
            where: { id: purchase.songId },
            include: {
              album: {
                include: {
                  media: true,
                  album_artists: {
                    include: {
                      artist: true
                    }
                  }
                }
              },
              track_artists: {
                include: {
                  artist: true
                }
              }
            }
          });
          if (!songDetails) {
            // Fallback: some legacy purchases may have stored spotify_id
            songDetails = await prisma.track.findFirst({
              where: { spotify_id: purchase.songId },
              include: {
                album: { include: { media: true, album_artists: { include: { artist: true } } } },
                track_artists: { include: { artist: true } }
              }
            });
          }
          if (!songDetails) {
            // Fallback for legacy/wrong songType
            songDetails = await prisma.userSong.findUnique({ where: { id: purchase.songId } });
          }
        } else {
          // Attempt to resolve automatically for legacy purchases
          songDetails = await prisma.userSong.findUnique({ where: { id: purchase.songId } });
          if (!songDetails) {
            songDetails = await prisma.track.findUnique({
              where: { id: purchase.songId },
              include: {
                album: { include: { media: true, album_artists: { include: { artist: true } } } },
                track_artists: { include: { artist: true } }
              }
            });
            if (!songDetails) {
              songDetails = await prisma.track.findFirst({
                where: { spotify_id: purchase.songId },
                include: {
                  album: { include: { media: true, album_artists: { include: { artist: true } } } },
                  track_artists: { include: { artist: true } }
                }
              });
            }
          }
        }
        
        return {
          ...purchase,
          song: songDetails
        };
      })
    );

    res.status(200).json(enrichedPurchases);
  } catch (err) {
    console.error("Error fetching purchases:", err.message);
    res.status(500).send("Failed to fetch purchases");
  }
});

// Start the server
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  console.log('Starting server...');
  app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});