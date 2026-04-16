import { Client } from "@opensearch-project/opensearch";
import { config } from "./config.js";

const auth = config.opensearchUsername
  ? {
      username: config.opensearchUsername,
      password: config.opensearchPassword,
    }
  : undefined;

export const client = new Client({
  node: config.opensearchUrl,
  auth,
  ssl: {
    rejectUnauthorized: false,
  },
});
