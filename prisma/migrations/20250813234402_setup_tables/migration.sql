BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[artists] (
    [id] NVARCHAR(1000) NOT NULL,
    [spotify_id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [spotify_url] NVARCHAR(1000),
    [popularity] INT,
    [genres] NVARCHAR(1000),
    [followers] INT,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [artists_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [artists_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [artists_spotify_id_key] UNIQUE NONCLUSTERED ([spotify_id])
);

-- CreateTable
CREATE TABLE [dbo].[albums] (
    [id] NVARCHAR(1000) NOT NULL,
    [spotify_id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [album_type] NVARCHAR(1000) NOT NULL,
    [total_tracks] INT NOT NULL,
    [release_date] NVARCHAR(1000) NOT NULL,
    [release_date_precision] NVARCHAR(1000) NOT NULL,
    [spotify_url] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [albums_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [albums_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [albums_spotify_id_key] UNIQUE NONCLUSTERED ([spotify_id])
);

-- CreateTable
CREATE TABLE [dbo].[album_artists] (
    [id] NVARCHAR(1000) NOT NULL,
    [album_id] NVARCHAR(1000) NOT NULL,
    [artist_id] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [album_artists_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [album_artists_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [album_artists_album_id_artist_id_key] UNIQUE NONCLUSTERED ([album_id],[artist_id])
);

-- CreateTable
CREATE TABLE [dbo].[tracks] (
    [id] NVARCHAR(1000) NOT NULL,
    [spotify_id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [album_id] NVARCHAR(1000) NOT NULL,
    [track_number] INT NOT NULL,
    [disc_number] INT NOT NULL CONSTRAINT [tracks_disc_number_df] DEFAULT 1,
    [duration_ms] INT NOT NULL,
    [popularity] INT,
    [preview_url] NVARCHAR(1000),
    [spotify_url] NVARCHAR(1000),
    [isrc] NVARCHAR(1000),
    [explicit] BIT NOT NULL CONSTRAINT [tracks_explicit_df] DEFAULT 0,
    [available_markets] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tracks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [tracks_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tracks_spotify_id_key] UNIQUE NONCLUSTERED ([spotify_id])
);

-- CreateTable
CREATE TABLE [dbo].[track_artists] (
    [id] NVARCHAR(1000) NOT NULL,
    [track_id] NVARCHAR(1000) NOT NULL,
    [artist_id] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [track_artists_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [track_artists_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [track_artists_track_id_artist_id_key] UNIQUE NONCLUSTERED ([track_id],[artist_id])
);

-- CreateTable
CREATE TABLE [dbo].[playlists] (
    [id] NVARCHAR(1000) NOT NULL,
    [spotify_id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [owner_id] NVARCHAR(1000) NOT NULL,
    [owner_name] NVARCHAR(1000) NOT NULL,
    [owner_url] NVARCHAR(1000),
    [public] BIT NOT NULL CONSTRAINT [playlists_public_df] DEFAULT 1,
    [collaborative] BIT NOT NULL CONSTRAINT [playlists_collaborative_df] DEFAULT 0,
    [total_tracks] INT NOT NULL,
    [spotify_url] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [playlists_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [playlists_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [playlists_spotify_id_key] UNIQUE NONCLUSTERED ([spotify_id])
);

-- CreateTable
CREATE TABLE [dbo].[playlist_tracks] (
    [id] NVARCHAR(1000) NOT NULL,
    [playlist_id] NVARCHAR(1000) NOT NULL,
    [track_id] NVARCHAR(1000) NOT NULL,
    [added_at] DATETIME2 NOT NULL,
    [added_by_id] NVARCHAR(1000),
    [added_by_name] NVARCHAR(1000),
    [position] INT NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [playlist_tracks_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [playlist_tracks_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [playlist_tracks_playlist_id_track_id_position_key] UNIQUE NONCLUSTERED ([playlist_id],[track_id],[position])
);

-- CreateTable
CREATE TABLE [dbo].[media] (
    [id] NVARCHAR(1000) NOT NULL,
    [album_id] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [filename] NVARCHAR(1000) NOT NULL,
    [blob_url] NVARCHAR(1000) NOT NULL,
    [spotify_url] NVARCHAR(1000),
    [height] INT,
    [width] INT,
    [file_size] INT,
    [mime_type] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [media_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [media_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [media_album_id_type_key] UNIQUE NONCLUSTERED ([album_id],[type])
);

-- AddForeignKey
ALTER TABLE [dbo].[album_artists] ADD CONSTRAINT [album_artists_album_id_fkey] FOREIGN KEY ([album_id]) REFERENCES [dbo].[albums]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[album_artists] ADD CONSTRAINT [album_artists_artist_id_fkey] FOREIGN KEY ([artist_id]) REFERENCES [dbo].[artists]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[tracks] ADD CONSTRAINT [tracks_album_id_fkey] FOREIGN KEY ([album_id]) REFERENCES [dbo].[albums]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[track_artists] ADD CONSTRAINT [track_artists_track_id_fkey] FOREIGN KEY ([track_id]) REFERENCES [dbo].[tracks]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[track_artists] ADD CONSTRAINT [track_artists_artist_id_fkey] FOREIGN KEY ([artist_id]) REFERENCES [dbo].[artists]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[playlist_tracks] ADD CONSTRAINT [playlist_tracks_playlist_id_fkey] FOREIGN KEY ([playlist_id]) REFERENCES [dbo].[playlists]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[playlist_tracks] ADD CONSTRAINT [playlist_tracks_track_id_fkey] FOREIGN KEY ([track_id]) REFERENCES [dbo].[tracks]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[media] ADD CONSTRAINT [media_album_id_fkey] FOREIGN KEY ([album_id]) REFERENCES [dbo].[albums]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
