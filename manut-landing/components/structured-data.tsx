import { allSchemas } from '@/lib/jsonld';

/**
 * Renders all JSON-LD schemas as a single application/ld+json script.
 * Content goes through React children (text node), which HTML-escapes
 * any reserved chars while keeping the JSON valid for search engines.
 */
export function StructuredData() {
  const schemas = allSchemas();
  // Replace `<` characters defensively so the script tag can't be terminated
  // by string content. Search engines still parse the unicode escape correctly.
  const json = JSON.stringify(schemas).replace(/</g, '\\u003c');
  return <script type="application/ld+json">{json}</script>;
}
