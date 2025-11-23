import puppeteer from '@cloudflare/puppeteer';

export async function scrapePage(env, url) {
    let browser;
    try {
        browser = await puppeteer.launch(env.MYBROWSER);
        const page = await browser.newPage();

        // Set viewport to a standard desktop size
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

        // Scroll to bottom to trigger lazy loading
        await autoScroll(page);

        // Extract text content
        // We use evaluate to run code in the browser context
        // Extract text content and links
        const result = await page.evaluate(() => {
            // Helper to get visible text
            function getVisibleText(element) {
                if (!element) return '';
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
                return element.innerText || '';
            }

            const text = getVisibleText(document.body);

            // Extract all external links
            const links = Array.from(document.querySelectorAll('a[href]'))
                .map(a => ({
                    href: a.href,
                    text: a.innerText.trim()
                }))
                .filter(l => l.href.startsWith('http') && l.text.length > 2);

            return { content: text, links: links };
        });

        return result;

    } catch (e) {
        console.error(`Browser Scraping Error for ${url}:`, e);
        throw e;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}
