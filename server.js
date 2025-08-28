// express api for music marketplace backend
const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const dotenv = require('dotenv'); 
const { v4: uuidv4 } = require('uuid');
const admin = require('./firebase');  
const { PrismaClient } = require('@prisma/client');
const { BlobServiceClient } = require('@azure/storage-blob');  
const path = require('path');
const fs = require('fs');


dotenv.config();
console.log("Azure Storage Connection String:", process.env.AZURE_STORAGE_CONNECTION_STRING);

const app = express();


const corsOptions = {
  origin: [
    "http://localhost:5173",  
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


async function createContainerIfNotExists() {
    if (!containerClient) return;
    const exists = await containerClient.exists();
    if (!exists) {
        await containerClient.create();
        console.log('Container created successfully!');
    }
}


createContainerIfNotExists();


const prisma = new PrismaClient();


app.get('/health', async (req, res) => {
    try {
        
        const healthCheck = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };

        
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


app.post('/auth/login', async (req, res) => {
    const { token } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const user = decodedToken; 
        res.status(200).json({ user }); 
    } catch (error) {
        res.status(401).send('Unauthorized');
    }
});


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


const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}


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



app.post('/calculate-royalty', (req, res) => {
    const { songId, numberOfPlays } = req.body;

    
    const royaltyPerPlay = 0.005;
    const totalRoyalties = royaltyPerPlay * numberOfPlays;  

    res.status(200).json({ songId, totalRoyalties });  
});


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


app.get('/recent-user-songs', async (req, res) => {
  try {
    
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


app.get('/search', async (req, res) => {
  try {
    const {
      q: searchTerm,
      page = 1,
      limit = 10,
      
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
            take: 5 
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
            take: 5 
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


app.get('/artists/:artistId/songs', async (req, res) => {
  try {
    const { artistId } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    
    const artist = await prisma.artist.findUnique({
      where: { id: artistId }
    });

    if (!artist) {
      return res.status(404).json({ error: 'Artist not found' });
    }

    
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


app.delete('/songs/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;
  console.log("Deleting song with id:", id, "for user:", userId);

  try {
    
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


app.post('/purchase', async (req, res) => {
  const { userId, songId, paymentData, songType } = req.body;

  if (!userId || !songId) {
    return res.status(400).json({ error: "Missing userId or songId" });
  }

  const TRACK_PRICE = 0.99; 

  try {
    
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

    
    if (userSong && userSong.ownerId === userId) {
      return res.status(403).json({ error: "You cannot purchase your own uploaded songs" });
    }

    
    const existing = await prisma.purchase.findFirst({
      where: {
        userId: userId,
        songId: songId
      }
    });

    if (existing) {
      return res.status(409).json({ message: "Already purchased" });
    }

    
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


app.get('/purchases/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const purchases = await prisma.purchase.findMany({
      where: { userId: userId }
    });

    
    const enrichedPurchases = await Promise.all(
      purchases.map(async (purchase) => {
        let songDetails = null;
        
        if (purchase.songType === 'user') {
          songDetails = await prisma.userSong.findUnique({
            where: { id: purchase.songId }
          });
          if (!songDetails) {
            
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
            
            songDetails = await prisma.track.findFirst({
              where: { spotify_id: purchase.songId },
              include: {
                album: { include: { media: true, album_artists: { include: { artist: true } } } },
                track_artists: { include: { artist: true } }
              }
            });
          }
          if (!songDetails) {
            
            songDetails = await prisma.userSong.findUnique({ where: { id: purchase.songId } });
          }
        } else {
          
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


if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  console.log('Starting server...');
  app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;


process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});