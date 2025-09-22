#!/usr/bin/env node

import axios, { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

// --- CONFIGURATION ---

const TIMEOUT_MS = 10000; // Request timeout in milliseconds

// Print usage and exit
function usage(): never {
  console.error("Usage: node dist/index.js <url>");
  process.exit(2);
}

// Check if a link looks like an absolute URL
function isProbablyAbsolute(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("//");
}

// Download HTML content from a given URL
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      responseType: "text",
    });
    return res.data;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw new Error(`Fetch failed for ${url}: ${err.message}`);
    }
    throw new Error(`Fetch failed for ${url}: Unknown error`);
  }
}

// Extract and normalize all links from an HTML page
function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const hrefs: Set<string> = new Set();

  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw) return;

    // Skip JavaScript, email, and telephone links
    if (/^(javascript:|mailto:|tel:)/i.test(raw)) return;

    try {
      let resolved: string;

      if (raw.startsWith("//")) {
        // Protocol-relative URL, e.g. //example.com
        const base = new URL(baseUrl);
        resolved = `${base.protocol}${raw}`;
      } else if (isProbablyAbsolute(raw)) {
        // Absolute URL
        resolved = raw;
      } else {
        // Relative URL -> resolve against baseUrl
        resolved = new URL(raw, baseUrl).toString();
      }

      hrefs.add(resolved);
    } catch (err: unknown) {
      // Log any URL parsing errors
      if (err instanceof Error) {
        console.error(`Failed to resolve link "${raw}": ${err.message}`);
      }
    }
  });

  return Array.from(hrefs);
}

// Check a single link by trying HEAD first, then GET if needed
async function checkLink(url: string): Promise<string> {
  try {
    // Try HEAD request (faster, no body download)
    const head = await axios.head(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (head.status === 200) return "OK";
    if (head.status >= 400) return `NOT OK (${head.status})`;
  } catch (err: unknown) {
    // HEAD failed, log and fall back to GET
    if (err instanceof Error) {
      console.error(`HEAD failed for ${url}: ${err.message}`);
    }
  }

  try {
    // Fallback: GET request
    const res: AxiosResponse = await axios.get(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (res.status === 200) return "OK";
    return `NOT OK (${res.status})`;
  } catch (err: unknown) {
    // Handle network errors and timeouts
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOTFOUND") return "ERROR (DNS lookup failed)";
      if (code === "ETIMEDOUT" || code === "ECONNABORTED")
        return "ERROR (timeout)";
    }
    // Handle HTTP errors with response codes
    if (err && typeof err === "object" && "response" in err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status) return `NOT OK (${status})`;
    }
    // Generic fallback
    if (err instanceof Error) {
      return `ERROR (${err.message})`;
    }
    return "ERROR (unknown)";
  }
}

// Main entry point
async function main(): Promise<void> {
  console.error("Script started...");
  const argv = process.argv.slice(2);

  // Require exactly one argument
  if (argv.length !== 1) usage();
  let input = argv[0];

  // Support URLs starting with //
  if (input.startsWith("//")) input = "https:" + input;

  // Validate and normalize the URL
  const baseUrl = (() => {
    try {
      return new URL(input).toString();
    } catch {
      console.error("Invalid URL:", input);
      usage();
    }
  })();

  console.error("Fetching:", baseUrl);

  // Download HTML from input URL
  let html: string;
  try {
    html = await fetchHtml(baseUrl);
    console.error("HTML length:", html.length);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Error fetching page:", err.message);
    } else {
      console.error("Error fetching page: unknown");
    }
    process.exit(1);
  }

  // Extract all links
  const links = extractLinks(html, baseUrl);
  console.error("Links found:", links.length);

  if (links.length === 0) {
    console.log("No links found.");
    process.exit(0);
  }

  console.error(
    `Checking ${links.length} with maximum of 200 links in parallel ...`
  );

  // Limit concurrency with p-limit
  const dynamicConcurrency = Math.min(links.length, 200); 
  const limit = pLimit(dynamicConcurrency);
  const tasks = links.map((link) =>
    limit(async () => {
      const status = await checkLink(link);
      console.log(`${link} -> ${status}`);
    })
  );

  await Promise.all(tasks);
}

// Catch any unhandled errors
main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error("Unhandled error:", err.message);
  } else {
    console.error("Unhandled error: unknown");
  }
  process.exit(1);
});
