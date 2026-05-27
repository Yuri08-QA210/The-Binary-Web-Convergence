// ============================================
// Simulated XML/SVG Parser with XXE Support
// This parser intentionally processes XXE entities
// for the CTF challenge
// ============================================

import { vfsRead } from "./vault-vfs";

interface XMLEntity {
  name: string;
  value: string;
  isParameter: boolean;
  systemId?: string;
  publicId?: string;
}

interface XMLParseResult {
  success: boolean;
  result?: string;
  error?: string;
  entities?: Record<string, string>;
  extractedContent?: Record<string, string>;
  metadata?: {
    title?: string;
    width?: string;
    height?: string;
    viewBox?: string;
    textContent?: string;
    elements?: string[];
  };
}

// Parse XML/SVG content with XXE entity resolution
export function parseXMLWithXXE(xml: string): XMLParseResult {
  try {
    const entities: Record<string, string> = {};
    const extractedContent: Record<string, string> = {};
    let processedXml = xml;

    // ---- Step 1: Extract and resolve DOCTYPE with ENTITY declarations ----
    const doctypeMatch = xml.match(
      /<!DOCTYPE\s+\w+\s+\[([\s\S]*?)\]>/i
    );

    if (doctypeMatch) {
      const doctypeContent = doctypeMatch[1];

      // Find all general ENTITY declarations
      // Pattern: <!ENTITY name SYSTEM "file:///path">
      const entityRegex =
        /<!ENTITY\s+(\w+)\s+SYSTEM\s+"([^"]+)"\s*>/gi;
      let match;

      while ((match = entityRegex.exec(doctypeContent)) !== null) {
        const name = match[1];
        const systemId = match[2];

        // Read from virtual filesystem
        const file = vfsRead(systemId);
        if (file) {
          entities[name] = file.content;
          extractedContent[systemId] = file.content;
        } else {
          entities[name] = `[Error: Cannot read file ${systemId}]`;
        }
      }

      // Find parameter entities (% name SYSTEM "...")
      const paramEntityRegex =
        /<!ENTITY\s+%\s+(\w+)\s+SYSTEM\s+"([^"]+)"\s*>/gi;

      while ((match = paramEntityRegex.exec(doctypeContent)) !== null) {
        const name = match[1];
        const systemId = match[2];

        const file = vfsRead(systemId);
        if (file) {
          entities[`%${name}`] = file.content;
          extractedContent[systemId] = file.content;
        }
      }

      // Handle internal entities
      // Pattern: <!ENTITY name "value">
      const internalEntityRegex =
        /<!ENTITY\s+(\w+)\s+"([^"]*)"\s*>/gi;

      while ((match = internalEntityRegex.exec(doctypeContent)) !== null) {
        const name = match[1];
        const value = match[2];
        entities[name] = value;
      }

      // Remove DOCTYPE from processed XML
      processedXml = processedXml.replace(
        /<!DOCTYPE\s+\w+\s+\[[\s\S]*?\]>/i,
        ""
      );
    }

    // ---- Step 2: Resolve entity references in the document body ----
    for (const [name, value] of Object.entries(entities)) {
      const entityRef = name.startsWith("%")
        ? `%${name.slice(1)};`
        : `&${name};`;
      // Split and join to avoid replacement string patterns
      processedXml = processedXml.split(entityRef).join(value);
    }

    // ---- Step 3: Extract SVG metadata ----
    const metadata: XMLParseResult["metadata"] = {};

    // Extract title
    const titleMatch = processedXml.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }

    // Extract SVG attributes
    const svgMatch = processedXml.match(
      /<svg[^>]*>/i
    );
    if (svgMatch) {
      const svgTag = svgMatch[0];
      const widthMatch = svgTag.match(/width="([^"]*)"/);
      const heightMatch = svgTag.match(/height="([^"]*)"/);
      const viewBoxMatch = svgTag.match(/viewBox="([^"]*)"/);

      if (widthMatch) metadata.width = widthMatch[1];
      if (heightMatch) metadata.height = heightMatch[1];
      if (viewBoxMatch) metadata.viewBox = viewBoxMatch[1];
    }

    // Extract text content
    const textMatches = processedXml.match(
      /<text[^>]*>([\s\S]*?)<\/text>/gi
    );
    if (textMatches) {
      metadata.textContent = textMatches
        .map((t) => t.replace(/<\/?text[^>]*>/gi, "").trim())
        .join(" ");
    }

    // Extract element names
    const elementMatches = processedXml.match(
      /<(\w+)[^>]*>/g
    );
    if (elementMatches) {
      metadata.elements = [
        ...new Set(
          elementMatches.map((e) =>
            e.replace(/<\/?/, "").replace(/[^a-zA-Z].*/, "")
          )
        ),
      ];
    }

    return {
      success: true,
      result: processedXml,
      entities,
      extractedContent:
        Object.keys(extractedContent).length > 0
          ? extractedContent
          : undefined,
      metadata,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `XML Parse Error: ${e.message}`,
    };
  }
}

// Validate SVG structure (basic check)
export function isValidSVG(content: string): boolean {
  return (
    content.includes("<svg") &&
    content.includes("</svg>")
  );
}
