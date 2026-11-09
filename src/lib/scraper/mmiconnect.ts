/**
 * Scraper for MMI Connect's exhibitor catalogue.
 *
 * The public listing page (e.g. https://mmiconnect.in/app/catalogue/exhibitors/ep-blr-2026)
 * is a client-rendered SPA that loads its data from an unauthenticated GraphQL
 * endpoint at https://mmiconnect.in/graphql, operation `getExhibitorListForGroup`.
 * This module talks to that endpoint directly instead of rendering the page.
 *
 * Pagination: the API takes `first` (page size) and `after` (a 0-indexed
 * cursor of the LAST item already fetched, -1 meaning "from the start").
 * Passing `after = previousAfter + itemsReturned` reliably advances to the
 * next page; passing `after = 0` is NOT safe (the API special-cases it the
 * same as -1), so pages are always requested with a size >= 2.
 */

const GRAPHQL_ENDPOINT = "https://mmiconnect.in/graphql";

const EXHIBITOR_LIST_QUERY = `
  query getExhibitorListForGroup(
    $where: [WhereExpression!]
    $first: Int
    $after: Int
    $categoryIds: [Int]
    $keyword: String
    $group: String
    $categoryGroup: String
    $categoryWhere: [WhereExpression!]
  ) {
    catalogueQueries {
      exhibitorsWithWishListGroup(
        first: $first
        where: $where
        after: $after
        categoryIds: $categoryIds
        keyword: $keyword
        group: $group
      ) {
        totalCount
        exhibitors {
          customer {
            id
            companyName
            country
            squareLogo
            userId
            showId
            exhibitorDetail {
              exhibitorType
              sponsorship
              boothNo
              hallNo
            }
            show {
              showName
              startDate
              endDate
            }
          }
        }
      }
      selectedCustomerCategories(where: $categoryWhere, group: $categoryGroup) {
        id
      }
    }
  }
`;

export interface ScrapedExhibitor {
  exhibitorId: number;
  userId: string;
  companyName: string;
  country: string | null;
  squareLogoUrl: string | null;
  showId: number;
  showName: string;
  showStartDate: string;
  showEndDate: string;
  boothNo: string | null;
  hallNo: string | null;
  exhibitorType: string | null;
  sponsorship: string | null;
}

interface GraphQlExhibitorNode {
  customer: {
    id: number;
    companyName: string;
    country: string | null;
    squareLogo: string | null;
    userId: string;
    showId: number;
    exhibitorDetail: {
      exhibitorType: string | null;
      sponsorship: string | null;
      boothNo: string | null;
      hallNo: string | null;
    } | null;
    show: {
      showName: string;
      startDate: string;
      endDate: string;
    } | null;
  };
}

interface GraphQlResponse {
  data?: {
    catalogueQueries: {
      exhibitorsWithWishListGroup: {
        totalCount: number;
        exhibitors: GraphQlExhibitorNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

async function fetchPage(
  group: string,
  first: number,
  after: number,
): Promise<{ totalCount: number; exhibitors: GraphQlExhibitorNode[] }> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "getExhibitorListForGroup",
      variables: {
        where: [],
        categoryWhere: [
          { comparison: "equal", path: "categoryType", value: ["EXHIBITOR"] },
        ],
        group,
        categoryGroup: group,
        first,
        after,
      },
      query: EXHIBITOR_LIST_QUERY,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `MMI Connect GraphQL request failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as GraphQlResponse;

  if (json.errors?.length) {
    throw new Error(
      `MMI Connect GraphQL returned errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  if (!json.data) {
    throw new Error("MMI Connect GraphQL returned no data");
  }

  return json.data.catalogueQueries.exhibitorsWithWishListGroup;
}

function toScrapedExhibitor(node: GraphQlExhibitorNode): ScrapedExhibitor | null {
  const { customer } = node;
  if (!customer.show) {
    // A handful of records in the source data have no associated show;
    // skip them since `showId` is required for our participation table.
    return null;
  }

  return {
    exhibitorId: customer.id,
    userId: customer.userId,
    companyName: customer.companyName.trim(),
    country: customer.country?.trim() || null,
    squareLogoUrl: customer.squareLogo || null,
    showId: customer.showId,
    showName: customer.show.showName,
    showStartDate: customer.show.startDate,
    showEndDate: customer.show.endDate,
    boothNo: customer.exhibitorDetail?.boothNo || null,
    hallNo: customer.exhibitorDetail?.hallNo || null,
    exhibitorType: customer.exhibitorDetail?.exhibitorType || null,
    sponsorship: customer.exhibitorDetail?.sponsorship || null,
  };
}

export interface ScrapeAllOptions {
  /** MMI catalogue/group code, e.g. "ep-blr-2026". */
  group: string;
  /** Page size per GraphQL request. */
  pageSize?: number;
  /** Safety cap on number of pages, in case totalCount is ever wrong. */
  maxPages?: number;
}

/**
 * Fetches every exhibitor for a catalogue group, following pagination until
 * the API's reported `totalCount` has been reached.
 */
export async function scrapeAllExhibitors({
  group,
  pageSize = 100,
  maxPages = 500,
}: ScrapeAllOptions): Promise<ScrapedExhibitor[]> {
  const results: ScrapedExhibitor[] = [];
  let after = -1;
  let totalCount = Infinity;
  let pages = 0;

  while (results.length < totalCount && pages < maxPages) {
    const page = await fetchPage(group, pageSize, after);
    totalCount = page.totalCount;
    pages += 1;

    if (page.exhibitors.length === 0) {
      break;
    }

    for (const node of page.exhibitors) {
      const exhibitor = toScrapedExhibitor(node);
      if (exhibitor) {
        results.push(exhibitor);
      }
    }

    after += page.exhibitors.length;
  }

  return results;
}
