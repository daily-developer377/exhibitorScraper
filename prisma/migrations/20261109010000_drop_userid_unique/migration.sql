-- DropIndex
DROP INDEX "exhibitors_userId_key";

-- CreateIndex
CREATE INDEX "exhibitors_userId_idx" ON "exhibitors"("userId");
