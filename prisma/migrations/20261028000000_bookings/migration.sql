-- Fase 8: nota y precio pagado que introduce el usuario en cada reserva.
ALTER TABLE "Activity" ADD COLUMN "bookingNote" TEXT,
ADD COLUMN "paidPrice" JSONB;

ALTER TABLE "Hotel" ADD COLUMN "bookingNote" TEXT,
ADD COLUMN "paidPrice" JSONB;
