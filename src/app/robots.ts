import type { MetadataRoute } from "next";

/**
 * 静室 is an anonymous mental-health support surface. We do not want it
 * indexed by search engines, and we don't want crawlers to fingerprint or
 * cache user-visible content. An explicit Disallow: / is much clearer than
 * the absence of robots.txt (which lets some crawlers do as they please).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/"
      }
    ]
  };
}
