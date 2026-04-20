import { embedTextDeterministic } from "./vector.js";

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

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

function safeUrl(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function tokenizePathname(pathname = "") {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => normalizeText(segment).split(" ").filter(Boolean));
}

function buildAttachmentDescriptors(attachments = []) {
  const resourceNames = [];
  const resourceKinds = [];
  const resourceHosts = [];
  const resourceUrls = [];
  const resourceMetadata = [];

  for (const attachment of attachments) {
    const name = plainText(attachment.name || "");
    const type = String(attachment.type || "reference").trim();
    const parsedUrl = safeUrl(attachment.contentUrl);
    const host = parsedUrl?.hostname || "";
    const pathTokens = parsedUrl ? tokenizePathname(parsedUrl.pathname) : [];
    const metadata = [
      name ? `Resource name ${name}.` : "",
      type ? `Resource type ${type}.` : "",
      host ? `Resource host ${host}.` : "",
      pathTokens.length ? `Resource path ${pathTokens.join(" ")}.` : "",
    ].filter(Boolean).join(" ");

    if (name) {
      resourceNames.push(name);
    }

    if (type) {
      resourceKinds.push(type);
    }

    if (host) {
      resourceHosts.push(host);
    }

    if (attachment.contentUrl) {
      resourceUrls.push(attachment.contentUrl);
    }

    if (metadata) {
      resourceMetadata.push(metadata);
    }
  }

  return {
    resourceNames: uniq(resourceNames),
    resourceKinds: uniq(resourceKinds),
    resourceHosts: uniq(resourceHosts),
    resourceUrls: uniq(resourceUrls),
    resourceMetadata: uniq(resourceMetadata),
  };
}

function stripHtml(value) {
  return plainText(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  );
}

async function fetchResourceText(attachment, options = {}, cache = new Map()) {
  const contentUrl = String(attachment?.contentUrl || "").trim();

  if (!options.enableResourceFetch || !contentUrl) {
    return "";
  }

  const parsedUrl = safeUrl(contentUrl);

  if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return "";
  }

  if (cache.has(contentUrl)) {
    return cache.get(contentUrl);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.resourceFetchTimeoutMs || 1200);

  try {
    const response = await fetch(contentUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,text/plain,application/json,application/xml,text/xml;q=0.9,*/*;q=0.1",
        "User-Agent": "OracleMarketplaceEnrichment/1.0",
      },
    });

    if (!response.ok) {
      cache.set(contentUrl, "");
      return "";
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (!/(text\/html|text\/plain|application\/json|application\/xml|text\/xml)/.test(contentType)) {
      cache.set(contentUrl, "");
      return "";
    }

    const body = await response.text();
    const extracted = /(text\/html|application\/xml|text\/xml)/.test(contentType)
      ? stripHtml(body)
      : plainText(body);
    const truncated = truncate(extracted, options.resourceFetchMaxChars || 1800);
    cache.set(contentUrl, truncated);
    return truncated;
  } catch {
    cache.set(contentUrl, "");
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function buildResourceFetchTexts(attachments = [], options = {}) {
  const resourceText = [];
  const cache = options.resourceCache || new Map();

  for (const attachment of attachments.slice(0, options.resourceFetchMaxAttachments || 2)) {
    const fetchedText = await fetchResourceText(attachment, options, cache);

    if (fetchedText) {
      resourceText.push(
        truncate([
          attachment.name ? `Resource ${attachment.name}.` : "",
          fetchedText,
        ].filter(Boolean).join(" "), options.resourceFetchMaxChars || 1800),
      );
    }
  }

  return uniq(resourceText);
}

export function buildListingEnrichmentIndexDefinition({ embeddingDimension = 256 } = {}) {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      index: {
        knn: true,
      },
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
        categories: { type: "keyword" },
        industries: { type: "keyword" },
        capabilities: { type: "keyword" },
        deploymentModels: { type: "keyword" },
        attachmentTypes: { type: "keyword" },
        tags: { type: "keyword" },
        useCases: { type: "keyword" },
        resourceNames: { type: "keyword" },
        resourceKinds: { type: "keyword" },
        resourceHosts: { type: "keyword" },
        resourceUrls: { type: "keyword" },
        resourceMetadata: { type: "text" },
        resourceText: { type: "text" },
        publisher: {
          type: "text",
          fields: {
            keyword: { type: "keyword" },
          },
        },
        profile: { type: "text" },
        retrievalText: { type: "text" },
        semanticText: { type: "text" },
        semanticEmbedding: {
          type: "knn_vector",
          dimension: embeddingDimension,
          method: {
            name: "hnsw",
            engine: "lucene",
            space_type: "cosinesimil",
          },
        },
      },
    },
  };
}

export async function deriveListingEnrichment(listing, taxonomyProducts = [], options = {}) {
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
  const attachmentDescriptors = buildAttachmentDescriptors(listing.attachments || []);
  const fetchedResourceText = await buildResourceFetchTexts(listing.attachments || [], options);
  const useCases = uniq([
    ...(listing.categories || []),
    ...(listing.capabilities || []),
    ...(listing.tags || []),
    ...categoryLabels,
    ...filterLabels,
    ...attachmentDescriptors.resourceNames,
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
    attachmentDescriptors.resourceMetadata.length ? `Resource context: ${attachmentDescriptors.resourceMetadata.join(" ")}` : "",
  ].filter(Boolean);

  const semanticText = [
    ...profileParts,
    ...fetchedResourceText,
    [
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
      ...attachmentDescriptors.resourceNames,
      ...attachmentDescriptors.resourceKinds,
      ...attachmentDescriptors.resourceHosts,
    ].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n");

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
    categories: listing.categories || [],
    industries: listing.industries || [],
    capabilities: listing.capabilities || [],
    deploymentModels: listing.deploymentModels || [],
    attachmentTypes: listing.attachmentTypes || [],
    tags: listing.tags || [],
    useCases,
    resourceNames: attachmentDescriptors.resourceNames,
    resourceKinds: attachmentDescriptors.resourceKinds,
    resourceHosts: attachmentDescriptors.resourceHosts,
    resourceUrls: attachmentDescriptors.resourceUrls,
    resourceMetadata: attachmentDescriptors.resourceMetadata,
    resourceText: fetchedResourceText,
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
      ...attachmentDescriptors.resourceNames,
      ...attachmentDescriptors.resourceKinds,
      ...attachmentDescriptors.resourceHosts,
      ...attachmentDescriptors.resourceMetadata,
      ...fetchedResourceText,
    ].filter(Boolean).join("\n"),
    semanticText,
    semanticEmbedding: options.includeEmbedding === false
      ? undefined
      : embedTextDeterministic(semanticText, {
          dimension: options.embeddingDimension || 256,
        }),
  };
}
