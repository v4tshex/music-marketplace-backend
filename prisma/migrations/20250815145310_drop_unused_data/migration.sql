/*
  Warnings:

  - You are about to drop the column `followers` on the `artists` table. All the data in the column will be lost.
  - You are about to drop the column `genres` on the `artists` table. All the data in the column will be lost.
  - You are about to drop the column `popularity` on the `artists` table. All the data in the column will be lost.
  - You are about to drop the column `available_markets` on the `tracks` table. All the data in the column will be lost.
  - You are about to drop the column `popularity` on the `tracks` table. All the data in the column will be lost.
  - You are about to drop the `playlist_tracks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `playlists` table. If the table is not empty, all the data it contains will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[playlist_tracks] DROP CONSTRAINT [playlist_tracks_playlist_id_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[playlist_tracks] DROP CONSTRAINT [playlist_tracks_track_id_fkey];

-- AlterTable
ALTER TABLE [dbo].[artists] DROP COLUMN [followers],
[genres],
[popularity];

-- AlterTable
ALTER TABLE [dbo].[tracks] DROP COLUMN [available_markets],
[popularity];

-- DropTable
DROP TABLE [dbo].[playlist_tracks];

-- DropTable
DROP TABLE [dbo].[playlists];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
