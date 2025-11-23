/**
 * Compares two arrays of text segments and returns the new ones.
 * @param {string[]} oldSegments - Segments from the previous run.
 * @param {string[]} newSegments - Segments from the current run.
 * @returns {string[]} - Array of segments found in newSegments but not in oldSegments.
 */
export async function findNewSegments(oldSegments, newSegments) {
    if (!oldSegments || oldSegments.length === 0) {
        // If no old segments, everything is new (but we might treat this as "Initial Snapshot" elsewhere)
        return newSegments;
    }

    const oldSet = new Set(oldSegments);
    const changes = [];

    for (const segment of newSegments) {
        if (!oldSet.has(segment)) {
            changes.push(segment);
        }
    }

    return changes;
}

/**
 * Generates a simple hash for the content (for quick change detection).
 * @param {string[]} segments 
 * @returns {string}
 */
export async function hashContent(segments) {
    const text = segments.join("|");
    const myText = new TextEncoder().encode(text);
    const myDigest = await crypto.subtle.digest({ name: "SHA-256" }, myText);
    const hashArray = Array.from(new Uint8Array(myDigest));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
