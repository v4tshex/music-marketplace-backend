BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[purchases] DROP CONSTRAINT [purchases_songId_fkey];

-- AlterTable
ALTER TABLE [dbo].[purchases] ADD [songType] NVARCHAR(1000) NOT NULL CONSTRAINT [purchases_songType_df] DEFAULT 'user';

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [firebaseUid] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [firstName] NVARCHAR(1000),
    [lastName] NVARCHAR(1000),
    [displayName] NVARCHAR(1000),
    [bio] NVARCHAR(1000),
    [location] NVARCHAR(1000),
    [website] NVARCHAR(1000),
    [profilePicture] NVARCHAR(1000),
    [dateOfBirth] DATETIME2,
    [genrePreferences] NVARCHAR(1000),
    [isArtist] BIT NOT NULL CONSTRAINT [users_isArtist_df] DEFAULT 0,
    [artistName] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_firebaseUid_key] UNIQUE NONCLUSTERED ([firebaseUid]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
