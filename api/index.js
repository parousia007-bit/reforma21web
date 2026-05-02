const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const dbConnect = require('./db');
const ArticleMetric = require('./models/ArticleMetric');
const { requireAuth } = require('./auth');

const app = express();
app.use(express.json()); // Necesario para parsear el body en las peticiones POST
app.use(cookieParser()); // Necesario para leer las cookies httpOnly

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

    // Extract unique dates for future filtering
    const rawMonths = articles.map(a => a.fecha).filter(Boolean);
    const availableMonths = [...new Set(rawMonths)].sort((a, b) => new Date(b) - new Date(a));

    // Sort descending by date (newest first)
    articles.sort((a, b) => {
      const dateA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const dateB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return dateB - dateA;
    });

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const totalPages = Math.ceil(articles.length / limit);

    const paginatedArticles = articles.slice(startIndex, endIndex);

    res.json({
      articles: paginatedArticles,
      availableMonths,
      currentPage: page,
      totalPages,
      hasMore: page < totalPages
    });
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

// POST /api/metrics - Guardar telemetría de un artículo
app.post('/api/metrics', async (req, res) => {
  try {
    const { articleId, timeSpent, scrollDepth } = req.body;

    if (!articleId) {
      return res.status(400).json({ error: 'Falta articleId' });
    }

    // Aseguramos que la conexión esté lista (aprovecha la caché global en Vercel)
    await dbConnect();

    // Calculamos los incrementos y actualizaciones seguras
    const incTime = Number(timeSpent) || 0;
    const scroll = Number(scrollDepth) || 0;

    const updatedMetric = await ArticleMetric.findOneAndUpdate(
      { articleId },
      {
        $inc: { views: 1, totalReadTime: incTime },
        $max: { maxScrollDepth: scroll },
        $set: { lastInteraction: Date.now() }
      },
      { upsert: true, returnDocument: 'after' } // crea el registro si no existe
    );

    res.json({ success: true, data: updatedMetric });
  } catch (error) {
    console.error('Error registrando métricas:', error);
    res.status(500).json({ error: 'No se pudieron guardar las métricas' });
  }
});

// POST /api/login - Endpoint de Autenticación
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Contraseña requerida' });
  }

  if (password === process.env.ADMIN_PASSWORD) {
    // Generar token que expira en 7 días
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Enviar token como cookie segura httpOnly
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días en milisegundos
    });

    return res.json({ success: true, message: 'Autenticación exitosa' });
  } else {
    return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
});

// GET /api/dashboard - Obtener analíticas agregadas (PROTEGIDO)
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    await dbConnect();

    // Top 5 artículos más vistos
    let topArticles = await ArticleMetric.find().sort({ views: -1 }).limit(5).lean();

    // Mapear IDs a Títulos reales leyendo los archivos Markdown
    for (let article of topArticles) {
      try {
        const filePath = path.join(contentDir, `${article.articleId}.md`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        article.title = data.titulo || article.articleId;
      } catch (e) {
        article.title = article.articleId; // Si no existe el .md, fallback al ID
      }
    }

    // Promedios Globales mediante MongoDB Aggregation
    const aggregateData = await ArticleMetric.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$views" },
          sumTotalReadTime: { $sum: "$totalReadTime" },
          avgScroll: { $avg: "$maxScrollDepth" }
        }
      }
    ]);

    let avgReadTimeSeconds = 0;
    let avgScrollPercentage = 0;

    if (aggregateData.length > 0) {
      const stats = aggregateData[0];
      avgReadTimeSeconds = stats.totalViews > 0 ? Math.round(stats.sumTotalReadTime / stats.totalViews) : 0;
      avgScrollPercentage = Math.round(stats.avgScroll);
    }

    res.json({
      success: true,
      topArticles,
      globalStats: {
        avgReadTimeSeconds,
        avgScrollPercentage
      }
    });

  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({ error: 'Fallo al obtener las métricas del dashboard' });
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
