const express = require('express');
const path = require('path');
const { crawl, crawlPage, crawledUrls, urlQueue } = require('./crawler.js');
const { addToIndex, saveIndex, loadIndex, index } = require('./indexer.js');
const { handleSearch } = require('./search.js');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/index.html'));
});

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    try {
        console.log(`Searching for: "${query}"`);
        const searchResults = await handleSearch(query);
        res.json(searchResults);
    } catch (error) {
        console.error(`Error searching for "${query}":`, error);
        res.status(500).json({ error: `Error searching for "${query}": ${error.message}` });
    }
});

app.get('/crawl', async (req, res) => {
    const url = req.query.url;
    console.log('Received crawl request with URL:', url);
    if (!url) {
        console.log('URL parameter is missing');
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        console.log(`Crawling single page: ${url}`);
        const pageData = await crawlPage(url);
        if (pageData) {
            await addToIndex(pageData.text, url);
            await saveIndex();
            res.json({ message: `Successfully crawled and indexed: ${url}` });
        } else {
            res.status(500).json({ error: `Failed to crawl: ${url}` });
        }
    } catch (error) {
        console.error(`Error crawling ${url}:`, error);
        res.status(500).json({ error: `Error crawling ${url}: ${error.message}` });
    }
});

async function startAutoCrawling() {
    const seedUrls = [
        'https://en.wikipedia.org/wiki/Main_Page',
        'https://www.bbc.com/news',
        'https://www.nasa.gov/',
        'https://www.gutenberg.org/',
        'https://www.un.org/en/'
    ];
    const maxPages = 50;

    console.log(`Starting automatic crawl with ${seedUrls.length} seed URLs and max ${maxPages} pages`);
    try {
        await crawl(seedUrls, maxPages);
        console.log('Automatic crawl completed and index saved.');
    } catch (error) {
        console.error('Error during automatic crawl:', error);
    }
}

app.get('/view-index', (req, res) => {
    const wordCount = Object.keys(index).filter(key => Array.isArray(index[key])).length;
    const urlCount = Object.keys(index).filter(key => index[key].compressedSnippet).length;
    res.json({
        totalEntries: Object.keys(index).length,
        wordEntries: wordCount,
        urlEntries: urlCount
    });
});

app.get('/crawl-status', (req, res) => {
    res.json({
        crawledUrls: Array.from(crawledUrls),
        queueLength: urlQueue.length,
        indexSize: Object.keys(index).length
    });
});

app.get('/status', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/status.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

(async () => {
    try {
        await loadIndex();
        app.listen(PORT, () => {
            console.log(`Roo search engine running on http://localhost:${PORT}`);
            if (Object.keys(index).length === 0) {
                console.log('Index is empty. Starting automatic crawling...');
                startAutoCrawling();
            } else {
                console.log('Index loaded. Ready for searches.');
            }
        });
    } catch (error) {
        console.error('Error starting the server:', error);
    }
})();

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
