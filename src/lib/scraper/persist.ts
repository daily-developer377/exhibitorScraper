import { prisma } from "@/lib/prisma";
import type { ScrapedExhibitor } from "./mmiconnect";

export interface PersistSummary {
  exhibitorsSeen: number;
  showsUpserted: number;
  participationsUpserted: number;
}

/**
 * Upserts scraped exhibitor rows into the normalized schema (exhibitors,
 * shows, exhibitor_participations). Safe to re-run: every write is keyed on
 * MMI's own natural ids (customer id, show id) or the (exhibitor, show)
 * unique pair, so re-scraping never creates duplicates.
 */
export async function persistExhibitors(
  groupCode: string,
  exhibitors: ScrapedExhibitor[],
): Promise<PersistSummary> {
  const uniqueShows = new Map<number, ScrapedExhibitor>();
  for (const e of exhibitors) {
    if (!uniqueShows.has(e.showId)) {
      uniqueShows.set(e.showId, e);
    }
  }

  // Shows first, since exhibitor_participations has a FK to shows.id.
  // Each upsert below is independently atomic; we intentionally don't wrap
  // the whole run in one interactive transaction, since that would hold a
  // single DB transaction open for the entire scrape (hundreds of
  // round-trips) and risk hitting Prisma's interactive-transaction timeout.
  for (const show of uniqueShows.values()) {
    await prisma.show.upsert({
      where: { id: show.showId },
      create: {
        id: show.showId,
        showName: show.showName,
        startDate: new Date(show.showStartDate),
        endDate: new Date(show.showEndDate),
      },
      update: {
        showName: show.showName,
        startDate: new Date(show.showStartDate),
        endDate: new Date(show.showEndDate),
      },
    });
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < exhibitors.length; i += CONCURRENCY) {
    const batch = exhibitors.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (e) => {
        await prisma.exhibitor.upsert({
          where: { id: e.exhibitorId },
          create: {
            id: e.exhibitorId,
            userId: e.userId,
            companyName: e.companyName,
            country: e.country,
            squareLogoUrl: e.squareLogoUrl,
          },
          update: {
            userId: e.userId,
            companyName: e.companyName,
            country: e.country,
            squareLogoUrl: e.squareLogoUrl,
          },
        });

        await prisma.exhibitorParticipation.upsert({
          where: {
            exhibitorId_showId: { exhibitorId: e.exhibitorId, showId: e.showId },
          },
          create: {
            exhibitorId: e.exhibitorId,
            showId: e.showId,
            groupCode,
            boothNo: e.boothNo,
            hallNo: e.hallNo,
            exhibitorType: e.exhibitorType,
            sponsorship: e.sponsorship,
          },
          update: {
            groupCode,
            boothNo: e.boothNo,
            hallNo: e.hallNo,
            exhibitorType: e.exhibitorType,
            sponsorship: e.sponsorship,
            scrapedAt: new Date(),
          },
        });
      }),
    );
  }

  return {
    exhibitorsSeen: exhibitors.length,
    showsUpserted: uniqueShows.size,
    participationsUpserted: exhibitors.length,
  };
}
