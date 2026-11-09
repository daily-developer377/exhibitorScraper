import { NextResponse } from "next/server";
import { scrapeAllExhibitors } from "@/lib/scraper/mmiconnect";
import { persistExhibitors } from "@/lib/scraper/persist";

// Note: POST handlers are never prerendered/cached by Next.js, with or
// without Cache Components, so no route-segment config is needed here.

const DEFAULT_GROUP = "ep-blr-2026";

/**
 * POST /api/scrape/exhibitors
 *
 * Triggers a full scrape of the MMI Connect exhibitor catalogue and upserts
 * the results into the database. Safe to call repeatedly.
 *
 * Optional JSON body: { "group": "ep-blr-2026", "pageSize": 20 }
 */
export async function POST(request: Request) {
  let group = DEFAULT_GROUP;
  let pageSize = 100;

  try {
    const body = await request.json();
    if (typeof body?.group === "string" && body.group.trim()) {
      group = body.group.trim();
    }
    if (typeof body?.pageSize === "number" && body.pageSize > 0) {
      pageSize = Math.floor(body.pageSize);
    }
  } catch {
    // No/invalid JSON body is fine - fall back to defaults.
  }

  const startedAt = Date.now();

  try {
    const exhibitors = await scrapeAllExhibitors({ group, pageSize });
    const summary = await persistExhibitors(group, exhibitors);

    return NextResponse.json({
      ok: true,
      group,
      durationMs: Date.now() - startedAt,
      ...summary,
    });
  } catch (error) {
    console.error("Exhibitor scrape failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
