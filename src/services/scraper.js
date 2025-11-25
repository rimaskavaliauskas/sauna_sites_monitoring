import puppeteer from "@cloudflare/puppeteer";
import * as cheerio from 'cheerio';

export class ScraperService {
    constructor(env) {
        this.env = env;
    }

    async scrape(url, isDynamic = false) {
        if (isDynamic) {
            return await this.scrapeWithBrowser(url);
        } else {
            try {
                return await this.scrapeWithFetch(url);
            } catch (e) {
                console.warn(`Fetch failed for ${url}, falling back to browser`, e);
                // Fallback to browser if fetch fails (and suggest marking as dynamic in future)
                return await this.scrapeWithBrowser(url);
            }
        }
    }

    async scrapeWithFetch(url) {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const html = await response.text();

        if (html.length < 500) throw new Error("Content too short, likely JS-blocked");

        const $ = cheerio.load(html);

        // Remove noise
        $('script, style, nav, footer, iframe, noscript').remove();

        const content = $('body').text().replace(/\s+/g, ' ').trim();
        const links = [];

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && text) links.push({ href, text });
        });

        return { content, links, method: 'fetch' };
    }

    async scrapeWithBrowser(url) {
        if (!this.env.MYBROWSER) throw new Error("Browser binding not configured");

        const browser = await puppeteer.launch(this.env.MYBROWSER);
        const page = await browser.newPage();

        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            // Auto-scroll
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            const content = await page.evaluate(() => document.body.innerText);
            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a')).map(a => ({
                    href: a.href,
                    text: a.innerText.trim()
                })).filter(l => l.href && l.text);
            });

            return { content, links, method: 'browser' };
        } finally {
            await browser.close();
        }
    }
}
