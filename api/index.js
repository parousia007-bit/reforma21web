import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { UAParser } from 'ua-parser-js';

dotenv.config();
import dbConnect from './db.js';
import ArticleMetric from './models/ArticleMetric.js';
import { requireAuth } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    marked.use({ breaks: true, gfm: true, headerIds: false, mangle: false });
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

    await dbConnect();

    const incTime = Number(timeSpent) || 0;
    const scroll = Number(scrollDepth) || 0;

    // Obtener IP y datos de User-Agent
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const uaString = req.headers['user-agent'];
    const parser = new UAParser(uaString);
    const result = parser.getResult();

    const os = result.os.name || 'Unknown';
    const browser = result.browser.name || 'Unknown';
    const deviceType = result.device.type || 'desktop';

    // Crear un nuevo log en vez de actualizar
    const newMetric = await ArticleMetric.create({
      articleId,
      timeSpent: incTime,
      scrollDepth: scroll,
      ip,
      os,
      deviceType,
      browser
    });

    res.json({ success: true, data: newMetric });
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

    // Top 5 artículos más vistos (agrupando logs)
    let topArticles = await ArticleMetric.aggregate([
      { $group: { _id: "$articleId", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 5 }
    ]);

    // Mapear IDs a Títulos reales y darle formato
    for (let article of topArticles) {
      article.articleId = article._id;
      try {
        const filePath = path.join(contentDir, `${article.articleId}.md`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        article.title = data.titulo || article.articleId;
      } catch (e) {
        article.title = article.articleId; 
      }
    }

    // Promedios Globales
    const aggregateData = await ArticleMetric.aggregate([
      {
        $group: {
          _id: null,
          totalViews: { $sum: 1 },
          sumTotalReadTime: { $sum: "$timeSpent" },
          avgScroll: { $avg: "$scrollDepth" }
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

    // Distribución por OS
    const osData = await ArticleMetric.aggregate([
      { $group: { _id: "$os", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Distribución por Dispositivo
    const deviceData = await ArticleMetric.aggregate([
      { $group: { _id: "$deviceType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      topArticles,
      globalStats: {
        avgReadTimeSeconds,
        avgScrollPercentage
      },
      osDistribution: osData,
      deviceDistribution: deviceData
    });

  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({ error: 'Fallo al obtener las métricas del dashboard' });
  }
});

// Export the express app for Vercel Serverless Functions
export default app;

// Provide a local fallback to run the app if not in Vercel
import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
