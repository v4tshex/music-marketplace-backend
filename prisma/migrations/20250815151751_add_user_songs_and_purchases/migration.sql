BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[user_songs] (
    [id] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [artist] NVARCHAR(1000) NOT NULL,
    [genre] NVARCHAR(1000),
    [fileUrl] NVARCHAR(1000) NOT NULL,
    [imageUrl] NVARCHAR(1000),
    [uploadedAt] DATETIME2 NOT NULL CONSTRAINT [user_songs_uploadedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [ownerId] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [user_songs_source_df] DEFAULT 'user',
    [plays] INT NOT NULL CONSTRAINT [user_songs_plays_df] DEFAULT 0,
    CONSTRAINT [user_songs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchases] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [songId] NVARCHAR(1000) NOT NULL,
    [purchasedAt] DATETIME2 NOT NULL CONSTRAINT [purchases_purchasedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [purchases_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_songId_fkey] FOREIGN KEY ([songId]) REFERENCES [dbo].[user_songs]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
