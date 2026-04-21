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

## AI-assisted search

The API endpoint `GET /api/ai-search?q=...` uses a retrieval-and-rerank pipeline over OpenSearch, then optionally asks an LLM to write a grounded natural-language answer from the ranked listings.

### High-level flow

1. The backend parses the user query into search signals.
2. It runs multiple OpenSearch retrieval passes against the `listings` index and, when available, the `listing_enrichment` sidecar index.
3. It merges the candidate sets and reranks them with business-aware scoring.
4. It returns the top listings directly and can also generate a natural-language explanation that is constrained to those ranked results.

### Query understanding

The AI search layer in [server/ai-search.js](/home/p/dev/codex/marketplace/server/ai-search.js) derives several kinds of signals from the plain-English question:

- `queryTokens`: normalized non-stopword tokens from the question
- `productIds`: inferred product scope from taxonomy names and aliases
- `categoryKeys` and `filterKeys`: inferred taxonomy children when those names appear in the question
- `listingTypeIntent`: priority or hard filters for `AI_AGENT`, `SERVICE`, `OCI_APPLICATION`, and `LEAD_GENERATION`
- `connectionIntent`: detects phrases such as `integrates with`, `connects with`, `compatible with`, `works with`, and `runs on`, then extracts the target object
- `compoundIntent`: boosts combinations such as remote-access plus automation/integration

Examples:

- `Do you have any AI agent solutions that help with security operations` biases results toward `listingType=AI_AGENT`
- `I need a professional service for Oracle database migration` biases results toward `listingType=SERVICE`
- `I need a solution that integrates with mysql` first tries direct text matches for `mysql` in listing descriptions, then falls back to product-linked matching if needed

### Retrieval sources

The AI search does not rely on a single OpenSearch query. It issues multiple retrieval passes and merges the results:

- `primary`: the main lexical retrieval over `displayName`, `headline`, `tagline`, `shortDescription`, `longDescription`, `publisher`, `categories`, and `tags`
- `connectionText`: a special retrieval pass used when the query contains a connection phrase; this heavily weights direct phrase-style matches in `shortDescription` and `longDescription`
- `connection`: a fallback product-scoped retrieval pass used only if the direct description-level connection pass does not return hits
- `enrichment`: a retrieval pass restricted to listing IDs surfaced by the `listing_enrichment` sidecar index

This is important for integration/platform questions. The current behavior is:

- first prefer listings whose descriptions directly mention the requested connection target
- only if that direct pass finds nothing, fall back to listings whose product memberships imply the connection target

### Enrichment sidecar index

The base `listings` index shape is preserved. AI-specific enrichment is written to a separate `listing_enrichment` index so reindexing listings does not require changing the source schema.

The enrichment step is produced by:

```bash
npm run enrich:listings -- --replace
```

The combined rebuild flow is:

```bash
npm run rebuild:all
```

That rebuild command:

- starts OpenSearch if needed
- imports `public-marketplace-listings.json`
- regenerates `listing_enrichment`

The enrichment documents include derived fields such as:

- `productLabels`
- `mentionedProductIds`
- `mentionedProductLabels`
- `categoryLabels`
- `filterLabels`
- `useCases`
- `profile`
- `retrievalText`

These fields give the AI search a denser retrieval surface without forcing those additions into the primary listing schema.

### Reranking algorithm

After retrieval, the backend merges hits from all sources and reranks them in code.

Key reranking signals include:

- reciprocal-rank-fusion style weighting across retrieval sources
- direct text matches for the extracted connection target in `shortDescription`, `longDescription`, and `tagline`
- inferred product matches from taxonomy membership
- inferred category and filter matches
- listing type preference ordering
- compound intent signals such as:
  - remote access / VPN
  - automation / integration
  - both together for stronger combined boosts
- curated intent rules for domains such as hospitality, OCI, operations, and cost optimization

The reranker also records short human-readable reasons for why each listing was promoted. Those reasons are returned with each suggestion and are also used to help explain the top result.

### Natural-language answer generation

If OCI GenAI settings are present, the backend sends only the already-ranked top suggestions to the model and asks it to summarize them. The LLM is not used as the retriever.

The model is grounded by:

- a deterministic lead sentence based on the top-ranked listing
- the ranked suggestion list
- publisher, product labels, listing type, descriptions, and match reasons for each suggestion

If the LLM is unavailable or errors, the API falls back to a retrieval-only answer assembled directly in application code.

### Why this design

This project uses a pragmatic marketplace-search architecture:

- OpenSearch handles retrieval and facets
- application code handles intent parsing, taxonomy-aware logic, and reranking
- the LLM is used only for grounded language generation

That keeps the facet UI stable, preserves the existing listing schema, and makes the AI search behavior explainable and tunable without retraining a model.

## Environment variables

Copy `.env.example` to `.env` if you need overrides:

- `PORT`
- `VITE_API_BASE_URL`
- `OPENSEARCH_URL`
- `OPENSEARCH_USERNAME`
- `OPENSEARCH_PASSWORD`
- `LISTINGS_INDEX`
- `PRODUCT_TAXONOMY_INDEX`
- `LISTING_ENRICHMENT_INDEX`
- `ENABLE_AI_LLM`
- `OCI_REGION`
- `OCI_GENAI_API_KEY`
- `OCI_GENAI_MODEL_ID`
- `OCI_GENAI_ENDPOINT`
