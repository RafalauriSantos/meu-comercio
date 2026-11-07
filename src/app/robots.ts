import type { MetadataRoute } from 'next';

// Only the landing is meant to be found. The API is not linked from any page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/pdv', '/gestao'] },
  };
}
