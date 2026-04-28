import { client } from "../server/opensearch.js";
import { config } from "../server/config.js";
import { embedTexts, embeddingStatus } from "../server/embeddings.js";
import { getProductTaxonomy } from "../server/search.js";
import {
  buildListingEnrichmentIndexDefinition,
  deriveListingEnrichment,
} from "../shared/enrichment.js";

function unwrap(result) {
  return result?.body ?? result;
}

function parseArgs(argv) {
  return {
    replace: argv.includes("--replace"),
  };
}

async function ensureIndex(indexName, definition, replace) {
  const existsResponse = unwrap(
    await client.indices.exists({
      index: indexName,
    }),
  );

  const exists = typeof existsResponse === "boolean" ? existsResponse : Boolean(existsResponse);

  if (exists && replace) {
    await client.indices.delete({ index: indexName });
  }

  if (!exists || replace) {
    await client.indices.create({
      index: indexName,
      body: definition,
    });
  }
}

async function* iterateListings(batchSize = 200) {
  let searchAfter = null;

  while (true) {
    const result = unwrap(
      await client.search({
        index: config.listingsIndex,
        body: {
          size: batchSize,
          _source: {
            excludes: ["rawSource"],
          },
          query: { match_all: {} },
          sort: [{ id: "asc" }],
          ...(searchAfter ? { search_after: searchAfter } : {}),
        },
      }),
    );

    const hits = result.hits?.hits || [];
    if (!hits.length) {
      break;
    }

    for (const hit of hits) {
      yield {
        id: hit._id,
        ...(hit._source || {}),
      };
    }

    searchAfter = hits[hits.length - 1].sort;
  }
}

async function bulkIndex(indexName, records, batchSize = 200) {
  let processed = 0;

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const operations = batch.flatMap((record) => [
      {
        index: {
          _index: indexName,
          _id: record.id,
        },
      },
      record,
    ]);

    const response = unwrap(
      await client.bulk({
        refresh: start + batchSize >= records.length,
        body: operations,
      }),
    );

    if (response.errors) {
      const failures = response.items.filter((item) => item.index?.error);
      throw new Error(
        `Enrichment indexing failed for '${indexName}' in batch ${Math.floor(start / batchSize) + 1} with ${failures.length} items.`,
      );
    }

    processed += batch.length;
    console.log(`Indexed ${processed} enrichment records into '${indexName}'...`);
  }
}

async function applyEmbeddings(records, batchSize = 32) {
  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);
    const embeddings = await embedTexts(
      batch.map((record) => record.semanticText || ""),
      { dimension: config.embeddingDimension },
    );

    embeddings.forEach((embedding, index) => {
      batch[index].semanticEmbedding = embedding;
    });

    console.log(`Embedded ${Math.min(start + batch.length, records.length)} / ${records.length} enrichment records...`);
  }
}
async function run() {
  const { replace } = parseArgs(process.argv.slice(2));
  const taxonomyProducts = await getProductTaxonomy();
  const enrichmentRecords = [];
  const resourceCache = new Map();

  await ensureIndex(
    config.listingEnrichmentIndex,
    buildListingEnrichmentIndexDefinition({
      embeddingDimension: config.embeddingDimension,
    }),
    replace,
  );

  for await (const listing of iterateListings()) {
    enrichmentRecords.push(await deriveListingEnrichment(listing, taxonomyProducts, {
      embeddingDimension: config.embeddingDimension,
      includeEmbedding: false,
      enableResourceFetch: config.enableResourceFetch,
      resourceFetchTimeoutMs: config.resourceFetchTimeoutMs,
      resourceFetchMaxAttachments: config.resourceFetchMaxAttachments,
      resourceFetchMaxChars: config.resourceFetchMaxChars,
      resourceCache,
    }));
  }

  const status = embeddingStatus();
  console.log(
    `Embedding provider: ${status.provider} (${status.enabled ? `real model ${status.modelId || "configured"}` : "fallback deterministic"})`,
  );

  await applyEmbeddings(enrichmentRecords, status.enabled ? 16 : 64);
  await bulkIndex(config.listingEnrichmentIndex, enrichmentRecords, 200);

  console.log(
    `Generated ${enrichmentRecords.length} listing enrichment records in '${config.listingEnrichmentIndex}'.`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
