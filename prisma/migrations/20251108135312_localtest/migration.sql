/*
  Warnings:

  - The values [ADMIN] on the enum `UserType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `image_path` on the `game_images` table. All the data in the column will be lost.
  - You are about to drop the column `file_path` on the `games` table. All the data in the column will be lost.
  - You are about to drop the `ratings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `reviews` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[user_id,game_id]` on the table `downloads` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `s3_key` to the `game_images` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserType_new" AS ENUM ('PLAYER', 'DEV');
ALTER TABLE "public"."users" ALTER COLUMN "user_type" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "user_type" TYPE "UserType_new" USING ("user_type"::text::"UserType_new");
ALTER TYPE "UserType" RENAME TO "UserType_old";
ALTER TYPE "UserType_new" RENAME TO "UserType";
DROP TYPE "public"."UserType_old";
ALTER TABLE "users" ALTER COLUMN "user_type" SET DEFAULT 'PLAYER';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."downloads" DROP CONSTRAINT "downloads_game_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."downloads" DROP CONSTRAINT "downloads_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."game_images" DROP CONSTRAINT "game_images_game_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."games" DROP CONSTRAINT "games_developer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ratings" DROP CONSTRAINT "ratings_game_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ratings" DROP CONSTRAINT "ratings_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_game_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."reviews" DROP CONSTRAINT "reviews_user_id_fkey";

-- AlterTable
ALTER TABLE "game_images" DROP COLUMN "image_path",
ADD COLUMN     "s3_key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "games" DROP COLUMN "file_path",
ADD COLUMN     "s3_key" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT;

-- DropTable
DROP TABLE "public"."ratings";

-- DropTable
DROP TABLE "public"."reviews";

-- DropEnum
DROP TYPE "public"."RatingType";

-- CreateIndex
CREATE UNIQUE INDEX "downloads_user_id_game_id_key" ON "downloads"("user_id", "game_id");

-- CreateIndex
CREATE INDEX "games_genre_idx" ON "games"("genre");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_images" ADD CONSTRAINT "game_images_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
