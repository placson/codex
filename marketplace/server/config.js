import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const envPath = path.join(projectRoot, ".env");

if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && !(key in process.env)) {
      process.env[key] = normalizedValue;
    }
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  opensearchUrl: process.env.OPENSEARCH_URL || "https://localhost:9200",
  opensearchUsername: process.env.OPENSEARCH_USERNAME || "admin",
  opensearchPassword: process.env.OPENSEARCH_PASSWORD || "OracleMarketplace123!",
  listingsIndex: process.env.LISTINGS_INDEX || "listings",
  productTaxonomyIndex: process.env.PRODUCT_TAXONOMY_INDEX || "product_taxonomy",
  listingEnrichmentIndex: process.env.LISTING_ENRICHMENT_INDEX || "listing_enrichment",
  ociRegion: process.env.OCI_REGION || "",
  ociGenAiEndpoint: process.env.OCI_GENAI_ENDPOINT || "",
  ociGenAiApiKey: process.env.OCI_GENAI_API_KEY || "",
  ociGenAiModelId: process.env.OCI_GENAI_MODEL_ID || "",
  enableAiLlm: String(process.env.ENABLE_AI_LLM || "").toLowerCase() === "true",
  embeddingProvider: process.env.EMBEDDING_PROVIDER || "deterministic",
  embeddingDimension: Number(process.env.EMBEDDING_DIMENSION || 1024),
  embeddingApiBaseUrl: process.env.EMBEDDING_API_BASE_URL || "",
  embeddingApiKey: process.env.EMBEDDING_API_KEY || process.env.OCI_GENAI_API_KEY || "",
  embeddingModelId: process.env.EMBEDDING_MODEL_ID || "",
  allowEmbeddingFallback: String(process.env.ALLOW_EMBEDDING_FALLBACK || "true").toLowerCase() !== "false",
  enableVectorSearch: String(process.env.ENABLE_VECTOR_SEARCH || "true").toLowerCase() !== "false",
  enableResourceFetch: String(process.env.ENABLE_RESOURCE_FETCH || "").toLowerCase() === "true",
  resourceFetchTimeoutMs: Number(process.env.RESOURCE_FETCH_TIMEOUT_MS || 1200),
  resourceFetchMaxAttachments: Number(process.env.RESOURCE_FETCH_MAX_ATTACHMENTS || 1),
  resourceFetchMaxChars: Number(process.env.RESOURCE_FETCH_MAX_CHARS || 1800),
  distDir: path.join(projectRoot, "dist"),
};
