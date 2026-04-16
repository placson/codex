import { client } from "./opensearch.js";
import { config } from "./config.js";
import {
  FACET_FIELDS,
  PRODUCT_FACET_FIELDS,
  buildSearchBody,
} from "../shared/listings.js";

function unwrap(result) {
  return result?.body || result;
}

function mergeCountsIntoTaxonomy(products, counts) {
  return products.map((product) => ({
    ...product,
    listingCount: counts.productCounts.get(product.id) || 0,
    categories: (product.categories || []).map((category) => ({
      ...category,
      listingCount: counts.categoryCounts.get(`${product.id}/${category.id}`) || 0,
    })),
    filters: (product.filters || []).map((filter) => ({
      ...filter,
      listingCount: counts.filterCounts.get(`${product.id}/${filter.id}`) || 0,
    })),
  }));
}

function mapBuckets(buckets = []) {
  return new Map(buckets.map((bucket) => [bucket.key, bucket.doc_count]));
}

async function getTaxonomyCounts() {
  const result = unwrap(
    await client.search({
      index: config.listingsIndex,
      body: {
        size: 0,
        aggs: {
          productIds: { terms: { field: "productIds", size: 500 } },
          productCategoryKeys: { terms: { field: "productCategoryKeys", size: 5000 } },
          productFilterKeys: { terms: { field: "productFilterKeys", size: 5000 } },
        },
      },
    }),
  );

  return {
    productCounts: mapBuckets(result.aggregations?.productIds?.buckets),
    categoryCounts: mapBuckets(result.aggregations?.productCategoryKeys?.buckets),
    filterCounts: mapBuckets(result.aggregations?.productFilterKeys?.buckets),
  };
}

function buildTaxonomyLookup(products) {
  const productById = new Map();
  const categoryByKey = new Map();
  const filterByKey = new Map();

  for (const product of products) {
    productById.set(product.id, product);

    for (const category of product.categories || []) {
      categoryByKey.set(`${product.id}/${category.id}`, {
        label: category.label,
        productLabel: product.label,
      });
    }

    for (const filter of product.filters || []) {
      filterByKey.set(`${product.id}/${filter.id}`, {
        label: filter.label,
        productLabel: product.label,
      });
    }
  }

  return { productById, categoryByKey, filterByKey };
}

function formatFacets(aggregations = {}, taxonomyProducts = []) {
  const taxonomy = buildTaxonomyLookup(taxonomyProducts);

  const baseFacets = Object.fromEntries(
    FACET_FIELDS.map(({ key, label }) => [
      key,
      {
        label,
        values: (aggregations[key]?.buckets || []).map((bucket) => ({
          value: bucket.key,
          label: bucket.key,
          count: bucket.doc_count,
        })),
      },
    ]),
  );

  const productFacets = Object.fromEntries(
    PRODUCT_FACET_FIELDS.map(({ key, label }) => [
      key,
      {
        label,
        values: (aggregations[key]?.buckets || []).map((bucket) => {
          if (key === "productIds") {
            const product = taxonomy.productById.get(bucket.key);
            return {
              value: bucket.key,
              label: product?.label || bucket.key,
              count: bucket.doc_count,
            };
          }

          if (key === "productCategoryKeys") {
            const category = taxonomy.categoryByKey.get(bucket.key);
            return {
              value: bucket.key,
              label: category?.label || bucket.key.split("/")[1] || bucket.key,
              productLabel: category?.productLabel || bucket.key.split("/")[0],
              count: bucket.doc_count,
            };
          }

          const filter = taxonomy.filterByKey.get(bucket.key);
          return {
            value: bucket.key,
            label: filter?.label || bucket.key.split("/")[1] || bucket.key,
            productLabel: filter?.productLabel || bucket.key.split("/")[0],
            count: bucket.doc_count,
          };
        }),
      },
    ]),
  );

  return {
    ...baseFacets,
    ...productFacets,
  };
}

export async function searchListings({ q = "", filters = {}, page = 1, pageSize = 12 }) {
  const from = Math.max(page - 1, 0) * pageSize;
  const body = buildSearchBody({ q, filters, from, size: pageSize });
  const [result, taxonomyProducts] = await Promise.all([
    unwrap(
      await client.search({
        index: config.listingsIndex,
        body,
      }),
    ),
    getProductTaxonomy(),
  ]);

  const totalHits = typeof result.hits?.total === "number"
    ? result.hits.total
    : result.hits?.total?.value || 0;

  return {
    total: totalHits,
    took: result.took || 0,
    page,
    pageSize,
    hits: (result.hits?.hits || []).map((hit) => {
      const { rawSource, ...listing } = hit._source || {};
      return {
        id: hit._id,
        score: hit._score,
        ...listing,
      };
    }),
    facets: formatFacets(result.aggregations, taxonomyProducts),
  };
}

export async function getListingById(id) {
  const result = unwrap(
    await client.get({
      index: config.listingsIndex,
      id,
    }),
  );

  if (!result?._source) {
    return null;
  }

  const { rawSource, ...listing } = result._source;
  return { id: result._id, ...listing };
}

export async function getProductTaxonomy({ includeCounts = false } = {}) {
  const result = unwrap(
    await client.search({
      index: config.productTaxonomyIndex,
      body: {
        size: 500,
        query: { match_all: {} },
        sort: [{ "label.keyword": "asc" }],
      },
    }),
  );

  const products = (result.hits?.hits || []).map((hit) => ({
    id: hit._id,
    ...hit._source,
  }));

  if (!includeCounts) {
    return products;
  }

  const counts = await getTaxonomyCounts();
  return mergeCountsIntoTaxonomy(products, counts);
}

export async function renameTaxonomyProduct(productId, label) {
  const result = unwrap(
    await client.get({
      index: config.productTaxonomyIndex,
      id: productId,
    }),
  );

  if (!result?._source) {
    return null;
  }

  const updated = {
    ...result._source,
    label,
  };

  await client.index({
    index: config.productTaxonomyIndex,
    id: productId,
    refresh: true,
    body: updated,
  });

  return { id: productId, ...updated };
}

export async function renameTaxonomyChild(productId, childType, childId, label) {
  const result = unwrap(
    await client.get({
      index: config.productTaxonomyIndex,
      id: productId,
    }),
  );

  if (!result?._source) {
    return null;
  }

  const collectionKey = childType === "category" ? "categories" : "filters";
  const items = [...(result._source[collectionKey] || [])];
  const targetIndex = items.findIndex((item) => item.id === childId);

  if (targetIndex === -1) {
    return null;
  }

  items[targetIndex] = {
    ...items[targetIndex],
    label,
  };

  const updated = {
    ...result._source,
    [collectionKey]: items,
  };

  await client.index({
    index: config.productTaxonomyIndex,
    id: productId,
    refresh: true,
    body: updated,
  });

  return {
    id: productId,
    ...updated,
  };
}
