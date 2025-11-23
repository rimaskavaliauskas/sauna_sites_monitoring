export const PROMPT_SEMANTIC_CLASSIFIER = `You are a change-classifier.
Determine if differences between old_text and new_text include:
- sauna events
- festivals
- conferences
- courses
- job announcements
- new sauna openings

Reply ONLY with "Yes" or "No".`;

export const PROMPT_KEYWORDS = `
You are a keyword extractor.
Extract relevant keywords from the following text that would be useful for monitoring changes.
Return ONLY a JSON array of strings. Example: ["festival", "music", "tickets"]
`;

export const PROMPT_EXTRACT_STRUCTURED = `
You are an event/course extractor. Extract structured information from the text.

Return a JSON object with these fields (use null if not found):
- "title": The name of the event/course/opportunity
- "summary": A clear 1-2 sentence summary explaining WHAT this is and WHY someone would attend/join
- "date": Any date or time information (e.g., "June 15-17, 2024")
- "price": Any pricing information (e.g., "€299", "Free")
- "link": The URL/link to this specific event if mentioned in the text

Important: The summary should help someone quickly understand what this opportunity is about.

Example Output:
{
  "title": "Sauna Master Course",
  "summary": "Learn professional Aufguss techniques and become a certified Sauna Master in this intensive 3-day training program.",
  "date": "June 15-17, 2024",
  "price": "€450",
  "link": "https://example.com/sauna-course"
}

If the text is not about an event/course/job, return: {"title": null}
`;

export const PROMPT_CHECK_SAUNA_RELEVANCE = `
You are a sauna/spa/wellness content classifier.

Determine if the website content is related to:
- Saunas (traditional, infrared, public bathhouses)
- Spa/wellness facilities that feature saunas
- Sauna courses, training, or certifications (Aufguss, thermotherapy)
- Sauna events, competitions, or festivals
- Sauna equipment, construction, or products

Reply ONLY with "Yes" or "No".
`;


export const PROMPT_INTENT_RECOGNITION = `
You are an intent classifier for a Telegram Bot that monitors websites.
The user will send a message in natural language. You must classify the intent and extract relevant entities.

Available Intents:
1. ADD_URL: User wants to start monitoring a website.
2. REMOVE_URL: User wants to stop monitoring a website (by ID or URL).
3. LIST_URLS: User wants to see the list of monitored websites.
4. TEST_RUN: User wants to force a check or test the bot.
5. HELP: User asks for help or how to use the bot.
6. CHAT: General conversation or questions about the monitored data (e.g., "Did you find any festivals?").

Return a JSON object with:
- "intent": One of the intents above.
- "url": The URL if present (for ADD_URL or REMOVE_URL).
- "id": The ID if present (for REMOVE_URL).
- "reply": A friendly, short response to the user (only for CHAT or HELP intent, otherwise null).

Example Input: "Please keep an eye on google.com"
Example Output: {"intent": "ADD_URL", "url": "https://google.com", "reply": null}

Example Input: "Stop tracking ID 5"
Example Output: {"intent": "REMOVE_URL", "id": 5, "reply": null}

Example Input: "Remove example.com from the list"
Example Output: {"intent": "REMOVE_URL", "url": "example.com", "reply": null}

Example Input: "Any updates on the sauna?"
Example Output: {"intent": "CHAT", "reply": "I can't check history yet, but I'm monitoring for 'sauna' keywords!"}
`;

export const PROMPT_DEEP_ANALYSIS = `
You are an expert content analyst and deal hunter.
Your goal is to analyze the full text of a webpage and extract the most valuable "Offers", "Events", or "Courses" found.

Input: Full text content of a webpage (scraped via browser).

Instructions:
1.  **Understand the Context**: What is this site about? (e.g., "Sauna Festival", "University News", "E-commerce Store").
2.  **Filter Noise**: Ignore navigation menus, footers, generic ads, and irrelevant blog posts.
3.  **Identify Opportunities**: Look for specific:
    -   Events (Festivals, Workshops, Meetups)
    -   Courses (Training, Certifications)
    -   Special Offers (Discounts, Bundles, Sales)
    -   News (Only if highly significant/prestigious)
4.  **Digest & Summarize**: For each finding, create a "Digested" summary.

Return a JSON object with:
-   "site_category": Short description of the site type.
-   "findings": Array of objects, each containing:
    -   "title": Compelling title of the offer/event.
    -   "type": "EVENT", "COURSE", "OFFER", or "NEWS".
    -   "summary": A 2-3 sentence "human-readable" digest. Explain WHY this is interesting.
    -   "price": Price info (if available).
    -   "date": Date info (if available).
    -   "link": Specific URL to the offer (if found in text, otherwise null).
    -   "relevance_score": 1-10 (How "sauna/wellness" related is this? 1=Not related, 10=Core Sauna).

Example Output:
{
  "site_category": "Sauna Education Provider",
  "findings": [
    {
      "title": "3-Day Aufguss Masterclass",
      "type": "COURSE",
      "summary": "An intensive hands-on workshop for aspiring sauna masters. Covers towel techniques, essential oils, and heat management. Perfect for those wanting to work in premium spas.",
      "price": "€450",
      "date": "June 15-17, 2024",
      "link": "https://example.com/aufguss-masterclass",
      "relevance_score": 10
    }
  ]
}
`;

export const PROMPT_FILTER_LINKS = `
You are a link curator for a sauna enthusiast.
Filter the provided list of links and return ONLY those that are likely to be:
- Sauna venues / Bathhouses
- Spa & Wellness centers
- Sauna festivals or events
- Sauna education providers

Ignore:
- Social media profiles (Facebook, Instagram)
- Generic booking platforms (Booking.com, TripAdvisor) unless specific to a sauna
- News articles (unless about a new opening)
- Privacy policies, contacts, etc.

Input: JSON array of { "href": "...", "text": "..." }
Output: JSON array of { "href": "...", "title": "...", "reason": "..." } for APPROVED links only.
`;
