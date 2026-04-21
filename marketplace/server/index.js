import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { client } from "./opensearch.js";
import { aiSearchListings } from "./ai-search.js";
import {
  getListingById,
  getProductTaxonomy,
  renameTaxonomyChild,
  renameTaxonomyProduct,
  searchListings,
} from "./search.js";
import { SEARCH_FILTER_FIELDS, coerceArrayParam } from "../shared/listings.js";

const app = express();

app.use(cors());
app.use(express.json());

function readLabel(body) {
  const label = String(body?.label || "").trim();

  if (!label) {
    return null;
  }

  return label;
}

app.get("/api/health", async (_req, res) => {
  try {
    const pingResponse = await client.ping();
    res.json({
      status: "ok",
      opensearch: pingResponse?.statusCode || "reachable",
      index: config.listingsIndex,
      taxonomyIndex: config.productTaxonomyIndex,
      enrichmentIndex: config.listingEnrichmentIndex,
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      message: error.message,
    });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const filters = Object.fromEntries(
      SEARCH_FILTER_FIELDS.map(({ key }) => [key, coerceArrayParam(req.query[key])]),
    );

    const payload = await searchListings({
      q: String(req.query.q || "").trim(),
      filters,
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 12),
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({
      message: "Failed to search listings.",
      detail: error.message,
    });
  }
});

app.get("/api/ai-search", async (req, res) => {
  try {
    const filters = Object.fromEntries(
      SEARCH_FILTER_FIELDS.map(({ key }) => [key, coerceArrayParam(req.query[key])]),
    );

    const payload = await aiSearchListings({
      q: String(req.query.q || "").trim(),
      filters,
      limit: Number(req.query.limit || 6),
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({
      message: "Failed to run AI-assisted search.",
      detail: error.message,
    });
  }
});

app.get("/api/listings/:id", async (req, res) => {
  try {
    const listing = await getListingById(req.params.id);

    if (!listing) {
      res.status(404).json({ message: "Listing not found." });
      return;
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch listing.",
      detail: error.message,
    });
  }
});

app.get("/api/taxonomy/products", async (_req, res) => {
  try {
    const products = await getProductTaxonomy({ includeCounts: true });
    res.json({
      total: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch product taxonomy.",
      detail: error.message,
    });
  }
});

app.patch("/api/taxonomy/products/:productId", async (req, res) => {
  try {
    const label = readLabel(req.body);

    if (!label) {
      res.status(400).json({ message: "A non-empty label is required." });
      return;
    }

    const product = await renameTaxonomyProduct(req.params.productId, label);

    if (!product) {
      res.status(404).json({ message: "Product not found." });
      return;
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({
      message: "Failed to rename product.",
      detail: error.message,
    });
  }
});

app.patch("/api/taxonomy/products/:productId/categories/:categoryId", async (req, res) => {
  try {
    const label = readLabel(req.body);

    if (!label) {
      res.status(400).json({ message: "A non-empty label is required." });
      return;
    }

    const product = await renameTaxonomyChild(
      req.params.productId,
      "category",
      req.params.categoryId,
      label,
    );

    if (!product) {
      res.status(404).json({ message: "Category not found." });
      return;
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({
      message: "Failed to rename category.",
      detail: error.message,
    });
  }
});

app.patch("/api/taxonomy/products/:productId/filters/:filterId", async (req, res) => {
  try {
    const label = readLabel(req.body);

    if (!label) {
      res.status(400).json({ message: "A non-empty label is required." });
      return;
    }

    const product = await renameTaxonomyChild(
      req.params.productId,
      "filter",
      req.params.filterId,
      label,
    );

    if (!product) {
      res.status(404).json({ message: "Filter not found." });
      return;
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({
      message: "Failed to rename filter.",
      detail: error.message,
    });
  }
});

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(path.join(config.distDir, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`Oracle Marketplace API listening on http://localhost:${config.port}`);
});
