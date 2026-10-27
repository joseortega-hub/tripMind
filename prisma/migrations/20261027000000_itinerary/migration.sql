-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "itineraryMeta" JSONB;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "planning" JSONB;

-- AlterTable
ALTER TABLE "Leg" ADD COLUMN     "reservedMinutes" DOUBLE PRECISION;
