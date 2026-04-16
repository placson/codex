function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, port } = window.location;
  const apiPort = port === "3000" ? port : "3000";

  return `${protocol}//${hostname}:${apiPort}`;
}

const apiBaseUrl = resolveApiBaseUrl();

export async function fetchListings({ q, filters, page = 1, pageSize = 12 }) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  for (const [key, values] of Object.entries(filters)) {
    if (values.length) {
      params.set(key, values.join(","));
    }
  }

  const response = await fetch(`${apiBaseUrl}/api/search?${params.toString()}`);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || errorPayload.message || "Search request failed.");
  }

  return response.json();
}

export async function fetchAiSearch({ q, filters = {}, limit = 6 }) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  params.set("limit", String(limit));

  for (const [key, values] of Object.entries(filters)) {
    if (values.length) {
      params.set(key, values.join(","));
    }
  }

  const response = await fetch(`${apiBaseUrl}/api/ai-search?${params.toString()}`);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || errorPayload.message || "AI search request failed.");
  }

  return response.json();
}

export async function fetchListingById(id) {
  const response = await fetch(`${apiBaseUrl}/api/listings/${encodeURIComponent(id)}`);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || errorPayload.message || "Listing request failed.");
  }

  return response.json();
}

export async function fetchTaxonomyProducts() {
  const response = await fetch(`${apiBaseUrl}/api/taxonomy/products`);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || errorPayload.message || "Taxonomy request failed.");
  }

  return response.json();
}

async function patchTaxonomy(path, label) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ label }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || errorPayload.message || "Taxonomy update failed.");
  }

  return response.json();
}

export function renameTaxonomyProduct(productId, label) {
  return patchTaxonomy(`/api/taxonomy/products/${encodeURIComponent(productId)}`, label);
}

export function renameTaxonomyCategory(productId, categoryId, label) {
  return patchTaxonomy(
    `/api/taxonomy/products/${encodeURIComponent(productId)}/categories/${encodeURIComponent(categoryId)}`,
    label,
  );
}

export function renameTaxonomyFilter(productId, filterId, label) {
  return patchTaxonomy(
    `/api/taxonomy/products/${encodeURIComponent(productId)}/filters/${encodeURIComponent(filterId)}`,
    label,
  );
}
