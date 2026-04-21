import { client } from "../server/opensearch.js";
import { config } from "../server/config.js";
import {
  buildListingsIndexDefinition,
  buildProductTaxonomyIndexDefinition,
} from "../shared/listings.js";

function unwrap(result) {
  return result?.body ?? result;
}

async function run() {
  const definitions = [
    [config.listingsIndex, buildListingsIndexDefinition()],
    [config.productTaxonomyIndex, buildProductTaxonomyIndexDefinition()],
  ];

  for (const [indexName, body] of definitions) {
    const existsResponse = unwrap(
      await client.indices.exists({
        index: indexName,
      }),
    );

    const exists = typeof existsResponse === "boolean" ? existsResponse : Boolean(existsResponse);

    if (exists) {
      console.log(`Index '${indexName}' already exists.`);
      continue;
    }

    await client.indices.create({
      index: indexName,
      body,
    });

    console.log(`Created index '${indexName}'.`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
