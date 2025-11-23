import puppeteer from '@cloudflare/puppeteer';

export async function launchBrowser(env) {
    return await puppeteer.launch(env.MYBROWSER);
}

export async function searchFlights(browser, origin, destination, date) {
    const page = await browser.newPage();

    // Randomize viewport to look like a real desktop
    await page.setViewport({
        width: 1366 + Math.floor(Math.random() * 100),
        height: 768 + Math.floor(Math.random() * 100)
    });

    // Set a standard User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // Example: Ryanair (Simplified for demonstration - real selectors need reverse engineering)
        // Note: Real implementation requires constant maintenance of selectors.
        // TEST MODE: Check connectivity first
        const url = 'https://example.com';
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const title = await page.title();
        console.log(`Page Title: ${title}`);

        if (!title.includes('Example')) {
            throw new Error(`Failed to load example.com, got title: ${title}`);
        }

        // If successful, return dummy data immediately to prove it works
        return [{
            flight_number: 'TEST001',
            price: 10,
            currency: 'EUR',
            date: date,
            origin,
            destination
        }];



    } catch (e) {
        console.error('Browser Error:', e);
        throw e;
    } finally {
        await page.close();
    }
}

// Helper: Human-like click with delay
async function humanClick(page, element) {
    // Move mouse to the element
    const box = await element.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
    await element.click();
    await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));
}
