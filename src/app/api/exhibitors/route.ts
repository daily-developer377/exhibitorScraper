import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/exhibitors?take=20&skip=0
 *
 * Read-only convenience endpoint for verifying that the scraper actually
 * populated the database. Not part of the task brief's required surface,
 * but makes the demo/trigger flow self-contained (scrape, then prove it).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const take = Math.min(Number(searchParams.get("take")) || 20, 100);
  const skip = Math.max(Number(searchParams.get("skip")) || 0, 0);

  const [total, exhibitors] = await Promise.all([
    prisma.exhibitor.count(),
    prisma.exhibitor.findMany({
      take,
      skip,
      orderBy: { companyName: "asc" },
      include: {
        participations: {
          include: { show: true },
        },
      },
    }),
  ]);

  return NextResponse.json({ total, take, skip, exhibitors });
}
