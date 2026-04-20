function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function truncate(value, maxLength = 320) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildProductCandidates(product) {
  return uniq([
    product.id,
    product.sourceCode,
    product.label,
    ...(product.aliases || []),
  ]);
}

function buildTaxonomyLookup(products = []) {
  const productById = new Map();
  const categoryByKey = new Map();
  const filterByKey = new Map();

  for (const product of products) {
    productById.set(product.id, product);

    for (const category of product.categories || []) {
      categoryByKey.set(`${product.id}/${category.id}`, category.label);
    }

    for (const filter of product.filters || []) {
      filterByKey.set(`${product.id}/${filter.id}`, filter.label);
    }
  }

  return {
    productById,
    categoryByKey,
    filterByKey,
  };
}

function inferMentionedProducts(listing, taxonomyProducts) {
  const listingText = normalizeText([
    listing.displayName,
    listing.headline,
    listing.tagline,
    listing.shortDescription,
    listing.longDescription,
    ...(listing.categories || []),
    ...(listing.tags || []),
  ].join(" "));

  const matches = [];

  for (const product of taxonomyProducts) {
    if ((listing.productIds || []).includes(product.id)) {
      continue;
    }

    const candidates = buildProductCandidates(product);
    let matched = false;

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeText(candidate);
      if (!normalizedCandidate || normalizedCandidate.length < 4) {
        continue;
      }

      if (listingText.includes(normalizedCandidate)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      matches.push(product);
    }
  }

  return matches;
}

export function buildListingEnrichmentIndexDefinition() {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      dynamic: true,
      properties: {
        id: { type: "keyword" },
        listingId: { type: "keyword" },
        enrichmentVersion: { type: "integer" },
        listingType: { type: "keyword" },
        productIds: { type: "keyword" },
        productLabels: { type: "keyword" },
        productCategoryKeys: { type: "keyword" },
        categoryLabels: { type: "keyword" },
        productFilterKeys: { type: "keyword" },
        filterLabels: { type: "keyword" },
        mentionedProductIds: { type: "keyword" },
        mentionedProductLabels: { type: "keyword" },
        industries: { type: "keyword" },
        capabilities: { type: "keyword" },
        tags: { type: "keyword" },
        useCases: { type: "keyword" },
        publisher: {
          type: "text",
          fields: {
            keyword: { type: "keyword" },
          },
        },
        profile: { type: "text" },
        retrievalText: { type: "text" },
      },
    },
  };
}

export function deriveListingEnrichment(listing, taxonomyProducts = []) {
  const taxonomy = buildTaxonomyLookup(taxonomyProducts);
  const directProducts = (listing.productIds || [])
    .map((productId) => taxonomy.productById.get(productId))
    .filter(Boolean);
  const mentionedProducts = inferMentionedProducts(listing, taxonomyProducts);
  const productLabels = uniq(directProducts.map((product) => product.label));
  const categoryLabels = uniq(
    (listing.productCategoryKeys || [])
      .map((key) => taxonomy.categoryByKey.get(key))
      .filter(Boolean),
  );
  const filterLabels = uniq(
    (listing.productFilterKeys || [])
      .map((key) => taxonomy.filterByKey.get(key))
      .filter(Boolean),
  );
  const mentionedProductIds = uniq(mentionedProducts.map((product) => product.id));
  const mentionedProductLabels = uniq(mentionedProducts.map((product) => product.label));
  const useCases = uniq([
    ...(listing.categories || []),
    ...(listing.capabilities || []),
    ...(listing.tags || []),
    ...categoryLabels,
    ...filterLabels,
  ]);

  const profileParts = [
    listing.displayName ? `${listing.displayName} is a ${String(listing.listingType || "solution").replace(/_/g, " ").toLowerCase()}.` : "",
    listing.publisher ? `Published by ${listing.publisher}.` : "",
    productLabels.length ? `Direct Oracle products: ${productLabels.join(", ")}.` : "",
    mentionedProductLabels.length ? `Mentions or supports: ${mentionedProductLabels.join(", ")}.` : "",
    categoryLabels.length ? `Product categories: ${categoryLabels.join(", ")}.` : "",
    filterLabels.length ? `Product filters: ${filterLabels.join(", ")}.` : "",
    listing.shortDescription || listing.tagline || "",
    truncate(listing.longDescription, 420),
  ].filter(Boolean);

  return {
    id: listing.id,
    listingId: listing.id,
    enrichmentVersion: 1,
    listingType: listing.listingType || "",
    productIds: listing.productIds || [],
    productLabels,
    productCategoryKeys: listing.productCategoryKeys || [],
    categoryLabels,
    productFilterKeys: listing.productFilterKeys || [],
    filterLabels,
    mentionedProductIds,
    mentionedProductLabels,
    industries: listing.industries || [],
    capabilities: listing.capabilities || [],
    tags: listing.tags || [],
    useCases,
    publisher: listing.publisher || "",
    profile: profileParts.join(" "),
    retrievalText: [
      listing.displayName,
      listing.headline,
      listing.tagline,
      listing.shortDescription,
      listing.longDescription,
      listing.publisher,
      ...productLabels,
      ...mentionedProductLabels,
      ...categoryLabels,
      ...filterLabels,
      ...(listing.categories || []),
      ...(listing.industries || []),
      ...(listing.capabilities || []),
      ...(listing.tags || []),
    ].filter(Boolean).join("\n"),
  };
}
