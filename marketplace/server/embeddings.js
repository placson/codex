import { config } from "./config.js";
import { embedTextDeterministic } from "../shared/vector.js";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function canUseRealEmbeddings() {
  return config.embeddingProvider === "openai-compatible"
    && Boolean(normalizeBaseUrl(config.embeddingApiBaseUrl))
    && Boolean(config.embeddingApiKey)
    && Boolean(config.embeddingModelId);
}

function extractEmbeddings(payload) {
  const candidates = payload?.data || payload?.embeddings || payload?.results || [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.map((entry) => (
    entry?.embedding || entry?.vector || entry?.values || []
  ));
}

function normalizeEmbedding(values, dimension) {
  if (!Array.isArray(values)) {
    return embedTextDeterministic("", { dimension });
  }

  if (values.length === dimension) {
    return values.map((value) => Number(value || 0));
  }

  if (values.length > dimension) {
    return values.slice(0, dimension).map((value) => Number(value || 0));
  }

  return [
    ...values.map((value) => Number(value || 0)),
    ...new Array(Math.max(0, dimension - values.length)).fill(0),
  ];
}

async function fetchOpenAiCompatibleEmbeddings(texts, { dimension }) {
  const response = await fetch(`${normalizeBaseUrl(config.embeddingApiBaseUrl)}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: config.embeddingModelId,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const embeddings = extractEmbeddings(payload);

  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding response count mismatch. Expected ${texts.length}, received ${embeddings.length}.`);
  }

  return embeddings.map((embedding) => normalizeEmbedding(embedding, dimension));
}

export async function embedTexts(texts, { dimension = config.embeddingDimension } = {}) {
  const normalizedTexts = texts.map((text) => String(text || "").trim());

  if (!normalizedTexts.length) {
    return [];
  }

  if (!canUseRealEmbeddings()) {
    return normalizedTexts.map((text) => embedTextDeterministic(text, { dimension }));
  }

  try {
    return await fetchOpenAiCompatibleEmbeddings(normalizedTexts, { dimension });
  } catch (error) {
    if (!config.allowEmbeddingFallback) {
      throw error;
    }

    return normalizedTexts.map((text) => embedTextDeterministic(text, { dimension }));
  }
}

export async function embedText(text, options = {}) {
  const [embedding] = await embedTexts([text], options);
  return embedding;
}

export function embeddingStatus() {
  return {
    provider: config.embeddingProvider,
    enabled: canUseRealEmbeddings(),
    fallbackEnabled: config.allowEmbeddingFallback,
    modelId: config.embeddingModelId,
  };
}
