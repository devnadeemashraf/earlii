import type { ApiStatusFailure } from "@/lib/api-status";

// Every user-facing string, in one place (CODING_STANDARDS: user-facing copy from one place).
// Short and casual (SPEC section 4: fun, not cringe).
export const copy = {
  appName: "Earlii",
  tagline: "Fresh roles, before everyone else.",
  status: {
    heading: "API status",
    loading: "Checking the API",
    ok: "All systems go.",
    degraded: "The API is up, but something it needs isn't.",
    noChecks: "It didn't say which part is struggling.",
    checkOk: "ok",
    checkFail: "down",
  },
  failure: {
    network: "Can't reach the API right now.",
    timeout: "The API is taking too long to answer.",
    http: "The API answered with an error.",
    format: "The API sent something we didn't expect.",
    "too-large": "The API sent something we didn't expect.",
  } satisfies Record<ApiStatusFailure, string>,
  unexpected: "Something broke on our side.",
  retry: "Try again",
  retrying: "Trying again",
  notFound: {
    title: "Nothing here",
    body: "That page doesn't exist (yet).",
    home: "Back home",
  },
} as const;
