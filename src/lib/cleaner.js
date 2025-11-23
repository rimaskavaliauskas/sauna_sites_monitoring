/**
 * Cleans HTML and segments it into comparable blocks.
 * @param {string} html - Raw HTML content.
 * @returns {string[]} - Array of cleaned text segments.
 */
export function segmentText(html) {
    if (!html) return [];

    // 1. Remove noise tags
    let clean = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
        .replace(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gim, "")
        .replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gim, "")
        .replace(/<header\b[^>]*>([\s\S]*?)<\/header>/gim, "")
        .replace(/<aside\b[^>]*>([\s\S]*?)<\/aside>/gim, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    // 2. Extract text blocks (p, div, li, h1-h6, td)
    // We'll use a regex to find tags that likely contain content
    // Note: In a Worker, we don't have DOMParser. We use regex or a lightweight parser.
    // For simplicity and speed, we'll strip all tags but treat block-level tags as delimiters.

    // Replace block tags with newlines to ensure separation
    clean = clean.replace(/<\/(div|p|li|h[1-6]|tr|td|article|section)>/gi, "\n");

    // Strip all remaining tags
    clean = clean.replace(/<[^>]+>/g, " ");

    // 3. Normalize whitespace and split by newlines
    const lines = clean.split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 20); // Filter out very short lines (noise)

    // 4. Deduplicate lines (optional, but good for noise reduction)
    return [...new Set(lines)];
}
