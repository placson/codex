export const DEFAULT_LISTINGS_INDEX = process.env.LISTINGS_INDEX || "listings";
export const DEFAULT_PRODUCT_TAXONOMY_INDEX =
  process.env.PRODUCT_TAXONOMY_INDEX || "product_taxonomy";

export const FACET_FIELDS = [
  { key: "categories", label: "Categories" },
  { key: "industries", label: "Industries" },
  { key: "capabilities", label: "Capabilities" },
  { key: "deploymentModels", label: "Deployment Models" },
  { key: "attachmentTypes", label: "Attachment Types" },
];

export const PRODUCT_FACET_FIELDS = [
  { key: "productIds", label: "Products" },
  { key: "productCategoryKeys", label: "Categories" },
  { key: "productFilterKeys", label: "Filters" },
];

export const SEARCH_FILTER_FIELDS = [...FACET_FIELDS, ...PRODUCT_FACET_FIELDS];

const TEXT_FIELDS = [
  "displayName",
  "headline",
  "tagline",
  "shortDescription",
  "longDescription",
  "publisher",
];

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

function arrayFromValue(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => arrayFromValue(entry));
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap((entry) => arrayFromValue(entry));
  }

  return [String(value)];
}

function normalizeListingType(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized;
}

function uniq(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAttachments(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : value
        ? [value]
        : [];

  return source.flatMap((entry, index) => {
    if (!entry) {
      return [];
    }

    if (typeof entry === "string") {
      return [{
        id: `attachment-${index + 1}-reference`,
        name: entry.split("/").pop() || `Attachment ${index + 1}`,
        type: "reference",
        contentUrl: entry,
      }];
    }

    const contentUrl = entry.contentUrl || entry.url || entry.href || "";
    const type = entry.type || entry.kind || entry.attachmentType || "reference";
    return [{
      id: entry.id || `attachment-${index + 1}-${type.toLowerCase()}`,
      name: entry.name || entry.displayName || entry.title || entry.label || `Attachment ${index + 1}`,
      type,
      contentUrl,
      mimeType: entry.mimeType || entry.contentType || "",
    }];
  });
}

function normalizeProductId(rawProduct) {
  return slugify(rawProduct?.code || rawProduct?.productName || "unknown-product");
}

function normalizeTaxonomyNodeId(rawNode) {
  return slugify(rawNode?.code || rawNode?.name || "unknown");
}

function taxonomyLabel(rawNode, fallback) {
  return plainText(rawNode?.name || rawNode?.code || fallback || "Unknown");
}

function buildFilterNodes(rawProduct) {
  const nodes = [];

  for (const rawFilter of rawProduct.additionalFilters || []) {
    const groupId = slugify(rawFilter.filterCode || rawFilter.filterCodeName || "filter-group");
    const groupLabel = plainText(rawFilter.filterCodeName || rawFilter.filterCode || "Filter");

    if (Array.isArray(rawFilter.filterProperties) && rawFilter.filterProperties.length) {
      for (const property of rawFilter.filterProperties) {
        const propertyId = slugify(
          property.filterPropertyCode || property.filterPropertyCodeName || "unknown",
        );
        nodes.push({
          id: propertyId,
          label: plainText(
            property.filterPropertyCodeName || property.filterPropertyCode || propertyId,
          ),
          aliases: uniq([
            property.filterPropertyCode,
            property.filterPropertyCodeName,
            rawFilter.filterCode,
            rawFilter.filterCodeName,
          ].filter(Boolean)),
          groupId,
          groupLabel,
        });
      }
      continue;
    }

    const fallbackId = slugify(rawFilter.filterCode || rawFilter.filterCodeName || "unknown");
    nodes.push({
      id: fallbackId,
      label: plainText(rawFilter.filterCodeName || rawFilter.filterCode || fallbackId),
      aliases: uniq([rawFilter.filterCode, rawFilter.filterCodeName].filter(Boolean)),
      groupId,
      groupLabel,
    });
  }

  return nodes;
}

function buildScopedKey(productId, nodeId) {
  return `${productId}/${nodeId}`;
}

function buildProductMemberships(rawProducts = []) {
  const memberships = new Map();
  const productIds = [];
  const productCategoryKeys = [];
  const productFilterKeys = [];
  const derivedCategoryLabels = [];

  for (const rawProduct of rawProducts) {
    const productId = normalizeProductId(rawProduct);

    if (!memberships.has(productId)) {
      memberships.set(productId, {
        productId,
        categoryIds: new Set(),
        filterIds: new Set(),
      });
      productIds.push(productId);
    }

    const membership = memberships.get(productId);

    for (const rawCategory of rawProduct.categories || []) {
      const categoryId = normalizeTaxonomyNodeId(rawCategory);
      membership.categoryIds.add(categoryId);
      productCategoryKeys.push(buildScopedKey(productId, categoryId));
      derivedCategoryLabels.push(taxonomyLabel(rawCategory, categoryId));
    }

    for (const rawFilter of rawProduct.additionalFilters || []) {
      for (const filterNode of buildFilterNodes({ additionalFilters: [rawFilter] })) {
        membership.filterIds.add(filterNode.id);
        productFilterKeys.push(buildScopedKey(productId, filterNode.id));
      }
    }
  }

  return {
    productIds: uniq(productIds),
    productCategoryKeys: uniq(productCategoryKeys),
    productFilterKeys: uniq(productFilterKeys),
    derivedCategoryLabels: uniq(derivedCategoryLabels),
    productMemberships: [...memberships.values()].map((membership) => ({
      productId: membership.productId,
      categoryIds: [...membership.categoryIds].sort(),
      filterIds: [...membership.filterIds].sort(),
    })),
  };
}

export function normalizeListing(raw, index = 0) {
  const displayName = raw.displayName || raw.name || raw.title || `Listing ${index + 1}`;
  const productStructure = buildProductMemberships(raw.products || []);
  const industries = arrayFromValue(
    (raw.industries || []).map((industry) => industry.name || industry.code || industry),
  );
  const attachments = [
    ...normalizeAttachments(raw.attachments),
    ...normalizeAttachments(raw.supportLinks),
    ...normalizeAttachments(raw.demoUrl ? [{ name: "Demo", type: "demo", contentUrl: raw.demoUrl }] : []),
    ...normalizeAttachments(
      raw.downloadInfo?.url
        ? [{
            name: raw.downloadInfo.description || "Download",
            type: "download",
            contentUrl: raw.downloadInfo.url,
          }]
        : [],
    ),
  ];
  const logoSource =
    raw.logo?.contentUrl ||
    raw.icon?.contentUrl ||
    raw.partner?.logo?.contentUrl ||
    raw.logoUrl ||
    raw.iconUrl ||
    "";

  return {
    id: raw.id || raw.slug || slugify(displayName) || `listing-${index + 1}`,
    displayName: plainText(displayName),
    headline: plainText(raw.headline || raw.tagline || ""),
    tagline: plainText(raw.tagline || raw.headline || ""),
    shortDescription: plainText(raw.shortDescription || raw.summary || ""),
    longDescription: plainText(raw.longDescription || raw.description || raw.shortDescription || ""),
    publisher: plainText(
      raw.publisher || raw.vendor || raw.partner?.name || raw.partner?.displayName || "",
    ),
    categories: uniq(
      arrayFromValue(raw.categories || raw.category || raw.solutionAreas || productStructure.derivedCategoryLabels),
    ),
    industries: uniq(arrayFromValue(raw.industry || raw.verticals || industries)),
    capabilities: uniq(arrayFromValue(raw.capabilities || raw.features || raw.useCases || raw.solutionType)),
    deploymentModels: uniq(
      arrayFromValue(
        raw.deploymentModels || raw.deployment || raw.hostingModels || raw.deployOption || raw.pricingType,
      ),
    ),
    tags: uniq(arrayFromValue(raw.tags || raw.keywords)),
    attachmentTypes: uniq(attachments.map((attachment) => attachment.type)),
    listingType: normalizeListingType(raw.listingType),
    productIds: productStructure.productIds,
    productCategoryKeys: productStructure.productCategoryKeys,
    productFilterKeys: productStructure.productFilterKeys,
    productMemberships: productStructure.productMemberships,
    logo: {
      contentUrl: logoSource,
      altText: raw.logo?.altText || `${displayName} logo`,
    },
    attachments,
    rawSource: raw,
  };
}

export function buildProductTaxonomyEntries(rawListings) {
  const products = new Map();

  for (const rawListing of rawListings) {
    for (const rawProduct of rawListing.products || []) {
      const productId = normalizeProductId(rawProduct);

      if (!products.has(productId)) {
        products.set(productId, {
          id: productId,
          sourceCode: plainText(rawProduct.code || ""),
          label: plainText(rawProduct.productName || rawProduct.code || productId),
          productGroup: plainText(rawProduct.productGroup || ""),
          status: "active",
          categories: new Map(),
          filters: new Map(),
        });
      }

      const product = products.get(productId);

      for (const rawCategory of rawProduct.categories || []) {
        const categoryId = normalizeTaxonomyNodeId(rawCategory);
        if (!product.categories.has(categoryId)) {
          product.categories.set(categoryId, {
            id: categoryId,
            label: taxonomyLabel(rawCategory, categoryId),
            aliases: [],
            status: "active",
          });
        }

        const category = product.categories.get(categoryId);
        category.aliases = uniq([
          ...category.aliases,
          rawCategory.code,
          rawCategory.name,
        ].filter(Boolean).filter((alias) => alias !== category.label));
      }

      for (const filterNode of buildFilterNodes(rawProduct)) {
        const filterId = filterNode.id;
        if (!product.filters.has(filterId)) {
          product.filters.set(filterId, {
            id: filterId,
            label: filterNode.label,
            aliases: [],
            status: "active",
            groupId: filterNode.groupId,
            groupLabel: filterNode.groupLabel,
          });
        }

        const filter = product.filters.get(filterId);
        filter.aliases = uniq([
          ...filter.aliases,
          ...filterNode.aliases,
        ].filter(Boolean).filter((alias) => alias !== filter.label));
      }
    }
  }

  return [...products.values()]
    .map((product) => ({
      id: product.id,
      sourceCode: product.sourceCode,
      label: product.label,
      productGroup: product.productGroup,
      status: product.status,
      categories: [...product.categories.values()].sort((a, b) => a.label.localeCompare(b.label)),
      filters: [...product.filters.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildListingsIndexDefinition() {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      dynamic: true,
      properties: {
        id: { type: "keyword" },
        displayName: {
          type: "text",
          fields: {
            keyword: { type: "keyword" },
          },
        },
        headline: { type: "text" },
        tagline: { type: "text" },
        shortDescription: { type: "text" },
        longDescription: { type: "text" },
        publisher: {
          type: "text",
          fields: {
            keyword: { type: "keyword" },
          },
        },
        categories: { type: "keyword" },
        industries: { type: "keyword" },
        capabilities: { type: "keyword" },
        deploymentModels: { type: "keyword" },
        tags: { type: "keyword" },
        attachmentTypes: { type: "keyword" },
        listingType: { type: "keyword" },
        productIds: { type: "keyword" },
        productCategoryKeys: { type: "keyword" },
        productFilterKeys: { type: "keyword" },
        productMemberships: {
          type: "object",
          properties: {
            productId: { type: "keyword" },
            categoryIds: { type: "keyword" },
            filterIds: { type: "keyword" },
          },
        },
        logo: {
          properties: {
            contentUrl: { type: "keyword" },
            altText: { type: "text" },
          },
        },
        attachments: {
          type: "object",
          properties: {
            id: { type: "keyword" },
            name: { type: "text" },
            type: { type: "keyword" },
            contentUrl: { type: "keyword" },
            mimeType: { type: "keyword" },
          },
        },
        rawSource: {
          enabled: false,
        },
      },
    },
  };
}

export function buildProductTaxonomyIndexDefinition() {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
    mappings: {
      dynamic: true,
      properties: {
        id: { type: "keyword" },
        sourceCode: { type: "keyword" },
        label: {
          type: "text",
          fields: {
            keyword: { type: "keyword" },
          },
        },
        productGroup: { type: "keyword" },
        status: { type: "keyword" },
        categories: {
          type: "object",
          properties: {
            id: { type: "keyword" },
            label: {
              type: "text",
              fields: {
                keyword: { type: "keyword" },
              },
            },
            aliases: { type: "keyword" },
            status: { type: "keyword" },
          },
        },
        filters: {
          type: "object",
          properties: {
            id: { type: "keyword" },
            label: {
              type: "text",
              fields: {
                keyword: { type: "keyword" },
              },
            },
            aliases: { type: "keyword" },
            status: { type: "keyword" },
            groupId: { type: "keyword" },
            groupLabel: {
              type: "text",
              fields: {
                keyword: { type: "keyword" },
              },
            },
          },
        },
      },
    },
  };
}

export function buildSearchBody({ q, filters, from = 0, size = 12 }) {
  const filterClauses = SEARCH_FILTER_FIELDS.flatMap(({ key }) =>
    filters[key]?.length ? [{ terms: { [key]: filters[key] } }] : [],
  );

  const mustClauses = [];

  if (q) {
    mustClauses.push({
      multi_match: {
        query: q,
        type: "best_fields",
        fields: [
          "displayName^5",
          "headline^4",
          "tagline^4",
          "shortDescription^3",
          "longDescription^2",
          "publisher^2",
          "categories^3",
          "capabilities^3",
          "tags^2",
        ],
      },
    });
  }

  const query = mustClauses.length || filterClauses.length
    ? {
        bool: {
          must: mustClauses,
          filter: filterClauses,
        },
      }
    : { match_all: {} };

  const aggs = Object.fromEntries(
    SEARCH_FILTER_FIELDS.map(({ key }) => [
      key,
      {
        terms: {
          field: key,
          size: 12,
        },
      },
    ]),
  );

  return {
    from,
    size,
    query,
    aggs,
    sort: q ? [{ _score: "desc" }, { "displayName.keyword": "asc" }] : [{ "displayName.keyword": "asc" }],
  };
}

export function coerceArrayParam(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return uniq(value.flatMap((entry) => entry.split(",")));
  }

  return uniq(String(value).split(","));
}

export function summarizeListing(listing) {
  return TEXT_FIELDS.reduce((allText, field) => {
    if (listing[field]) {
      allText.push(listing[field]);
    }
    return allText;
  }, []).join(" ");
}
