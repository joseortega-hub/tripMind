-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'booked', 'ticket_purchased', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingRequirement" AS ENUM ('ticket_required', 'booking_recommended', 'free', 'no_booking', 'unverified');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('visit', 'meal', 'event', 'free_time', 'custom');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('walk', 'car', 'transit', 'bike');

-- CreateEnum
CREATE TYPE "LegQuality" AS ENUM ('routed', 'approximate');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "destination" JSONB NOT NULL,
    "destinationName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL DEFAULT 0,
    "preferences" JSONB NOT NULL,
    "pace" JSONB NOT NULL,
    "budget" JSONB NOT NULL,
    "accommodationPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "placeId" TEXT,
    "place" JSONB,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" JSONB,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "price" JSONB,
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'pending',
    "bookingUrl" TEXT,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryDay" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ItineraryDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "placeId" TEXT,
    "place" JSONB,
    "startTime" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "bookingRequirement" "BookingRequirement" NOT NULL DEFAULT 'unverified',
    "bookingStatus" "BookingStatus",
    "bookingLinks" JSONB NOT NULL DEFAULT '[]',
    "price" JSONB,
    "notes" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fromActivityId" TEXT,
    "toActivityId" TEXT,
    "fromLat" DOUBLE PRECISION NOT NULL,
    "fromLng" DOUBLE PRECISION NOT NULL,
    "toLat" DOUBLE PRECISION NOT NULL,
    "toLng" DOUBLE PRECISION NOT NULL,
    "mode" "TravelMode" NOT NULL,
    "quality" "LegQuality" NOT NULL,
    "durationMinutes" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "geometry" JSONB,
    "externalUrl" TEXT,
    "source" JSONB,
    "isDemo" BOOLEAN,

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "place" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCache" (
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_tripId_key" ON "Hotel"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryDay_tripId_date_key" ON "ItineraryDay"("tripId", "date");

-- CreateIndex
CREATE INDEX "Activity_dayId_position_idx" ON "Activity"("dayId", "position");

-- CreateIndex
CREATE INDEX "Leg_dayId_position_idx" ON "Leg"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_tripId_placeId_key" ON "Favorite"("tripId", "placeId");

-- CreateIndex
CREATE INDEX "ProviderCache_expiresAt_idx" ON "ProviderCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryDay" ADD CONSTRAINT "ItineraryDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ItineraryDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ItineraryDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
