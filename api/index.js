const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const app = express();
const contentDir = path.resolve(__dirname, '../content');

// Helper to check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// GET /api/articles - List all articles
app.get('/api/articles', async (req, res) => {
  try {
    const exists = await fileExists(contentDir);
    if (!exists) {
      return res.json([]);
    }

    const files = await fs.readdir(contentDir);
    const articles = [];

    for (const filename of files) {
      if (filename.endsWith('.md')) {
        const filePath = path.join(contentDir, filename);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        
        // We only return frontmatter for the list
        articles.push({
          id: filename.replace('.md', ''),
          ...data
        });
      }
    }

    res.json(articles);
  } catch (error) {
    console.error('Error reading articles:', error);
    res.status(500).json({ error: 'Failed to read articles directory' });
  }
});

// GET /api/articles/:id - Get a specific article
app.get('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Security: Prevent path traversal by using path.basename to extract just the filename
    const safeFilename = path.basename(id) + '.md';
    const filePath = path.join(contentDir, safeFilename);

    // Final security check: Ensure the resolved path is actually within the contentDir
    if (!filePath.startsWith(contentDir)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const exists = await fileExists(filePath);
    if (!exists) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const htmlContent = marked.parse(content);

    res.json({
      id: safeFilename.replace('.md', ''),
      ...data,
      htmlContent
    });
  } catch (error) {
    console.error('Error reading article:', error);
    res.status(500).json({ error: 'Failed to read the article' });
  }
});

// Export the express app for Vercel Serverless Functions
module.exports = app;

// Provide a local fallback to run the app if not in Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
