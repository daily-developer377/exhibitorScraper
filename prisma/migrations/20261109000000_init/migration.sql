-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "exhibitors" (
    "id" INTEGER NOT NULL,
    "userId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "country" TEXT,
    "squareLogoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shows" (
    "id" INTEGER NOT NULL,
    "showName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibitor_participations" (
    "id" SERIAL NOT NULL,
    "exhibitorId" INTEGER NOT NULL,
    "showId" INTEGER NOT NULL,
    "groupCode" TEXT NOT NULL,
    "boothNo" TEXT,
    "hallNo" TEXT,
    "exhibitorType" TEXT,
    "sponsorship" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibitor_participations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exhibitors_userId_key" ON "exhibitors"("userId");

-- CreateIndex
CREATE INDEX "exhibitor_participations_showId_idx" ON "exhibitor_participations"("showId");

-- CreateIndex
CREATE INDEX "exhibitor_participations_groupCode_idx" ON "exhibitor_participations"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "exhibitor_participations_exhibitorId_showId_key" ON "exhibitor_participations"("exhibitorId", "showId");

-- AddForeignKey
ALTER TABLE "exhibitor_participations" ADD CONSTRAINT "exhibitor_participations_exhibitorId_fkey" FOREIGN KEY ("exhibitorId") REFERENCES "exhibitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibitor_participations" ADD CONSTRAINT "exhibitor_participations_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

