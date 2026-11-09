export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640 }}>
      <h1>Exhibitor Scraper</h1>
      <p>
        Scrapes exhibitor data from MMI Connect into a normalized Postgres
        database. See <code>README.md</code> for setup and usage.
      </p>
      <ul>
        <li>
          <code>POST /api/scrape/exhibitors</code> &mdash; trigger a scrape
        </li>
        <li>
          <code>GET /api/exhibitors</code> &mdash; read back what was scraped
        </li>
      </ul>
    </main>
  );
}
