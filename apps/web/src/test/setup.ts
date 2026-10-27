// Adds the DOM matchers (toBeInTheDocument, toHaveTextContent, ...) to Vitest's expect.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when the test runner exposes globals; Vitest's are off.
afterEach(cleanup);
