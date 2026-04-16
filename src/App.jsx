import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  fetchAiSearch,
  fetchListingById,
  fetchListings,
  fetchTaxonomyProducts,
  renameTaxonomyCategory,
  renameTaxonomyFilter,
  renameTaxonomyProduct,
} from "./lib/api";

const facetOrder = [
  ["productIds", "Products"],
  ["productCategoryKeys", "Categories"],
  ["productFilterKeys", "Filters"],
];

const emptyFilters = Object.fromEntries(facetOrder.map(([key]) => [key, []]));
const scopedFacetKeys = new Set(["productCategoryKeys", "productFilterKeys"]);

function extractScopedProductId(value) {
  return String(value || "").split("/")[0] || "";
}

function toggleFilter(filters, facetKey, value) {
  const currentValues = filters[facetKey];

  if (facetKey === "productIds") {
    const isSelected = currentValues.includes(value);

    if (isSelected) {
      const scopedPrefix = `${value}/`;
      return {
        ...filters,
        productIds: currentValues.filter((entry) => entry !== value),
        productCategoryKeys: filters.productCategoryKeys.filter(
          (entry) => !entry.startsWith(scopedPrefix),
        ),
        productFilterKeys: filters.productFilterKeys.filter(
          (entry) => !entry.startsWith(scopedPrefix),
        ),
      };
    }

    return {
      ...filters,
      productIds: [...currentValues, value],
    };
  }

  if (scopedFacetKeys.has(facetKey)) {
    const parentProductId = extractScopedProductId(value);
    const isSelected = currentValues.includes(value);

    return {
      ...filters,
      productIds: isSelected || !parentProductId || filters.productIds.includes(parentProductId)
        ? filters.productIds
        : [...filters.productIds, parentProductId],
      [facetKey]: isSelected
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value],
    };
  }

  return {
    ...filters,
    [facetKey]: currentValues.includes(value)
      ? currentValues.filter((entry) => entry !== value)
      : [...currentValues, value],
  };
}

function getInitials(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-{2,}/g, "-");
}

function getListingPath(listing, tab = "overview") {
  return `/apps/${encodeURIComponent(listing.id)}/${slugify(listing.displayName) || "listing"}/${tab}`;
}

function truncateCopy(value, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeAiAnswer(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/^[\-\*\d]+\.\s+/gm, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderAiAnswer(answer, suggestions = []) {
  const normalizedAnswer = normalizeAiAnswer(answer);
  const linkedListings = [...suggestions]
    .filter((listing) => listing?.displayName)
    .sort((left, right) => right.displayName.length - left.displayName.length);

  if (!linkedListings.length) {
    return normalizedAnswer;
  }

  const matcher = new RegExp(
    `(${linkedListings.map((listing) => escapeRegExp(listing.displayName)).join("|")})`,
    "g",
  );

  return normalizedAnswer.split(/\n+/).map((paragraph, paragraphIndex) => {
    const parts = paragraph.split(matcher);

    return (
      <p key={`ai-paragraph-${paragraphIndex}`}>
        {parts.map((part, partIndex) => {
          const listing = linkedListings.find((entry) => entry.displayName === part);

          if (!listing) {
            return <span key={`ai-text-${paragraphIndex}-${partIndex}`}>{part}</span>;
          }

          return (
            <a
              key={`ai-link-${listing.id}-${paragraphIndex}-${partIndex}`}
              className="ai-answer-link"
              href={getListingPath(listing)}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{listing.displayName}</strong>
            </a>
          );
        })}
      </p>
    );
  });
}

function parseRoute(pathname) {
  if (/^\/taxonomy-admin\/?$/.test(pathname)) {
    return {
      view: "taxonomyAdmin",
      listingId: null,
      tab: "overview",
      search: "",
    };
  }

  const match = pathname.match(/^\/apps\/([^/]+)(?:\/[^/]+)?\/(overview|details|resources)\/?$/);

  if (match) {
    return {
      view: "detail",
      listingId: decodeURIComponent(match[1]),
      tab: match[2],
      search: "",
    };
  }

  return {
    view: "home",
    listingId: null,
    tab: "overview",
    search: window.location.search,
  };
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function cloneEmptyFilters() {
  return Object.fromEntries(facetOrder.map(([key]) => [key, []]));
}

function parseHomeStateFromSearch(search) {
  const params = new URLSearchParams(search);
  const nextFilters = cloneEmptyFilters();

  for (const [key] of facetOrder) {
    const rawValue = params.get(key);
    if (!rawValue) {
      continue;
    }

    nextFilters[key] = rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const rawPage = Number.parseInt(params.get("page") || "1", 10);

  return {
    mode: params.get("mode") === "search" ? "search" : "ai",
    query: params.get("q") || "",
    aiQuery: params.get("aiq") || "",
    filters: nextFilters,
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function buildHomeSearch({ mode, query, aiQuery, filters, page }) {
  const params = new URLSearchParams();

  if (mode === "search") {
    params.set("mode", "search");
  }

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (aiQuery.trim()) {
    params.set("aiq", aiQuery.trim());
  }

  for (const [key] of facetOrder) {
    if (filters[key]?.length) {
      params.set(key, filters[key].join(","));
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function getActiveFilterLabel(facets, facetKey, value) {
  const option = facets[facetKey]?.values?.find((entry) => entry.value === value);

  if (!option) {
    return value;
  }

  if (scopedFacetKeys.has(facetKey) && option.productLabel) {
    return `${option.productLabel}: ${option.label || option.value}`;
  }

  return option.label || option.value;
}

function Pill({ children, muted = false }) {
  return <span className={`pill ${muted ? "pill-muted" : ""}`}>{children}</span>;
}

function SearchModeTabs({ mode, onChange }) {
  return (
    <div className="search-mode-tabs" role="tablist" aria-label="Search mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "ai"}
        className={`search-mode-tab ${mode === "ai" ? "active" : ""}`}
        onClick={() => onChange("ai")}
      >
        AI Solution Finder
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "search"}
        className={`search-mode-tab ${mode === "search" ? "active" : ""}`}
        onClick={() => onChange("search")}
      >
        Regular Search
      </button>
    </div>
  );
}

function Logo({ listing, large = false }) {
  if (listing.logo?.contentUrl) {
    return (
      <img
        className={`listing-logo ${large ? "large" : ""}`}
        src={listing.logo.contentUrl}
        alt={listing.logo.altText || listing.displayName}
      />
    );
  }

  return (
    <div className={`listing-logo listing-logo-fallback ${large ? "large" : ""}`}>
      {getInitials(listing.displayName)}
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <a className="brand-lockup" href="/" onClick={(event) => {
        event.preventDefault();
        navigateTo("/");
      }}>
        <span className="brand-oracle">Oracle</span>
        <span className="brand-marketplace">Marketplace</span>
      </a>
      <nav className="topnav">
        <a href="/" onClick={(event) => {
          event.preventDefault();
          navigateTo("/");
        }}>
          Discover
        </a>
        <a href="/#categories" onClick={(event) => {
          event.preventDefault();
          navigateTo("/?mode=search");
          requestAnimationFrame(() => {
            document.getElementById("categories")?.scrollIntoView({ behavior: "smooth" });
          });
        }}>
          Categories
        </a>
        <a href="/#results" onClick={(event) => {
          event.preventDefault();
          navigateTo("/?mode=search");
          requestAnimationFrame(() => {
            document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
          });
        }}>
          Listings
        </a>
        <a href="/taxonomy-admin" onClick={(event) => {
          event.preventDefault();
          navigateTo("/taxonomy-admin");
        }}>
          Taxonomy
        </a>
      </nav>
    </header>
  );
}

function TaxonomyRenameRow({ kind, productId, item, onSave, saving }) {
  const [value, setValue] = useState(item.label);
  const changed = value.trim() && value.trim() !== item.label;

  useEffect(() => {
    setValue(item.label);
  }, [item.label]);

  return (
    <div className="taxonomy-row">
      <div className="taxonomy-row-copy">
        <strong>{item.label}</strong>
        <span>
          {item.listingCount || 0} listings affected
        </span>
      </div>
      <div className="taxonomy-row-editor">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={`Rename ${kind}`}
        />
        <button
          type="button"
          disabled={!changed || saving}
          onClick={() => onSave(productId, item.id, value.trim())}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function TaxonomyProductCard({ product, onRenameProduct, onRenameCategory, onRenameFilter, savingKey }) {
  const [productLabel, setProductLabel] = useState(product.label);
  const productChanged = productLabel.trim() && productLabel.trim() !== product.label;

  useEffect(() => {
    setProductLabel(product.label);
  }, [product.label]);

  return (
    <article className="taxonomy-card">
      <div className="taxonomy-card-header">
        <div>
          <span className="eyebrow">{product.productGroup || "Product"}</span>
          <h2>{product.label}</h2>
          <p>{product.listingCount || 0} listings affected by this product label.</p>
        </div>
      </div>

      <div className="taxonomy-product-editor">
        <input
          value={productLabel}
          onChange={(event) => setProductLabel(event.target.value)}
          placeholder="Rename product"
        />
        <button
          type="button"
          disabled={!productChanged || savingKey === `product:${product.id}`}
          onClick={() => onRenameProduct(product.id, productLabel.trim())}
        >
          {savingKey === `product:${product.id}` ? "Saving..." : "Save product"}
        </button>
      </div>

      <div className="taxonomy-groups">
        <section className="taxonomy-group">
          <h3>Categories</h3>
          <div className="taxonomy-group-list">
            {(product.categories || []).length ? product.categories.map((category) => (
              <TaxonomyRenameRow
                key={category.id}
                kind="category"
                productId={product.id}
                item={category}
                saving={savingKey === `category:${product.id}:${category.id}`}
                onSave={onRenameCategory}
              />
            )) : <p>No categories for this product.</p>}
          </div>
        </section>

        <section className="taxonomy-group">
          <h3>Filters</h3>
          <div className="taxonomy-group-list">
            {(product.filters || []).length ? product.filters.map((filter) => (
              <TaxonomyRenameRow
                key={filter.id}
                kind="filter"
                productId={product.id}
                item={filter}
                saving={savingKey === `filter:${product.id}:${filter.id}`}
                onSave={onRenameFilter}
              />
            )) : <p>No filters for this product.</p>}
          </div>
        </section>
      </div>
    </article>
  );
}

function TaxonomyAdminPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [query, setQuery] = useState("");

  const loadTaxonomy = async () => {
    const payload = await fetchTaxonomyProducts();
    setProducts(payload.products || []);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchTaxonomyProducts()
      .then((payload) => {
        if (active) {
          setProducts(payload.products || []);
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!normalizedQuery) {
      return products;
    }

    return products.filter((product) => {
      const haystack = [
        product.label,
        product.productGroup,
        ...(product.categories || []).map((category) => category.label),
        ...(product.filters || []).map((filter) => filter.label),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [products, normalizedQuery]);

  const handleRenameProduct = async (productId, label) => {
    try {
      setSavingKey(`product:${productId}`);
      setStatus("");
      await renameTaxonomyProduct(productId, label);
      await loadTaxonomy();
      setStatus(`Updated product '${label}'. Marketplace labels will reflect this immediately.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingKey("");
    }
  };

  const handleRenameCategory = async (productId, categoryId, label) => {
    try {
      setSavingKey(`category:${productId}:${categoryId}`);
      setStatus("");
      await renameTaxonomyCategory(productId, categoryId, label);
      await loadTaxonomy();
      setStatus(`Updated category '${label}'. Marketplace labels will reflect this immediately.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingKey("");
    }
  };

  const handleRenameFilter = async (productId, filterId, label) => {
    try {
      setSavingKey(`filter:${productId}:${filterId}`);
      setStatus("");
      await renameTaxonomyFilter(productId, filterId, label);
      await loadTaxonomy();
      setStatus(`Updated filter '${label}'. Marketplace labels will reflect this immediately.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingKey("");
    }
  };

  return (
    <main className="taxonomy-admin-page">
      <section className="taxonomy-admin-hero">
        <Pill muted>Taxonomy administration</Pill>
        <h1>Manage product, category, and filter labels.</h1>
        <p>
          Rename taxonomy labels in one place. Each change warns how many listings are affected,
          and updates are reflected immediately throughout the marketplace.
        </p>
        <div className="taxonomy-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, categories, or filters"
            aria-label="Search taxonomy"
          />
          <div className="taxonomy-search-meta">
            <strong>{filteredProducts.length}</strong>
            <span>matching products</span>
          </div>
        </div>
      </section>

      {status ? <div className="taxonomy-status">{status}</div> : null}
      {error ? <div className="message-card error-card">{error}</div> : null}

      {loading ? (
        <div className="taxonomy-status">Loading taxonomy...</div>
      ) : (
        <section className="taxonomy-grid">
          {filteredProducts.map((product) => (
            <TaxonomyProductCard
              key={product.id}
              product={product}
              savingKey={savingKey}
              onRenameProduct={handleRenameProduct}
              onRenameCategory={handleRenameCategory}
              onRenameFilter={handleRenameFilter}
            />
          ))}
          {!filteredProducts.length ? (
            <div className="message-card">No products matched the current taxonomy search.</div>
          ) : null}
        </section>
      )}
    </main>
  );
}

function FacetGroup({ label, values, selectedValues, onToggle }) {
  if (!values?.length) {
    return null;
  }

  return (
    <section className="facet-group">
      <h3>{label}</h3>
      <div className="facet-options">
        {values.map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <label key={option.value} className={`facet-option ${checked ? "active" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(option.value)}
              />
              <span>
                <strong className="facet-option-label">{option.label || option.value}</strong>
                {option.productLabel ? (
                  <small className="facet-option-meta">{option.productLabel}</small>
                ) : null}
              </span>
              <strong>{option.count}</strong>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function ListingCard({ listing }) {
  const path = getListingPath(listing);

  return (
    <a
      className="listing-card"
      href={path}
      onClick={(event) => {
        event.preventDefault();
        navigateTo(path);
      }}
    >
      <div className="listing-card-top">
        <Logo listing={listing} />
        <div>
          <h3>{listing.displayName}</h3>
          <p className="listing-publisher">{listing.publisher || "Partner application"}</p>
        </div>
      </div>
      <p className="listing-headline">{listing.headline || listing.tagline}</p>
      <p className="listing-description">{listing.shortDescription || listing.longDescription}</p>
      <div className="listing-meta-row">
        {listing.categories?.slice(0, 2).map((category) => (
          <Pill key={category}>{category}</Pill>
        ))}
      </div>
      <div className="listing-footer">
        <span>{listing.attachments?.length || 0} assets</span>
        <span>{listing.deploymentModels?.join(", ") || "General availability"}</span>
      </div>
    </a>
  );
}

function AiSuggestionCard({ listing, rank }) {
  const path = getListingPath(listing);

  return (
    <article className="ai-suggestion-card">
      <div className="ai-suggestion-top">
        <div className="ai-rank-badge">{rank}</div>
        <Logo listing={listing} />
        <div>
          <h3>{listing.displayName}</h3>
          <p className="listing-publisher">{listing.publisher || "Partner application"}</p>
        </div>
      </div>
      <p className="ai-suggestion-copy">{listing.excerpt || listing.shortDescription || listing.tagline}</p>
      <div className="chip-stack">
        {(listing.reasons || []).map((reason) => (
          <Pill key={reason} muted>{reason}</Pill>
        ))}
      </div>
      <div className="ai-suggestion-footer">
        <span>{(listing.productLabels || []).join(", ") || "Oracle Marketplace"}</span>
        <a
          className="feature-link"
          href={path}
          onClick={(event) => {
            event.preventDefault();
            navigateTo(path);
          }}
        >
          Review listing
        </a>
      </div>
    </article>
  );
}

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }

  return (
    <nav className="pagination" aria-label="Listings pagination">
      <button
        className="pagination-button"
        type="button"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </button>
      <div className="pagination-pages">
        {start > 1 ? <span className="pagination-ellipsis">...</span> : null}
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            className={`pagination-page ${pageNumber === page ? "active" : ""}`}
            type="button"
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        {end < totalPages ? <span className="pagination-ellipsis">...</span> : null}
      </div>
      <button
        className="pagination-button"
        type="button"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

function HomePage({ urlSearch }) {
  const initialState = useMemo(() => parseHomeStateFromSearch(urlSearch), [urlSearch]);
  const [mode, setMode] = useState(initialState.mode);
  const [query, setQuery] = useState(initialState.query);
  const deferredQuery = useDeferredValue(query);
  const [aiQuery, setAiQuery] = useState(initialState.aiQuery);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [filters, setFilters] = useState(initialState.filters);
  const [results, setResults] = useState([]);
  const [facets, setFacets] = useState({});
  const [meta, setMeta] = useState({
    total: 0,
    took: 0,
    page: initialState.page,
    pageSize: 12,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(initialState.page);

  useEffect(() => {
    const nextState = parseHomeStateFromSearch(urlSearch);
    setMode(nextState.mode);
    setQuery(nextState.query);
    setAiQuery(nextState.aiQuery);
    setFilters(nextState.filters);
    setPage(nextState.page);
  }, [urlSearch]);

  useEffect(() => {
    const nextSearch = buildHomeSearch({
      mode,
      query,
      aiQuery,
      filters,
      page,
    });
    if (window.location.pathname !== "/" || window.location.search !== nextSearch) {
      window.history.replaceState(window.history.state, "", `/${nextSearch}`);
    }
  }, [aiQuery, filters, mode, page, query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchListings({
      q: deferredQuery,
      filters,
      page,
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setResults(payload.hits || []);
          setFacets(payload.facets || {});
          setMeta({
            total: payload.total || 0,
            took: payload.took || 0,
            page: payload.page || page,
            pageSize: payload.pageSize || 12,
          });
        });
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message);
          setResults([]);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [deferredQuery, filters, page]);

  const topProducts = facets.productIds?.values?.slice(0, 6) || [];
  const featuredListings = useMemo(() => results.slice(0, 3), [results]);
  const activeFilterValues = useMemo(
    () =>
      facetOrder.flatMap(([key]) =>
        filters[key].map((value) => ({
          key: `${key}:${value}`,
          facetKey: key,
          value,
          label: getActiveFilterLabel(facets, key, value),
        })),
      ),
    [facets, filters],
  );
  const assetCount = useMemo(
    () => results.reduce((sum, listing) => sum + (listing.attachments?.length || 0), 0),
    [results],
  );
  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (meta.pageSize || 12)));

  function updateQuery(value) {
    setQuery(value);
    setPage(1);
  }

  function updateFilters(updater) {
    setFilters((currentFilters) => {
      const nextFilters = typeof updater === "function" ? updater(currentFilters) : updater;
      return nextFilters;
    });
    setPage(1);
  }

  function clearFilters() {
    setFilters(cloneEmptyFilters());
    setPage(1);
  }

  function updateMode(nextMode) {
    setMode(nextMode);
  }

  async function handleAiSearch(event) {
    event.preventDefault();

    const trimmedQuery = aiQuery.trim();
    if (!trimmedQuery) {
      return;
    }

    setAiLoading(true);
    setAiError("");

    try {
      const payload = await fetchAiSearch({
        q: trimmedQuery,
        filters,
      });
      setAiResult(payload);
    } catch (fetchError) {
      setAiError(fetchError.message);
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main>
      <section className="hero" id="discover">
        <div className="hero-copy">
          <Pill muted>Enterprise software marketplace</Pill>
          <h1>Discover partner applications curated for modern Oracle workflows.</h1>
          <p>
            Search, compare, and filter partner listings across finance, HR, operations,
            security, procurement, and analytics from one marketplace experience.
          </p>
          <SearchModeTabs mode={mode} onChange={updateMode} />
          {mode === "ai" ? (
            <form className="hero-search hero-search-form" onSubmit={handleAiSearch}>
              <textarea
                value={aiQuery}
                onChange={(event) => setAiQuery(event.target.value)}
                placeholder="I need a solution for my hotel business that manages operational costs"
                aria-label="Ask AI-assisted marketplace search"
              />
              <div className="hero-search-actions">
                <button type="submit" className="primary-cta" disabled={aiLoading || !aiQuery.trim()}>
                  {aiLoading ? "Finding matches..." : "Ask marketplace AI"}
                </button>
                <button
                  type="button"
                  className="secondary-cta"
                  onClick={() => {
                    setAiQuery("");
                    setAiError("");
                    setAiResult(null);
                  }}
                  disabled={aiLoading}
                >
                  Clear
                </button>
              </div>
            </form>
          ) : (
            <div className="hero-search">
              <input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search integrations, accelerators, AI tools, and services"
                aria-label="Search listings"
              />
            </div>
          )}
          <div className="hero-stats">
            <div>
              <strong>{meta.total}</strong>
              <span>Listings</span>
            </div>
            <div>
              <strong>{topProducts.length}</strong>
              <span>Featured products</span>
            </div>
            <div>
              <strong>{assetCount}</strong>
              <span>Visible assets</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-panel-card">
            <span className="eyebrow">Featured collections</span>
            <h2>Browse applications by Oracle product</h2>
            <div className="chip-stack">
              {topProducts.map((product) => (
                <button
                  key={product.value}
                  className="category-chip"
                  onClick={() =>
                    updateFilters((currentFilters) =>
                      toggleFilter(currentFilters, "productIds", product.value),
                    )
                  }
                >
                  <span>{product.label || product.value}</span>
                  <strong>{product.count}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {mode === "ai" ? (
        <section className="ai-search-shell">
          <div className="ai-search-panel">
            <div className="ai-search-header">
              <div>
                <span className="eyebrow">AI-assisted search</span>
                <h2>Ask me for a solution.</h2>
                <p>
                  Grounded on OpenSearch results from listing names, taglines, and descriptions.
                </p>
              </div>
            </div>

            {aiError ? <div className="message-card error-card">{aiError}</div> : null}

            {aiLoading ? (
              <div className="ai-thinking-card" aria-live="polite">
                <div className="ai-thinking-header">
                  <strong>AI assist is thinking</strong>
                  <div className="ai-thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <p>
                  Reviewing listing names, taglines, descriptions, and product matches to rank the best solutions for your request.
                </p>
                <div className="ai-thinking-lines" aria-hidden="true">
                  <span className="ai-thinking-line line-wide" />
                  <span className="ai-thinking-line line-mid" />
                  <span className="ai-thinking-line line-short" />
                </div>
              </div>
            ) : null}

            {aiResult?.answer ? (
              <div className="ai-answer-card">
                <div className="ai-answer-header">
                  <strong>{aiResult.mode === "rag-llm" ? "Recommended solutions" : "OpenSearch-grounded answer"}</strong>
                  {aiResult.llmError ? <span>LLM unavailable, using retrieval fallback.</span> : null}
                </div>
                <div>{renderAiAnswer(aiResult.answer, aiResult.suggestions)}</div>
              </div>
            ) : (
              <div className="message-card">
                Describe the business problem, Oracle product, industry, or deployment need you have, and the AI assist will rank the best matching listings.
              </div>
            )}

            {aiResult?.suggestions?.length ? (
              <>
                <div className="ai-suggestion-intro">
                  Based on your description, these are the best solutions ordered by most relevant.
                </div>
                <div className="ai-suggestion-grid">
                  {aiResult.suggestions.map((listing, index) => (
                    <AiSuggestionCard key={listing.id} listing={listing} rank={index + 1} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {mode === "search" ? (
        <>
          <section className="featured-strip" id="categories">
            {featuredListings.map((listing) => {
              const path = getListingPath(listing);

              return (
                <article key={listing.id} className="feature-card">
                  <span className="eyebrow">{listing.categories?.[0] || "Featured"}</span>
                  <h3>{listing.displayName}</h3>
                  <p>{listing.tagline || listing.shortDescription}</p>
                  <a
                    className="feature-link"
                    href={path}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateTo(path);
                    }}
                  >
                    View details
                  </a>
                </article>
              );
            })}
          </section>

          <section className="results-shell" id="results">
            <aside className="sidebar">
              <div className="sidebar-header">
                <h2>Refine results</h2>
                {activeFilterValues.length ? (
                  <button onClick={clearFilters}>Clear all</button>
                ) : null}
              </div>
              {facetOrder.map(([key, label]) => (
                <FacetGroup
                  key={key}
                  label={label}
                  values={facets[key]?.values}
                  selectedValues={filters[key]}
                  onToggle={(value) =>
                    updateFilters((currentFilters) => toggleFilter(currentFilters, key, value))
                  }
                />
              ))}
            </aside>

            <section className="results-panel">
              <div className="results-header">
                <div>
                  <span className="eyebrow">Oracle Marketplace listings</span>
                  <h2>{loading ? "Loading results..." : `${meta.total} listings available`}</h2>
                </div>
                <div className="search-meta">
                  <strong>{meta.took} ms</strong>
                  <span>Search time</span>
                </div>
              </div>

              {activeFilterValues.length ? (
                <div className="active-filters">
                  {activeFilterValues.map((filterValue) => (
                    <button
                      key={filterValue.key}
                      type="button"
                      className="active-filter-pill"
                      onClick={() =>
                        updateFilters((currentFilters) =>
                          toggleFilter(currentFilters, filterValue.facetKey, filterValue.value),
                        )
                      }
                      aria-label={`Remove ${filterValue.label}`}
                    >
                      <span>{filterValue.label}</span>
                      <span className="active-filter-pill-close" aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <div className="message-card error-card">{error}</div> : null}

              {!error && !loading && results.length === 0 ? (
                <div className="message-card">
                  No listings matched the current search and facet selection.
                </div>
              ) : null}

              <div className="results-grid">
                {results.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </section>
          </section>
        </>
      ) : null}
    </main>
  );
}

function DetailStat({ label, value }) {
  if (!value) {
    return null;
  }

  return (
    <div className="detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OverviewSection({ title, children }) {
  return (
    <section className="overview-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ListingDetailPage({ listingId, activeTab }) {
  const [listing, setListing] = useState(null);
  const [relatedListings, setRelatedListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchListingById(listingId)
      .then((payload) => {
        if (!active) {
          return;
        }
        setListing(payload);
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [listingId]);

  useEffect(() => {
    if (!listing?.productMemberships?.length) {
      setRelatedListings([]);
      return undefined;
    }

    let active = true;
    const primaryMembership = listing.productMemberships[0];
    const productId = primaryMembership?.productId;
    const productCategoryKeys = (primaryMembership?.categoryIds || []).map(
      (categoryId) => `${productId}/${categoryId}`,
    );

    if (!productId) {
      setRelatedListings([]);
      return undefined;
    }

    fetchListings({
      filters: {
        ...emptyFilters,
        productIds: [productId],
        productCategoryKeys,
      },
      pageSize: 8,
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        setRelatedListings((payload.hits || []).filter((entry) => entry.id !== listing.id).slice(0, 3));
      })
      .catch(() => {
        if (active) {
          setRelatedListings([]);
        }
      });

    return () => {
      active = false;
    };
  }, [listing]);

  if (loading) {
    return (
      <main className="detail-page">
        <div className="detail-loading">Loading listing overview...</div>
      </main>
    );
  }

  if (error || !listing) {
    return (
      <main className="detail-page">
        <div className="detail-error-card">
          <h1>Listing unavailable</h1>
          <p>{error || "This listing could not be loaded."}</p>
          <a
            className="feature-link"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}
          >
            Back to marketplace
          </a>
        </div>
      </main>
    );
  }

  const screenshots = (listing.attachments || []).filter((attachment) => attachment.type === "SCREENSHOT");
  const resources = (listing.attachments || []).filter((attachment) => attachment.type !== "SCREENSHOT");

  const tabItems = [
    { key: "overview", label: "Overview" },
    { key: "details", label: "Details" },
    { key: "resources", label: "Resources" },
  ];

  return (
    <main className="detail-page">
      <section className="detail-hero">
        <div className="detail-breadcrumbs">
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}
          >
            Oracle Marketplace
          </a>
          <span>/</span>
          <span>Apps</span>
          <span>/</span>
          <span>{listing.displayName}</span>
        </div>

        <div className="detail-hero-card">
          <div className="detail-hero-main">
            <Logo listing={listing} large />
            <div className="detail-hero-copy">
              <span className="eyebrow">{listing.publisher || "Partner app"}</span>
              <h1>{listing.displayName}</h1>
              <p>{listing.headline || listing.tagline}</p>
              <div className="chip-stack">
                {(listing.categories || []).map((value) => (
                  <Pill key={value}>{value}</Pill>
                ))}
                {(listing.capabilities || []).slice(0, 3).map((value) => (
                  <Pill key={value} muted>{value}</Pill>
                ))}
              </div>
            </div>
          </div>

          <div className="detail-hero-actions">
            <a
              className="primary-cta"
              href={resources[0]?.contentUrl || "#"}
              target={resources[0]?.contentUrl ? "_blank" : undefined}
              rel={resources[0]?.contentUrl ? "noreferrer" : undefined}
            >
              {resources[0]?.contentUrl ? "Open resource" : "Contact partner"}
            </a>
            <div className="detail-stats">
              <DetailStat label="Assets" value={String(listing.attachments?.length || 0)} />
              <DetailStat label="Deployment" value={listing.deploymentModels?.[0]} />
              <DetailStat label="Industry" value={listing.industries?.[0]} />
            </div>
          </div>
        </div>
      </section>

      <section className="detail-tabs">
        {tabItems.map((tabItem) => {
          const path = getListingPath(listing, tabItem.key);
          const active = activeTab === tabItem.key;
          return (
            <a
              key={tabItem.key}
              className={`detail-tab ${active ? "active" : "muted"}`}
              href={path}
              onClick={(event) => {
                event.preventDefault();
                navigateTo(path);
              }}
            >
              {tabItem.label}
            </a>
          );
        })}
      </section>

      <section className="detail-content-shell">
        <div className="detail-main-column">
          {activeTab === "overview" ? (
            <>
              <OverviewSection title="Overview">
                <p>{listing.longDescription || listing.shortDescription}</p>
              </OverviewSection>

              {screenshots.length ? (
                <OverviewSection title="Screenshots">
                  <div className="screenshot-grid">
                    {screenshots.slice(0, 3).map((attachment) => (
                      <a
                        key={attachment.id}
                        className="screenshot-card"
                        href={attachment.contentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={attachment.contentUrl} alt={attachment.name} />
                        <span>{attachment.name}</span>
                      </a>
                    ))}
                  </div>
                </OverviewSection>
              ) : null}

              <OverviewSection title="What this app supports">
                <div className="detail-support-grid">
                  <div className="detail-support-card">
                    <h3>Capabilities</h3>
                    <div className="chip-stack">
                      {(listing.capabilities || []).length
                        ? listing.capabilities.map((value) => <Pill key={value}>{value}</Pill>)
                        : <p>No capability metadata provided.</p>}
                    </div>
                  </div>
                  <div className="detail-support-card">
                    <h3>Industries</h3>
                    <div className="chip-stack">
                      {(listing.industries || []).length
                        ? listing.industries.map((value) => <Pill key={value} muted>{value}</Pill>)
                        : <p>No industry metadata provided.</p>}
                    </div>
                  </div>
                </div>
              </OverviewSection>

              {relatedListings.length ? (
                <OverviewSection title="Similar listings">
                  <div className="related-grid">
                    {relatedListings.map((entry) => {
                      const path = getListingPath(entry);
                      return (
                        <a
                          key={entry.id}
                          className="related-card"
                          href={path}
                          onClick={(event) => {
                            event.preventDefault();
                            navigateTo(path);
                          }}
                        >
                          <Logo listing={entry} />
                          <div>
                            <h3>{entry.displayName}</h3>
                            <p>{entry.shortDescription || entry.headline}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </OverviewSection>
              ) : null}
            </>
          ) : null}

          {activeTab === "details" ? (
            <>
              <OverviewSection title="Listing details">
                <div className="detail-spec-grid">
                  <div className="detail-spec-card">
                    <span>Publisher</span>
                    <strong>{listing.publisher || "Partner application"}</strong>
                  </div>
                  <div className="detail-spec-card">
                    <span>Categories</span>
                    <strong>{(listing.categories || []).join(", ") || "Not specified"}</strong>
                  </div>
                  <div className="detail-spec-card">
                    <span>Industries</span>
                    <strong>{(listing.industries || []).join(", ") || "Not specified"}</strong>
                  </div>
                  <div className="detail-spec-card">
                    <span>Deployment models</span>
                    <strong>{(listing.deploymentModels || []).join(", ") || "Not specified"}</strong>
                  </div>
                  <div className="detail-spec-card">
                    <span>Capabilities</span>
                    <strong>{(listing.capabilities || []).join(", ") || "Not specified"}</strong>
                  </div>
                  <div className="detail-spec-card">
                    <span>Asset types</span>
                    <strong>{(listing.attachmentTypes || []).join(", ") || "None"}</strong>
                  </div>
                </div>
              </OverviewSection>

              <OverviewSection title="Summary">
                <div className="detail-copy-block">
                  <h3>Headline</h3>
                  <p>{listing.headline || "No headline provided."}</p>
                </div>
                <div className="detail-copy-block">
                  <h3>Tagline</h3>
                  <p>{listing.tagline || "No tagline provided."}</p>
                </div>
                <div className="detail-copy-block">
                  <h3>Short description</h3>
                  <p>{listing.shortDescription || "No short description provided."}</p>
                </div>
                <div className="detail-copy-block">
                  <h3>Long description</h3>
                  <p>{listing.longDescription || "No long description provided."}</p>
                </div>
              </OverviewSection>

              <OverviewSection title="Tags">
                <div className="chip-stack">
                  {(listing.tags || []).length
                    ? listing.tags.map((value) => <Pill key={value}>{value}</Pill>)
                    : <p>No tags provided for this listing.</p>}
                </div>
              </OverviewSection>
            </>
          ) : null}

          {activeTab === "resources" ? (
            <>
              <OverviewSection title="Resources">
                <div className="resource-grid">
                  {resources.length ? resources.map((attachment) => (
                    <a
                      key={attachment.id}
                      className="resource-card"
                      href={attachment.contentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div>
                        <h3>{attachment.name}</h3>
                        <p>{attachment.contentUrl}</p>
                      </div>
                      <strong>{attachment.type}</strong>
                    </a>
                  )) : <p>No linked resources are available for this listing.</p>}
                </div>
              </OverviewSection>

              <OverviewSection title="Media and screenshots">
                {screenshots.length ? (
                  <div className="screenshot-grid">
                    {screenshots.map((attachment) => (
                      <a
                        key={attachment.id}
                        className="screenshot-card"
                        href={attachment.contentUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={attachment.contentUrl} alt={attachment.name} />
                        <span>{attachment.name}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p>No screenshots are available for this listing.</p>
                )}
              </OverviewSection>
            </>
          ) : null}
        </div>

        <aside className="detail-sidebar">
          <section className="detail-sidebar-card">
            <h2>At a glance</h2>
            <div className="detail-list">
              <div>
                <span>Publisher</span>
                <strong>{listing.publisher || "Partner application"}</strong>
              </div>
              <div>
                <span>Categories</span>
                <strong>{(listing.categories || []).join(", ") || "Not specified"}</strong>
              </div>
              <div>
                <span>Deployment</span>
                <strong>{(listing.deploymentModels || []).join(", ") || "Not specified"}</strong>
              </div>
              <div>
                <span>Tags</span>
                <strong>{(listing.tags || []).slice(0, 6).join(", ") || "Not specified"}</strong>
              </div>
            </div>
          </section>

          <section className="detail-sidebar-card">
            <h2>Resources</h2>
            <div className="resource-list">
              {resources.length ? resources.map((attachment) => (
                <a
                  key={attachment.id}
                  className="resource-link"
                  href={attachment.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{attachment.name}</span>
                  <strong>{attachment.type}</strong>
                </a>
              )) : <p>No linked resources are available for this listing.</p>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname));
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="page-shell">
      <TopBar />
      {route.view === "detail" ? <ListingDetailPage listingId={route.listingId} activeTab={route.tab} /> : null}
      {route.view === "home" ? <HomePage urlSearch={route.search} /> : null}
      {route.view === "taxonomyAdmin" ? <TaxonomyAdminPage /> : null}
    </div>
  );
}
