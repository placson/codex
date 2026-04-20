const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "application",
  "applications",
  "as",
  "at",
  "be",
  "by",
  "cloud",
  "for",
  "from",
  "i",
  "in",
  "integrates",
  "integrate",
  "is",
  "it",
  "my",
  "need",
  "of",
  "on",
  "or",
  "platform",
  "platforms",
  "service",
  "services",
  "software",
  "solution",
  "solutions",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

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
    .map((token) => token.trim())
    .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token));
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeVector(values) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));

  if (!magnitude) {
    return values.map(() => 0);
  }

  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

export function cosineSimilarity(left = [], right = []) {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] || 0) * (right[index] || 0);
  }

  return Number.isFinite(sum) ? sum : 0;
}

export function embedTextDeterministic(value, { dimension = 1024 } = {}) {
  const vector = new Array(dimension).fill(0);
  const tokens = tokenize(value);

  if (!tokens.length) {
    return vector;
  }

  const features = new Map();

  tokens.forEach((token, index) => {
    features.set(`tok:${token}`, (features.get(`tok:${token}`) || 0) + 1);

    if (index < tokens.length - 1) {
      const bigram = `${token}_${tokens[index + 1]}`;
      features.set(`bigram:${bigram}`, (features.get(`bigram:${bigram}`) || 0) + 0.8);
    }

    if (token.length >= 10) {
      features.set(`long:${token.slice(0, 10)}`, (features.get(`long:${token.slice(0, 10)}`) || 0) + 0.25);
    }
  });

  for (const [feature, count] of features.entries()) {
    const hash = hashString(feature);
    const slot = hash % dimension;
    const sign = ((hash >>> 1) & 1) === 0 ? 1 : -1;
    const weight = 1 + Math.log1p(count);
    vector[slot] += sign * weight;
  }

  return normalizeVector(vector);
}
