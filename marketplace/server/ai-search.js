import { client } from "./opensearch.js";
import { config } from "./config.js";
import { embedText } from "./embeddings.js";
import { getProductTaxonomy } from "./search.js";
import { SEARCH_FILTER_FIELDS } from "../shared/listings.js";
import { cosineSimilarity } from "../shared/vector.js";

const AI_FIELDS = [
  "displayName^8",
  "headline^6",
  "tagline^8",
  "shortDescription^8",
  "longDescription^5",
  "publisher^2",
  "categories^4",
  "tags^4",
];

const LISTING_TYPES = {
  AI_AGENT: "AI_AGENT",
  OCI_APPLICATION: "OCI_APPLICATION",
  LEAD_GENERATION: "LEAD_GENERATION",
  SERVICE: "SERVICE",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "business",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "this",
  "to",
  "we",
  "with",
]);

const GENERIC_SIGNAL_TOKENS = new Set([
  "application",
  "applications",
  "cloud",
  "platform",
  "platforms",
  "product",
  "products",
  "service",
  "services",
  "solution",
  "solutions",
  "suite",
  "system",
  "systems",
  "tool",
  "tools",
]);

const INTENT_RULES = [
  {
    id: "hospitality",
    queryTokens: ["hotel", "hotels", "hospitality", "guest", "guests", "resort", "resorts", "property"],
    listingTokens: ["hotel", "hotels", "hospitality", "guest", "guests", "resort", "resorts", "property"],
    productId: "hospitality",
    boost: 24,
    reason: "Fits hospitality and hotel operations.",
  },
  {
    id: "oci",
    queryTokens: ["oci", "oracle cloud infrastructure", "oracle cloud", "cloud infrastructure"],
    listingTokens: ["oci", "oracle cloud infrastructure"],
    productId: "oci",
    boost: 24,
    reason: "Aligns with Oracle Cloud Infrastructure requirements.",
  },
  {
    id: "operations",
    queryTokens: ["operations", "operational", "maintenance", "housekeeping", "facilities", "quality", "workflow"],
    listingTokens: ["operations", "operational", "maintenance", "housekeeping", "facilities", "quality", "workflow"],
    boost: 18,
    reason: "Targets operational workflow management.",
  },
  {
    id: "cost",
    queryTokens: ["cost", "costs", "efficiency", "efficient", "optimize", "optimization", "reduce"],
    listingTokens: ["cost", "costs", "efficiency", "efficient", "optimization", "optimize", "reduce", "productivity"],
    boost: 14,
    reason: "Supports cost reduction and efficiency goals.",
  },
];

const CONNECTION_PHRASES = [
  "integrates with",
  "integrate with",
  "compatible with",
  "connects with",
  "connect with",
  "connects to",
  "connect to",
  "works with",
  "work with",
  "interfaces with",
  "interface with",
  "syncs with",
  "sync with",
  "hooks into",
  "hook into",
  "runs on",
  "run on",
];

const SEARCH_SOURCE_WEIGHTS = {
  primary: 1,
  enrichment: 1.2,
  connectionText: 1.35,
  connection: 1.15,
};

const AUTOMATION_SIGNAL_TOKENS = [
  "ansible",
  "terraform",
  "saltstack",
  "api",
  "automation",
  "automate",
  "module",
  "sdk",
  "integration",
];

const REMOTE_ACCESS_SIGNAL_TOKENS = [
  "vpn",
  "remote access",
  "off site",
  "offsite",
  "site to site",
  "wireguard",
  "openvpn",
  "ipsec",
  "tunnel",
  "tunneling",
  "secure remote",
];

function unwrap(result) {
  return result?.body || result;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry && !STOP_WORDS.has(entry));
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasAnyPhrase(normalizedQuery, phrases) {
  return phrases.some((phrase) => normalizedQuery.includes(normalizeText(phrase)));
}

function buildProductCandidates(product) {
  return uniq([
    product.id,
    product.sourceCode,
    product.label,
    ...(product.aliases || []),
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function extractIntegrationTargetText(normalizedQuery) {
  for (const phrase of CONNECTION_PHRASES) {
    const normalizedPhrase = normalizeText(phrase);
    const marker = `${normalizedPhrase} `;
    const markerIndex = normalizedQuery.indexOf(marker);

    if (markerIndex === -1) {
      continue;
    }

    const remainder = normalizedQuery.slice(markerIndex + marker.length).trim();
    if (!remainder) {
      continue;
    }

    const rawTokens = remainder.split(" ").filter(Boolean);
    const stopIndex = rawTokens.findIndex((token, index) => {
      if (index === 0) {
        return false;
      }

      return ["that", "which", "who", "while", "and", "or", "but", "for"].includes(token);
    });

    const targetTokens = (stopIndex === -1 ? rawTokens : rawTokens.slice(0, stopIndex)).slice(0, 6);
    const targetText = targetTokens.join(" ").trim();

    if (targetText) {
      return targetText;
    }
  }

  return "";
}

function inferConnectedProductIds(normalizedQuery, taxonomyProducts) {
  const targetText = extractIntegrationTargetText(normalizedQuery);

  if (!targetText) {
    return {
      targetText: "",
      productIds: [],
      labels: [],
    };
  }

  const targetTokens = new Set(tokenize(targetText));
  const matches = [];

  for (const product of taxonomyProducts) {
    const candidates = buildProductCandidates(product);
    let bestScore = 0;

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeText(candidate);
      if (!normalizedCandidate || normalizedCandidate.length < 2) {
        continue;
      }

      if (targetText.includes(normalizedCandidate) || normalizedCandidate.includes(targetText)) {
        bestScore = Math.max(bestScore, normalizedCandidate.split(" ").length + 5);
        continue;
      }

      bestScore = Math.max(
        bestScore,
        labelMatchScore(candidate, targetTokens, targetText),
      );
    }

    if (bestScore >= 3) {
      matches.push({
        productId: product.id,
        label: product.label,
        score: bestScore,
      });
    }
  }

  matches.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  return {
    targetText,
    productIds: matches.map((match) => match.productId),
    labels: matches.map((match) => match.label),
  };
}

function buildConnectionTextSearchBody({ query, targetText, filters, signals, size = 18 }) {
  const filterClauses = SEARCH_FILTER_FIELDS.flatMap(({ key }) =>
    filters[key]?.length ? [{ terms: { [key]: filters[key] } }] : [],
  );

  if (signals.listingTypeIntent.hardFilterTypes.length) {
    filterClauses.push({
      terms: {
        listingType: signals.listingTypeIntent.hardFilterTypes,
      },
    });
  }

  return {
    size,
    _source: {
      excludes: ["rawSource"],
    },
    highlight: {
      pre_tags: ["<em>"],
      post_tags: ["</em>"],
      fields: {
        shortDescription: {
          number_of_fragments: 1,
          fragment_size: 200,
        },
        longDescription: {
          number_of_fragments: 2,
          fragment_size: 220,
        },
      },
    },
    query: {
      bool: {
        filter: filterClauses,
        should: [
          {
            multi_match: {
              query: targetText,
              fields: [
                "shortDescription^12",
                "longDescription^11",
                "tagline^5",
                "headline^4",
                "tags^4",
              ],
              type: "phrase",
              slop: 2,
            },
          },
          {
            multi_match: {
              query,
              fields: [
                "shortDescription^9",
                "longDescription^8",
                "tagline^4",
                "headline^4",
                "tags^3",
              ],
              type: "best_fields",
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
  };
}

function truncateText(value, maxLength = 260) {
  const plain = String(value || "").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}

function cleanHighlight(value) {
  return String(value || "").replace(/<\/?em>/g, "");
}

function labelMatchScore(label, queryTokens, normalizedQuery) {
  const normalizedLabel = normalizeText(label);
  const labelTokens = tokenize(label).filter((token) => !GENERIC_SIGNAL_TOKENS.has(token));

  if (!labelTokens.length) {
    return 0;
  }

  if (!normalizedLabel) {
    return 0;
  }

  if (normalizedQuery.includes(normalizedLabel) && normalizedLabel.length > 3) {
    return normalizedLabel.split(" ").length + 2;
  }

  const overlap = labelTokens.filter((token) => queryTokens.has(token)).length;

  if (!overlap) {
    return 0;
  }

  if (overlap === 1) {
    const matchedToken = labelTokens.find((token) => queryTokens.has(token));
    return matchedToken && matchedToken.length >= 8 ? 2 : 1;
  }

  return overlap + (labelTokens.length === 1 && normalizedLabel.length > 5 ? 1 : 0);
}

function getListingSearchText(listing) {
  return normalizeText([
    listing.displayName,
    listing.headline,
    listing.tagline,
    listing.shortDescription,
    listing.longDescription,
    ...(listing.categories || []),
    ...(listing.tags || []),
  ].join(" "));
}

function inferSignals(query, taxonomyProducts) {
  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(tokenize(query));
  const productIds = new Set();
  const categoryKeys = new Set();
  const filterKeys = new Set();
  const expansionTerms = [];
  const listingTypeIntent = inferListingTypeIntent({ normalizedQuery, queryTokens });
  const connectionIntent = inferConnectedProductIds(normalizedQuery, taxonomyProducts);

  for (const rule of INTENT_RULES) {
    const matched = rule.queryTokens.some((token) => {
      const normalizedToken = normalizeText(token);
      return normalizedToken.includes(" ")
        ? normalizedQuery.includes(normalizedToken)
        : queryTokens.has(normalizedToken);
    });

    if (!matched) {
      continue;
    }

    if (rule.productId) {
      productIds.add(rule.productId);
    }

    expansionTerms.push(...rule.listingTokens);
  }

  for (const product of taxonomyProducts) {
    const productCandidates = uniq([product.id, product.sourceCode, product.label]);
    const matchedProduct = productCandidates.some((candidate) => {
      const normalizedCandidate = normalizeText(candidate);
      return normalizedCandidate.length > 2 && (
        normalizedQuery.includes(normalizedCandidate) || queryTokens.has(normalizedCandidate)
      );
    });

    if (matchedProduct) {
      productIds.add(product.id);
      expansionTerms.push(product.label);
    }

    for (const category of product.categories || []) {
      const score = labelMatchScore(category.label, queryTokens, normalizedQuery);
      if (score >= 2 && (productIds.has(product.id) || score >= 3)) {
        categoryKeys.add(`${product.id}/${category.id}`);
        productIds.add(product.id);
        expansionTerms.push(category.label);
      }
    }

    for (const filter of product.filters || []) {
      const score = labelMatchScore(filter.label, queryTokens, normalizedQuery);
      if (score >= 2 && (productIds.has(product.id) || score >= 3)) {
        filterKeys.add(`${product.id}/${filter.id}`);
        productIds.add(product.id);
        expansionTerms.push(filter.label);
      }
    }
  }

  for (const connectedProductId of connectionIntent.productIds) {
    productIds.add(connectedProductId);
  }

  expansionTerms.push(...connectionIntent.labels);

  return {
    normalizedQuery,
    queryTokens: [...queryTokens],
    productIds: [...productIds],
    categoryKeys: [...categoryKeys],
    filterKeys: [...filterKeys],
    expansionTerms: uniq(expansionTerms.map((value) => String(value).trim()).filter(Boolean)),
    listingTypeIntent,
    connectionIntent,
    compoundIntent: inferCompoundIntent(normalizedQuery),
  };
}

function inferCompoundIntent(normalizedQuery) {
  const needsAutomation = AUTOMATION_SIGNAL_TOKENS.some((token) => normalizedQuery.includes(normalizeText(token)));
  const needsRemoteAccess = REMOTE_ACCESS_SIGNAL_TOKENS.some((token) => normalizedQuery.includes(normalizeText(token)));

  return {
    needsAutomation,
    needsRemoteAccess,
  };
}

function inferListingTypeIntent({ normalizedQuery, queryTokens }) {
  const serviceRequested = hasAnyPhrase(normalizedQuery, [
    "consulting service",
    "consulting services",
    "professional service",
    "professional services",
  ]) || queryTokens.has("service") || queryTokens.has("services") || queryTokens.has("consulting");

  const aiAgentRequested = hasAnyPhrase(normalizedQuery, [
    "ai agent",
    "ai agents",
    "agentic ai",
    "agentic",
    "digital agent",
    "autonomous agent",
  ]);

  const ociRequested = hasAnyPhrase(normalizedQuery, [
    "oci",
    "oracle cloud infrastructure",
    "oracle cloud",
    "compute instance",
    "marketplace image",
  ]);

  if (aiAgentRequested) {
    return {
      mode: "hard-filter",
      hardFilterTypes: [LISTING_TYPES.AI_AGENT],
      priorityTypes: [LISTING_TYPES.AI_AGENT],
      explanation: "Restricted to AI agent listings based on the request.",
    };
  }

  if (serviceRequested) {
    return {
      mode: "priority",
      hardFilterTypes: [],
      priorityTypes: [LISTING_TYPES.SERVICE],
      explanation: "Prioritized services because the request asked for services or consulting.",
    };
  }

  if (ociRequested) {
    return {
      mode: "priority",
      hardFilterTypes: [],
      priorityTypes: [LISTING_TYPES.OCI_APPLICATION, LISTING_TYPES.LEAD_GENERATION],
      explanation: "Prioritized OCI applications first, then lead-generation listings, because the request is OCI-specific.",
    };
  }

  return {
    mode: "none",
    hardFilterTypes: [],
    priorityTypes: [],
    explanation: "",
  };
}

function buildAiSearchBody({
  query,
  filters,
  signals,
  size = 24,
  strictConnectionProductIds = [],
  strictListingIds = [],
}) {
  const filterClauses = SEARCH_FILTER_FIELDS.flatMap(({ key }) =>
    filters[key]?.length ? [{ terms: { [key]: filters[key] } }] : [],
  );

  if (strictListingIds.length) {
    filterClauses.push({
      ids: {
        values: strictListingIds,
      },
    });
  }

  if (strictConnectionProductIds.length) {
    filterClauses.push({
      terms: {
        productIds: strictConnectionProductIds,
      },
    });
  }

  if (signals.listingTypeIntent.hardFilterTypes.length) {
    filterClauses.push({
      terms: {
        listingType: signals.listingTypeIntent.hardFilterTypes,
      },
    });
  }

  const expandedQuery = uniq([query, ...signals.expansionTerms]).join(" ");
  const should = [
    {
      multi_match: {
        query,
        fields: AI_FIELDS,
        type: "best_fields",
      },
    },
    {
      multi_match: {
        query,
        fields: [
          "displayName^10",
          "tagline^9",
          "shortDescription^9",
          "longDescription^6",
        ],
        type: "phrase",
        slop: 3,
      },
    },
  ];

  if (expandedQuery && expandedQuery !== query) {
    should.push({
      multi_match: {
        query: expandedQuery,
        fields: AI_FIELDS,
        type: "best_fields",
      },
    });
  }

  for (const productId of signals.productIds) {
    should.push({
      term: {
        productIds: {
          value: productId,
          boost: signals.connectionIntent.productIds.includes(productId) ? 10 : 4,
        },
      },
    });
  }

  for (const categoryKey of signals.categoryKeys) {
    should.push({
      term: {
        productCategoryKeys: {
          value: categoryKey,
          boost: 2,
        },
      },
    });
  }

  for (const filterKey of signals.filterKeys) {
    should.push({
      term: {
        productFilterKeys: {
          value: filterKey,
          boost: 2,
        },
      },
    });
  }

  signals.listingTypeIntent.priorityTypes.forEach((listingType, index) => {
    should.push({
      term: {
        listingType: {
          value: listingType,
          boost: Math.max(3, 12 - (index * 3)),
        },
      },
    });
  });

  return {
    size,
    _source: {
      excludes: ["rawSource"],
    },
    highlight: {
      pre_tags: ["<em>"],
      post_tags: ["</em>"],
      fields: {
        displayName: {},
        tagline: {},
        shortDescription: {
          number_of_fragments: 1,
          fragment_size: 180,
        },
        longDescription: {
          number_of_fragments: 2,
          fragment_size: 180,
        },
      },
    },
    query: {
      bool: {
        filter: filterClauses,
        should,
        minimum_should_match: 1,
      },
    },
  };
}

function buildEnrichmentSearchBody({ query, signals, size = 18 }) {
  const should = [
    {
      multi_match: {
        query,
        fields: [
          "profile^6",
          "semanticText^6",
          "retrievalText^5",
          "productLabels^7",
          "mentionedProductLabels^5",
          "categoryLabels^4",
          "filterLabels^4",
          "useCases^4",
          "resourceMetadata^3",
          "resourceText^3",
          "resourceHosts^2",
          "resourceNames^3",
          "publisher^2",
        ],
        type: "best_fields",
      },
    },
  ];

  const filterClauses = [];

  if (signals.connectionIntent.productIds.length) {
    filterClauses.push({
      bool: {
        should: [
          { terms: { productIds: signals.connectionIntent.productIds } },
          { terms: { mentionedProductIds: signals.connectionIntent.productIds } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  for (const productId of signals.productIds) {
    should.push({
      term: {
        productIds: {
          value: productId,
          boost: signals.connectionIntent.productIds.includes(productId) ? 8 : 4,
        },
      },
    });

    should.push({
      term: {
        mentionedProductIds: {
          value: productId,
          boost: 3,
        },
      },
    });
  }

  for (const categoryKey of signals.categoryKeys) {
    should.push({
      term: {
        productCategoryKeys: {
          value: categoryKey,
          boost: 3,
        },
      },
    });
  }

  for (const filterKey of signals.filterKeys) {
    should.push({
      term: {
        productFilterKeys: {
          value: filterKey,
          boost: 3,
        },
      },
    });
  }

  signals.listingTypeIntent.priorityTypes.forEach((listingType, index) => {
    should.push({
      term: {
        listingType: {
          value: listingType,
          boost: Math.max(3, 9 - (index * 2)),
        },
      },
    });
  });

  return {
    size,
    _source: ["listingId"],
    query: {
      bool: {
        filter: filterClauses,
        should,
        minimum_should_match: 1,
      },
    },
  };
}

function buildSemanticQueryText(query, signals) {
  return [
    query,
    signals.expansionTerms.join(" "),
    signals.connectionIntent.targetText ? `integration target ${signals.connectionIntent.targetText}` : "",
    signals.compoundIntent.needsAutomation ? "automation integration api orchestration" : "",
    signals.compoundIntent.needsRemoteAccess ? "vpn remote access secure access tunneling" : "",
    signals.listingTypeIntent.priorityTypes.join(" "),
  ].filter(Boolean).join("\n");
}

async function searchListingsSource({ name, body }) {
  const result = unwrap(
    await client.search({
      index: config.listingsIndex,
      body,
    }),
  );

  return {
    name,
    hits: result.hits?.hits || [],
  };
}

function mergeCandidateHits(searchResults = []) {
  const merged = new Map();

  for (const searchResult of searchResults) {
    const sourceName = searchResult.name;

    (searchResult.hits || []).forEach((hit, index) => {
      const existing = merged.get(hit._id);
      const sourceEntry = {
        rank: index + 1,
        score: hit._score || 0,
      };

      if (!existing) {
        merged.set(hit._id, {
          ...hit,
          sourceSignals: {
            [sourceName]: sourceEntry,
          },
        });
        return;
      }

      const currentBestScore = existing._score || 0;
      const nextScore = hit._score || 0;
      const bestHit = nextScore > currentBestScore ? hit : existing;

      merged.set(hit._id, {
        ...bestHit,
        _id: hit._id,
        _source: bestHit._source || existing._source,
        highlight: {
          ...(existing.highlight || {}),
          ...(hit.highlight || {}),
        },
        sourceSignals: {
          ...(existing.sourceSignals || {}),
          [sourceName]: sourceEntry,
        },
      });
    });
  }

  return [...merged.values()];
}

function reciprocalRankFusion(sourceSignals = {}) {
  const k = 60;

  return Object.entries(sourceSignals).reduce((sum, [sourceName, signal]) => (
    sum + ((SEARCH_SOURCE_WEIGHTS[sourceName] || 1) / (k + (signal.rank || k)))
  ), 0);
}

function textContainsAny(text, candidates = []) {
  return candidates.some((candidate) => text.includes(normalizeText(candidate)));
}

function countTargetPhraseMatches(listing, targetText) {
  const normalizedTarget = normalizeText(targetText);

  if (!normalizedTarget) {
    return 0;
  }

  const shortDescription = normalizeText(listing.shortDescription || "");
  const longDescription = normalizeText(listing.longDescription || "");
  const tagline = normalizeText(listing.tagline || "");

  return [shortDescription, longDescription, tagline]
    .filter((value) => value.includes(normalizedTarget))
    .length;
}

async function getEnrichmentCandidateIds({ query, signals, limit = 18 }) {
  try {
    const existsResponse = unwrap(
      await client.indices.exists({
        index: config.listingEnrichmentIndex,
      }),
    );
    const exists = typeof existsResponse === "boolean" ? existsResponse : Boolean(existsResponse);

    if (!exists) {
      return [];
    }

    const result = unwrap(
      await client.search({
        index: config.listingEnrichmentIndex,
        body: buildEnrichmentSearchBody({
          query,
          signals,
          size: limit,
        }),
      }),
    );

    return uniq(
      (result.hits?.hits || []).map((hit) => hit._source?.listingId || hit._id).filter(Boolean),
    );
  } catch (error) {
    if (String(error?.message || "").includes("index_not_found_exception")) {
      return [];
    }

    throw error;
  }
}

async function applyVectorSignals(hits, { query, signals }) {
  if (!config.enableVectorSearch || !hits.length) {
    return hits;
  }

  try {
    const existsResponse = unwrap(
      await client.indices.exists({
        index: config.listingEnrichmentIndex,
      }),
    );
    const exists = typeof existsResponse === "boolean" ? existsResponse : Boolean(existsResponse);

    if (!exists) {
      return hits;
    }

    const listingIds = uniq(hits.map((hit) => hit._id).filter(Boolean));

    if (!listingIds.length) {
      return hits;
    }

    const result = unwrap(
      await client.search({
        index: config.listingEnrichmentIndex,
        body: {
          size: listingIds.length,
          _source: ["listingId", "semanticEmbedding"],
          query: {
            ids: {
              values: listingIds,
            },
          },
        },
      }),
    );

    const queryVector = await embedText(
      buildSemanticQueryText(query, signals),
      { dimension: config.embeddingDimension },
    );
    const similarityByListingId = new Map(
      (result.hits?.hits || []).map((hit) => {
        const listingId = hit._source?.listingId || hit._id;
        return [
          listingId,
          cosineSimilarity(queryVector, hit._source?.semanticEmbedding || []),
        ];
      }),
    );

    const ranked = [...similarityByListingId.entries()]
      .filter(([, similarity]) => similarity > 0.14)
      .sort((left, right) => right[1] - left[1]);
    const rankByListingId = new Map(
      ranked.map(([listingId], index) => [listingId, index + 1]),
    );

    return hits.map((hit) => {
      const similarity = similarityByListingId.get(hit._id) || 0;
      const rank = rankByListingId.get(hit._id);

      if (!rank) {
        return hit;
      }

      return {
        ...hit,
        sourceSignals: {
          ...(hit.sourceSignals || {}),
          vector: {
            rank,
            score: similarity,
          },
        },
      };
    });
  } catch (error) {
    if (String(error?.message || "").includes("index_not_found_exception")) {
      return hits;
    }

    throw error;
  }
}

function listingTypePriorityRank(signals, listingType) {
  const normalizedType = String(listingType || "").trim().toUpperCase();
  const priorityIndex = signals.listingTypeIntent.priorityTypes.indexOf(normalizedType);

  if (priorityIndex !== -1) {
    return priorityIndex;
  }

  if (signals.listingTypeIntent.priorityTypes.length) {
    return signals.listingTypeIntent.priorityTypes.length + 1;
  }

  return Number.MAX_SAFE_INTEGER;
}

function connectionPriorityRank(signals, listingProductIds = []) {
  if (!signals.connectionIntent.productIds.length) {
    return Number.MAX_SAFE_INTEGER;
  }

  return signals.connectionIntent.productIds.some((productId) => listingProductIds.includes(productId))
    ? 0
    : 1;
}

function rerankAiResults(hits, signals, taxonomyLookup) {
  return hits.map((hit) => {
    const listing = hit._source || {};
    const reasons = [];
    const fusionScore = reciprocalRankFusion(hit.sourceSignals || {});
    let rerankScore = (hit._score || 0) + (fusionScore * 500);
    const listingText = getListingSearchText(listing);
    const queryTokenMatches = signals.queryTokens.filter((token) => listingText.includes(token)).length;
    const listingType = String(listing.listingType || "").trim().toUpperCase();
    const hasAutomationSignal = textContainsAny(listingText, AUTOMATION_SIGNAL_TOKENS);
    const hasRemoteAccessSignal = textContainsAny(listingText, REMOTE_ACCESS_SIGNAL_TOKENS);
    const targetPhraseMatches = countTargetPhraseMatches(listing, signals.connectionIntent.targetText);

    if (hit.sourceSignals?.enrichment) {
      rerankScore += 20;
      reasons.push("Matched enriched marketplace retrieval context.");
    }

    if (hit.sourceSignals?.vector) {
      rerankScore += 18 + ((hit.sourceSignals.vector.score || 0) * 110);
      reasons.push("Matched semantic vector similarity across listing and resource context.");
    }

    if (hit.sourceSignals?.connectionText) {
      rerankScore += 30;
      reasons.push("Matched the requested connection target directly in the listing description.");
    }

    if (hit.sourceSignals?.connection) {
      rerankScore += 18;
      reasons.push("Matched the product-scoped integration retrieval pass.");
    }

    for (const rule of INTENT_RULES) {
      const queryMatched = rule.queryTokens.some((token) => {
        const normalizedToken = normalizeText(token);
        return normalizedToken.includes(" ")
          ? signals.normalizedQuery.includes(normalizedToken)
          : signals.queryTokens.includes(normalizedToken);
      });

      if (!queryMatched) {
        continue;
      }

      const listingMatched = rule.listingTokens.some((token) => listingText.includes(normalizeText(token)));
      const productMatched = rule.productId ? (listing.productIds || []).includes(rule.productId) : false;

      if (listingMatched || productMatched) {
        rerankScore += rule.boost;
        reasons.push(rule.reason);
      }
    }

    if (signals.productIds.some((productId) => (listing.productIds || []).includes(productId))) {
      rerankScore += 10;
      reasons.push("Matches the inferred Oracle product scope.");
    }

    if (signals.connectionIntent.productIds.some((productId) => (listing.productIds || []).includes(productId))) {
      rerankScore += 30;
      reasons.push("Belongs to the product you asked the solution to integrate with.");
    }

    if (signals.categoryKeys.some((value) => (listing.productCategoryKeys || []).includes(value))) {
      rerankScore += 8;
      reasons.push("Aligns with the inferred category intent.");
    }

    if (signals.filterKeys.some((value) => (listing.productFilterKeys || []).includes(value))) {
      rerankScore += 6;
      reasons.push("Aligns with the inferred filter intent.");
    }

    const prioritizedTypeIndex = signals.listingTypeIntent.priorityTypes.indexOf(listingType);
    if (prioritizedTypeIndex !== -1) {
      rerankScore += Math.max(10, 24 - (prioritizedTypeIndex * 7));

      if (listingType === LISTING_TYPES.AI_AGENT) {
        reasons.push("Matches the AI agent listing type requested.");
      } else if (listingType === LISTING_TYPES.SERVICE) {
        reasons.push("Matches the requested service-oriented listing type.");
      } else if (listingType === LISTING_TYPES.OCI_APPLICATION) {
        reasons.push("Best matches the OCI-specific request as an OCI application.");
      } else if (listingType === LISTING_TYPES.LEAD_GENERATION) {
        reasons.push("Also fits the OCI-oriented request as a lead-generation listing.");
      }
    }

    if (queryTokenMatches) {
      rerankScore += queryTokenMatches * 2;
    }

    const categoriesText = normalizeText((listing.categories || []).join(" "));
    if (categoriesText.includes("operations") || categoriesText.includes("facilities")) {
      rerankScore += 20;
      reasons.push("Covers operations and facilities workflows.");
    }

    if (listingText.includes("housekeeping") || listingText.includes("maintenance")) {
      rerankScore += 16;
      reasons.push("Includes housekeeping or maintenance workflows.");
    }

    if (signals.compoundIntent.needsAutomation && hasAutomationSignal) {
      rerankScore += 18;
      reasons.push("Matches the requested automation or integration requirement.");
    }

    if (signals.compoundIntent.needsRemoteAccess && hasRemoteAccessSignal) {
      rerankScore += 18;
      reasons.push("Matches the requested remote-access or VPN requirement.");
    }

    if (
      signals.compoundIntent.needsAutomation
      && signals.compoundIntent.needsRemoteAccess
      && hasAutomationSignal
      && hasRemoteAccessSignal
    ) {
      rerankScore += 36;
      reasons.push("Satisfies both the core solution need and the automation requirement together.");
    }

    if (targetPhraseMatches) {
      rerankScore += targetPhraseMatches * 22;
      reasons.push("Includes the requested connection target directly in short or long description.");
    }

    const highlight = hit.highlight || {};
    const excerpt = truncateText(
      cleanHighlight(
        highlight.shortDescription?.[0] ||
        highlight.longDescription?.[0] ||
        highlight.tagline?.[0] ||
        listing.shortDescription ||
        listing.tagline ||
        listing.longDescription,
      ),
      240,
    );

    const productLabels = uniq(
      (listing.productIds || []).map((productId) => taxonomyLookup.get(productId)?.label || productId),
    );

    return {
      id: hit._id,
      score: hit._score,
      fusionScore,
      rerankScore,
      excerpt,
      reasons: uniq(reasons).slice(0, 3),
      productLabels,
      ...listing,
    };
  }).sort((left, right) => {
    const leftConnectionRank = connectionPriorityRank(signals, left.productIds || []);
    const rightConnectionRank = connectionPriorityRank(signals, right.productIds || []);

    if (leftConnectionRank !== rightConnectionRank) {
      return leftConnectionRank - rightConnectionRank;
    }

    const leftTypeRank = listingTypePriorityRank(signals, left.listingType);
    const rightTypeRank = listingTypePriorityRank(signals, right.listingType);

    if (leftTypeRank !== rightTypeRank) {
      return leftTypeRank - rightTypeRank;
    }

    return right.rerankScore - left.rerankScore;
  });
}

function fallbackAnswer(query, suggestions) {
  const [top, second, third] = suggestions;

  if (!top) {
    return `I could not find a strong marketplace match for "${query}". Try adding a product, business domain, or integration target like OCI or Hospitality.`;
  }

  const topReason = buildTopReason(top);
  const topCapability = truncateText(
    top.shortDescription || top.tagline || top.excerpt || top.longDescription,
    140,
  );

  const sentences = [
    `These solutions are the best matches for what you described, and in particular ${top.displayName} stands out because ${topReason}.`,
    topCapability ? `${top.displayName} is especially relevant because ${topCapability.charAt(0).toLowerCase()}${topCapability.slice(1)}.` : "",
    "I've ranked them by what I think best fits what you're looking for.",
  ];

  if (second) {
    sentences.push(`${second.displayName} is another strong option for a similar use case.`);
  }

  if (third) {
    sentences.push(`${third.displayName} is also worth reviewing.`);
  }

  return sentences.filter(Boolean).join(" ");
}

function buildTopReason(top) {
  const reasons = Array.isArray(top?.reasons) ? top.reasons : [];
  const preferredReason = reasons.find((reason) => (
    reason
    && !reason.startsWith("Matched ")
    && ![
      "Matched enriched marketplace retrieval context.",
      "Matched the product-scoped integration retrieval pass.",
    ].includes(reason)
  ));

  if (preferredReason) {
    const normalizedReason = preferredReason.replace(/\.$/, "");
    const loweredReason = normalizedReason.charAt(0).toLowerCase() + normalizedReason.slice(1);

    if (/^(matches|satisfies|belongs|covers|includes|aligns|supports|targets|fits)\b/i.test(loweredReason)) {
      return `it ${loweredReason}`;
    }

    return loweredReason;
  }

  const capability = truncateText(
    top?.shortDescription || top?.tagline || top?.excerpt || top?.longDescription,
    160,
  ).replace(/\.$/, "");

  if (capability) {
    return capability.charAt(0).toLowerCase() + capability.slice(1);
  }

  return "its description aligns closely with your request";
}

function buildDeterministicLead(suggestions) {
  const [top] = suggestions;

  if (!top) {
    return "";
  }

  const topReason = buildTopReason(top);

  return [
    `These solutions are the best matches for what you described, and in particular ${top.displayName} stands out because ${topReason}.`,
    "I've ranked them by what I think best fits what you're looking for.",
  ].join(" ");
}

function cleanGeneratedContinuation(text, lead) {
  const normalizedLead = String(lead || "").trim();
  let cleaned = String(text || "").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "";
  }

  if (normalizedLead && cleaned.startsWith(normalizedLead)) {
    cleaned = cleaned.slice(normalizedLead.length).trim();
  }

  cleaned = cleaned.replace(
    /^these solutions are the best matches for what you described,?\s*/i,
    "",
  );
  cleaned = cleaned.replace(
    /^i(?: have|'ve) ranked them by what i think best fits what you(?:'re| are) looking for\.?\s*/i,
    "",
  );
  cleaned = cleaned.replace(/\s+\./g, ".");

  return cleaned.trim();
}

function buildPrompt(query, suggestions, lead) {
  return [
    "You are Oracle Marketplace AI Search.",
    "Answer the user's request using only the retrieved marketplace listings.",
    "Do not invent capabilities that are not present in the listings.",
    "Keep the answer concise, practical, and written in natural language.",
    "Listing #1 is already the highest-ranked result. Treat it as the top recommendation.",
    "The response must continue after the required opening below. Do not restate or contradict that opening.",
    "Then write one short paragraph summarizing why listing #1 is the best fit and why listings #2 and #3 are the next best alternatives.",
    "Do not use markdown, bold text, bullets, numbering, or labels like 'Strongest match' or 'Alternatives'.",
    "",
    `Required opening: ${lead}`,
    "",
    `User request: ${query}`,
    "",
    "Retrieved listings:",
    ...suggestions.map((listing, index) => [
      `${index + 1}. ${listing.displayName}`,
      `Publisher: ${listing.publisher || "Unknown publisher"}`,
      `Products: ${(listing.productLabels || []).join(", ") || "Unspecified"}`,
      `Listing type: ${listing.listingType || "Unknown"}`,
      `Tagline: ${listing.tagline || "None"}`,
      `Short description: ${listing.shortDescription || "None"}`,
      `Long description: ${truncateText(listing.longDescription, 500) || "None"}`,
      `Why it matched: ${(listing.reasons || []).join(" ") || "Semantic relevance"}`,
    ].join("\n")),
  ].join("\n");
}

function canUseLlm() {
  return config.enableAiLlm
    && config.ociRegion
    && config.ociGenAiApiKey
    && config.ociGenAiModelId
    && (config.ociGenAiEndpoint || config.ociRegion);
}

function getGenAiEndpoint() {
  if (config.ociGenAiEndpoint) {
    return config.ociGenAiEndpoint.replace(/\/$/, "");
  }

  return `https://inference.generativeai.${config.ociRegion}.oci.oraclecloud.com`;
}

function extractLlmText(body) {
  const candidates = [
    body?.choices?.[0]?.message?.content,
    body?.choices?.[0]?.text,
    body?.output?.[0]?.content?.[0]?.text,
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return String(candidate).trim();
    }
  }

  const nestedTexts = [body?.choices, body?.output].flat().filter(Boolean);

  for (const choice of nestedTexts) {
    if (choice?.text) {
      return String(choice.text).trim();
    }
    if (choice?.message?.content?.[0]?.text) {
      return String(choice.message.content[0].text).trim();
    }
  }

  return "";
}

async function generateGroundedAnswer(query, suggestions) {
  if (!canUseLlm()) {
    return {
      mode: "retrieval",
      answer: fallbackAnswer(query, suggestions),
      llmEnabled: false,
    };
  }

  try {
    const lead = buildDeterministicLead(suggestions);
    const response = await fetch(`${getGenAiEndpoint()}/20231130/actions/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ociGenAiApiKey}`,
      },
      body: JSON.stringify({
        model: config.ociGenAiModelId,
        messages: [
          {
            role: "system",
            content: "You are Oracle Marketplace AI Search. Use only the retrieved listing content. Do not invent capabilities.",
          },
          {
            role: "user",
            content: buildPrompt(query, suggestions.slice(0, 6), lead),
          },
        ],
        temperature: 0.2,
        max_tokens: 420,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCI GenAI request failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    const text = extractLlmText(payload);
    const continuation = cleanGeneratedContinuation(text, lead);

    if (!text) {
      return {
        mode: "retrieval",
        answer: fallbackAnswer(query, suggestions),
        llmEnabled: false,
      };
    }

    return {
      mode: "rag-llm",
      answer: [lead, continuation].filter(Boolean).join(" ").trim(),
      llmEnabled: true,
    };
  } catch (error) {
    return {
      mode: "retrieval",
      answer: fallbackAnswer(query, suggestions),
      llmEnabled: false,
      llmError: error.message,
    };
  }
}

function buildTaxonomyLookup(products) {
  return new Map(products.map((product) => [product.id, product]));
}

export async function aiSearchListings({ q = "", filters = {}, limit = 6 }) {
  const query = String(q || "").trim();

  if (!query) {
    return {
      query,
      answer: "",
      mode: "retrieval",
      llmEnabled: false,
      suggestions: [],
      inferred: {
        productIds: [],
        categoryKeys: [],
        filterKeys: [],
        listingTypes: [],
        listingTypeMode: "none",
        connectedProductIds: [],
        connectionTarget: "",
      },
    };
  }

  const taxonomyProducts = await getProductTaxonomy();
  const signals = inferSignals(query, taxonomyProducts);
  const searchSize = Math.max(limit * 4, 18);
  const enrichmentCandidateIds = await getEnrichmentCandidateIds({
    query,
    signals,
    limit: searchSize,
  });
  let connectionTextHitCount = 0;
  const searchRequests = [
    searchListingsSource({
      name: "primary",
      body: buildAiSearchBody({
        query,
        filters,
        signals,
        size: searchSize,
      }),
    }),
  ];

  if (signals.connectionIntent.targetText) {
    searchRequests.push(
      searchListingsSource({
        name: "connectionText",
        body: buildConnectionTextSearchBody({
          query,
          targetText: signals.connectionIntent.targetText,
          filters,
          signals,
          size: searchSize,
        }),
      }),
    );
  }

  if (enrichmentCandidateIds.length) {
    searchRequests.push(
      searchListingsSource({
        name: "enrichment",
        body: buildAiSearchBody({
          query,
          filters,
          signals,
          size: searchSize,
          strictListingIds: enrichmentCandidateIds,
        }),
      }),
    );
  }

  const searchResults = await Promise.all(searchRequests);
  const connectionTextResult = searchResults.find((result) => result.name === "connectionText");
  connectionTextHitCount = connectionTextResult?.hits?.length || 0;

  if (!connectionTextHitCount && signals.connectionIntent.productIds.length) {
    const connectionFallbackResult = await searchListingsSource({
      name: "connection",
      body: buildAiSearchBody({
        query,
        filters,
        signals,
        size: searchSize,
        strictConnectionProductIds: signals.connectionIntent.productIds,
      }),
    });

    searchResults.push(connectionFallbackResult);
  }

  const mergedHits = await applyVectorSignals(mergeCandidateHits(searchResults), { query, signals });
  const reranked = rerankAiResults(mergedHits, signals, buildTaxonomyLookup(taxonomyProducts));
  const suggestions = reranked.slice(0, limit);
  const answerPayload = await generateGroundedAnswer(query, suggestions);

  return {
    query,
    mode: answerPayload.mode,
    answer: answerPayload.answer,
    llmEnabled: answerPayload.llmEnabled,
    llmError: answerPayload.llmError || "",
    inferred: {
      productIds: signals.productIds,
      categoryKeys: signals.categoryKeys,
      filterKeys: signals.filterKeys,
      listingTypes: signals.listingTypeIntent.priorityTypes,
      listingTypeMode: signals.listingTypeIntent.mode,
      connectedProductIds: signals.connectionIntent.productIds,
      connectionTarget: signals.connectionIntent.targetText,
    },
    suggestions,
  };
}
