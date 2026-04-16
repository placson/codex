# Oracle Marketplace

Node and React application backed by OpenSearch 2.15 for an enterprise software marketplace experience. The UI is styled after the Workday Marketplace home/listings experience, but rebranded as **Oracle Marketplace** and powered by facet-based search over a `listings` index.

## What is included

- **OpenSearch 2.15** via Docker Compose
- **Express API** for listing search and detail retrieval
- **Separate product taxonomy index** for product/category/filter governance
- **React + Vite frontend** with category chips, featured cards, facet filters, and a marketplace detail drawer
- **JSON importer** that accepts either:
  - a root JSON array of listings
  - an object shaped like `{ "listings": [...] }`

## Listing shape

The importer normalizes marketplace-style listing data such as:

- `displayName`
- `headline`
- `tagline`
- `shortDescription`
- `longDescription`
- `logo.contentUrl`
- `attachments`
- `categories`
- `industries`
- `capabilities`
- `deploymentModels`
- `tags`

It also now creates:

- a `product_taxonomy` index with one document per product
- `productMemberships`, `productIds`, `productCategoryKeys`, and `productFilterKeys` on each listing document

Additional fields are preserved in `rawSource` but not indexed directly.

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the `listings` index:

   ```bash
   npm run index:create
   ```

3. Import sample data:

   ```bash
   npm run import:listings -- scripts/sample-listings.json --replace
   ```

4. Start OpenSearch, the API, and the frontend together:

   ```bash
   npm run dev:all
   ```

5. Open the app:

   - Frontend: `http://localhost:5173`
   - API health: `http://localhost:3000/api/health`
   - OpenSearch Dashboards: `http://localhost:5601`

## Import your own JSON file

Replace the sample file path with the JSON file you provide:

```bash
npm run import:listings -- ./path/to/your-listings.json --replace
```

For this repo’s Oracle export, that command is:

```bash
npm run import:listings -- public-marketplace-listings.json --replace
```

The importer will:

- create or recreate the `listings` index when `--replace` is provided
- normalize common marketplace fields
- bulk index every listing into OpenSearch

## Search behavior

The API endpoint `GET /api/search` supports:

- free-text search on listing name and descriptions
- facet filters for categories, industries, capabilities, deployment models, and attachment types
- OpenSearch aggregations for facet counts

## Environment variables

Copy `.env.example` to `.env` if you need overrides:

- `PORT`
- `VITE_API_BASE_URL`
- `OPENSEARCH_URL`
- `OPENSEARCH_USERNAME`
- `OPENSEARCH_PASSWORD`
- `LISTINGS_INDEX`
- `PRODUCT_TAXONOMY_INDEX`
