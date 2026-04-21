import fs from "node:fs/promises";
import path from "node:path";
import { client } from "../server/opensearch.js";
import { config } from "../server/config.js";
import {
  buildListingsIndexDefinition,
  buildProductTaxonomyEntries,
  buildProductTaxonomyIndexDefinition,
  normalizeListing,
} from "../shared/listings.js";

function unwrap(result) {
  return result?.body ?? result;
}

function parseArgs(argv) {
  const args = {
    inputPath: "",
    replace: false,
  };

  for (const value of argv) {
    if (value === "--replace") {
      args.replace = true;
      continue;
    }

    if (!args.inputPath) {
      args.inputPath = value;
    }
  }

  return args;
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

async function bulkIndex(indexName, records, batchSize = 200) {
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
        `Bulk import failed for '${indexName}' in batch ${Math.floor(start / batchSize) + 1} with ${failures.length} items.`,
      );
    }

    console.log(`Indexed ${Math.min(start + batch.length, records.length)} / ${records.length} records into '${indexName}'...`);
  }
}

function parsePayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.listings)) {
    return payload.listings;
  }

  throw new Error("Input JSON must be a root array or an object with a 'listings' array.");
}

async function run() {
  const { inputPath, replace } = parseArgs(process.argv.slice(2));

  if (!inputPath) {
    throw new Error("Usage: npm run import:listings -- <path-to-json> [--replace]");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const rawFile = await fs.readFile(absolutePath, "utf8");
  const rawPayload = JSON.parse(rawFile);
  const rawListings = parsePayload(rawPayload);
  const taxonomyEntries = buildProductTaxonomyEntries(rawListings);
  const listings = rawListings.map((entry, index) => normalizeListing(entry, index));

  await ensureIndex(config.productTaxonomyIndex, buildProductTaxonomyIndexDefinition(), replace);
  await ensureIndex(config.listingsIndex, buildListingsIndexDefinition(), replace);

  await bulkIndex(config.productTaxonomyIndex, taxonomyEntries, 100);
  await bulkIndex(config.listingsIndex, listings, 200);

  console.log(
    `Imported ${taxonomyEntries.length} products into '${config.productTaxonomyIndex}' and ${listings.length} listings into '${config.listingsIndex}'.`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
