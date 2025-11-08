-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('PLAYER', 'DEV', 'ADMIN');

-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('LIKE', 'DISLIKE');

-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL DEFAULT 'PLAYER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "games" (
    "game_id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "file_path" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "dislikes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("game_id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "rating_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating_type" "RatingType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("rating_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "game_images" (
    "image_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "image_path" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "game_images_pkey" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "downloads" (
    "download_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "download_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloads_pkey" PRIMARY KEY ("download_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "games_developer_id_idx" ON "games"("developer_id");

-- CreateIndex
CREATE INDEX "ratings_game_id_idx" ON "ratings"("game_id");

-- CreateIndex
CREATE INDEX "ratings_user_id_idx" ON "ratings"("user_id");

-- CreateIndex
CREATE INDEX "reviews_game_id_idx" ON "reviews"("game_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "game_images_game_id_idx" ON "game_images"("game_id");

-- CreateIndex
CREATE INDEX "downloads_game_id_idx" ON "downloads"("game_id");

-- CreateIndex
CREATE INDEX "downloads_user_id_idx" ON "downloads"("user_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_images" ADD CONSTRAINT "game_images_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("game_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
