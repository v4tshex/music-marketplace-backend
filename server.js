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

app.use(cors({ origin: "http://localhost:5173" }));
app.use(bodyParser.json());
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));  

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient('music-files'); 

// Check if container exists, and if not, create it
async function createContainerIfNotExists() {
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
        try {
            await prisma.$queryRaw`SELECT 1`;
            healthCheck.database = 'connected';
        } catch (dbError) {
            healthCheck.database = 'disconnected';
            healthCheck.status = 'degraded';
        }

        // Check Azure Blob Storage connectivity
        try {
            await containerClient.exists();
            healthCheck.blobStorage = 'connected';
        } catch (blobError) {
            healthCheck.blobStorage = 'disconnected';
            healthCheck.status = 'degraded';
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
app.post('/api/users', async (req, res) => {
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
app.get('/api/users/:firebaseUid', async (req, res) => {
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
app.put('/api/users/:firebaseUid', async (req, res) => {
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

// Route to retrieve user's songs
app.get('/api/my-songs/:uid', async (req, res) => {
  const userId = req.params.uid;

  try {
    const userSongs = await prisma.userSong.findMany({
      where: { ownerId: userId }
    });

    res.status(200).json(userSongs);
  } catch (err) {
    console.error("Error fetching user songs:", err.message);
    res.status(500).send("Failed to fetch user songs");
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

// Route to get all user-uploaded songs
app.get('/api/user-songs', async (req, res) => {
  try {
    const userSongs = await prisma.userSong.findMany({
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
app.get('/api/search', async (req, res) => {
  try {
    const { q: searchTerm, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let whereClause = {};
    
    if (searchTerm && searchTerm.trim()) {
      whereClause = {
        OR: [
          {
            name: {
              contains: searchTerm
            }
          },
          {
            album: {
              name: {
                contains: searchTerm
              }
            }
          },
          {
            track_artists: {
              some: {
                artist: {
                  name: {
                    contains: searchTerm
                  }
                }
              }
            }
          }
        ]
      };
    }

    const [songs, totalCount] = await Promise.all([
      prisma.track.findMany({
        where: whereClause,
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
        orderBy: {
          name: 'asc'
        }
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
app.get('/api/artists', async (req, res) => {
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
app.get('/api/artists/:artistId/songs', async (req, res) => {
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

// Delete a song
app.delete('/api/songs/:id', async (req, res) => {
  const { id } = req.params;
  console.log("Deleting song with id:", id);

  try {
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
app.post('/api/songs/:id/play', async (req, res) => {
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
app.post('/api/purchase', async (req, res) => {
  const { userId, songId, paymentData } = req.body;

  if (!userId || !songId) {
    return res.status(400).json({ error: "Missing userId or songId" });
  }

  const TRACK_PRICE = 0.99; // Fixed price for all tracks

  try {
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
        songId
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
app.get('/api/purchases/:userId', async (req, res) => {
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
const PORT = process.env.PORT || 5000;
console.log('Starting server...');
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});