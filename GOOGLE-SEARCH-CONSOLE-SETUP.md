# Google Search Console Analytics

The admin SEO dashboard reads clicks, impressions, click-through rate, average position, search queries, and landing pages directly from the Google Search Console Search Analytics API. It does not use the historical figures in SEO audit documents.

## Configure access

1. In Google Cloud, enable the Google Search Console API and create a service account.
2. Create a JSON key for that service account and copy its full JSON contents into the backend environment variable `GOOGLE_SEARCH_CONSOLE_CREDENTIALS`.
3. Add the service account's `client_email` to the matching Search Console property with permission to view data.
4. Set `GOOGLE_SEARCH_CONSOLE_SITE_URL` to the exact property identifier, such as `https://www.caseproz.co.ke/` for a URL-prefix property or `sc-domain:caseproz.co.ke` for a domain property.
5. Restart the backend. The dashboard reports the connection state and only displays metrics returned by Search Console.

Keep the JSON key in backend secrets/environment configuration. Do not add it to frontend variables, source control, or browser storage. Search Console may delay recent dates and may return no rows for date ranges without available search data; those states are shown as unavailable rather than as fabricated zeroes.