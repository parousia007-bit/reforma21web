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
import { Octokit } from '@octokit/rest';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import Joi from 'joi';

dotenv.config();
import mongoose from 'mongoose';
import dbConnect from './db.js';
import ArticleMetric from './models/ArticleMetric.js';
import { requireAuth } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // Necesario para parsear el body en las peticiones POST
app.use(cookieParser()); // Necesario para leer las cookies httpOnly

// --- HARDENING DE SEGURIDAD ---

// 1. Helmet: Asegurar cabeceras HTTP
app.use(helmet());

// 2. CORS Estricto: Permitir solo frontend oficial y localhost
const allowedOrigins = ['https://reforma21.vercel.app', 'http://localhost:3000'];
app.use(cors({
  origin: function (origin, callback) {
    // Permite peticiones sin origin (como herramientas server-to-server o localhost en algunos casos) y orígenes autorizados
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por política CORS estricta'));
    }
  },
  credentials: true // Necesario si se envían cookies entre subdominios
}));

// --- LOGGING DE SEGURIDAD ---
const logSecurityIncident = async (type, ip, details) => {
  try {
    if (mongoose.connection.readyState !== 1) await dbConnect();
    const db = mongoose.connection.db;
    await db.collection('security_logs').insertOne({
      type,
      ip,
      details,
      timestamp: new Date()
    });
  } catch (e) {
    console.error('Error guardando log de seguridad:', e.message);
  }
};

// 3. Mongo Sanitize: Prevenir inyecciones NoSQL
app.use(mongoSanitize({
  onSanitize: ({ req, key }) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    logSecurityIncident('nosql_injection', ip, { key, path: req.path });
  }
}));

const rateLimitHandler = (req, res, next, options) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  logSecurityIncident('rate_limit_exceeded', ip, { path: req.path, max: options.max });
  res.status(options.statusCode).json(options.message);
};

// 4. Rate Limiting Global y Específico
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 150, // 150 peticiones máximo por IP
  message: { success: false, error: 'Límite global excedido. Por favor, intente más tarde.' },
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const metricsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, error: 'Demasiadas peticiones de telemetría. Por favor, intente más tarde.' },
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/metrics', metricsLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Demasiados intentos de acceso. Bloqueado por 15 minutos.' },
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/login', authLimiter);
app.use('/api/admin', authLimiter);

// 5. Honeypot: Trampa para bots
const blockedIPs = new Map();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const blockUntil = blockedIPs.get(ip);
  if (blockUntil && blockUntil > Date.now()) {
    logSecurityIncident('honeypot_blocked', ip, { path: req.path });
    return res.status(403).json({ success: false, error: 'Acceso denegado temporalmente por política de seguridad.' });
  }
  next();
});

const honeypotPaths = ['/admin', '/.env', '/wp-admin', '/wp-login.php', '/config.php'];
app.use((req, res, next) => {
  if (honeypotPaths.includes(req.path)) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    blockedIPs.set(ip, Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    logSecurityIncident('honeypot_trap_triggered', ip, { path: req.path });
    return res.status(403).json({ success: false, error: 'Ruta prohibida.' });
  }
  next();
});

// --- FIN HARDENING ---
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
    const limit = Math.min(parseInt(req.query.limit) || 6, 100); // Límite público obligatorio
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

// --- VALIDACIÓN DE ESQUEMAS (JOI) ---
const metricSchema = Joi.object({
  articleId: Joi.string().trim().max(100).required(),
  timeSpent: Joi.number().min(0).optional(),
  scrollDepth: Joi.number().min(0).max(100).optional()
}).options({ stripUnknown: false }); // Reject if extra fields are present

const visitSchema = Joi.object({
  article_id: Joi.string().trim().max(100).allow(null, ''),
  location: Joi.object({
    country: Joi.string().allow(null, ''),
    country_code: Joi.string().allow(null, ''),
    city: Joi.string().allow(null, ''),
    latitude: Joi.number().allow(null),
    longitude: Joi.number().allow(null)
  }).allow(null),
  device_type: Joi.string().allow(null, ''),
  referrer: Joi.string().allow(null, '')
}).options({ stripUnknown: false });

const downloadSchema = Joi.object({
  article_id: Joi.string().trim().max(100).allow(null, ''),
  pdf_url: Joi.string().uri().allow(null, ''),
  pdf_text: Joi.string().max(200).allow(null, '')
}).options({ stripUnknown: false });

const eventSchema = Joi.object({
  article_id: Joi.string().trim().max(100).allow(null, ''),
  event_type: Joi.string().trim().max(50).required(),
  button_name: Joi.string().trim().max(100).allow(null, '')
}).options({ stripUnknown: false });

// POST /api/metrics - Guardar telemetría de un artículo
app.post('/api/metrics', async (req, res) => {
  try {
    const { error, value } = metricSchema.validate(req.body);
    if (error) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      logSecurityIncident('joi_validation_failed', ip, { path: '/api/metrics', details: error.details[0].message });
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const { articleId, timeSpent, scrollDepth } = value;

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

// POST /api/metrics/visit - Registrar visita con ubicación geográfica (colección analytics)
app.post('/api/metrics/visit', async (req, res) => {
  try {
    const { error, value } = visitSchema.validate(req.body);
    if (error) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      logSecurityIncident('joi_validation_failed', ip, { path: '/api/metrics/visit', details: error.details[0].message });
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    const { article_id, location, device_type, referrer } = value;

    await dbConnect();

    // Obtener IP real (Vercel usa x-forwarded-for)
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0].trim();

    const uaString = req.headers['user-agent'] || '';
    const parser = new UAParser(uaString);
    const uaResult = parser.getResult();
    const detectedDevice = device_type || uaResult.device.type || 'desktop';
    const detectedOs     = uaResult.os.name || 'Unknown';
    const detectedBrowser = uaResult.browser.name || 'Unknown';

    // Guardar en colección dinámica 'analytics' (sin necesidad de un Model separado)
    const db = mongoose.connection.db;
    await db.collection('analytics').insertOne({
      event_type:  'visit',
      article_id:  article_id || null,
      ip,
      location:    location   || null,      // { country, city, country_code }
      device_type: detectedDevice,
      os:          detectedOs,
      browser:     detectedBrowser,
      referrer:    referrer   || req.headers.referer || null,
      timestamp:   new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error registrando visita:', error);
    // Respuesta 200 siempre para no bloquear la carga de página al usuario
    res.status(200).json({ success: false, error: error.message });
  }
});

// POST /api/metrics/download - Registrar descarga de un recurso (PDF, etc)
app.post('/api/metrics/download', async (req, res) => {
  try {
    const { error, value } = downloadSchema.validate(req.body);
    if (error) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      logSecurityIncident('joi_validation_failed', ip, { path: '/api/metrics/download', details: error.details[0].message });
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    const { article_id, pdf_url, pdf_text } = value;
    await dbConnect();

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0].trim();

    const db = mongoose.connection.db;
    await db.collection('analytics').insertOne({
      event_type: 'download',
      article_id: article_id || null,
      pdf_url:    pdf_url || null,
      pdf_text:   pdf_text || 'Descargar PDF',
      ip,
      timestamp:  new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error registrando descarga:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

// POST /api/metrics/event - Registrar eventos personalizados (WhatsApp, Becas, etc)
app.post('/api/metrics/event', async (req, res) => {
  try {
    const { error, value } = eventSchema.validate(req.body);
    if (error) {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      logSecurityIncident('joi_validation_failed', ip, { path: '/api/metrics/event', details: error.details[0].message });
      return res.status(400).json({ success: false, error: error.details[0].message });
    }
    const { article_id, event_type, button_name } = value;
    await dbConnect();

    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0].trim();

    const db = mongoose.connection.db;
    await db.collection('analytics').insertOne({
      event_type: event_type || 'interaction',
      button_name: button_name || null,
      article_id: article_id || null,
      ip,
      timestamp: new Date(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error registrando evento:', error);
    res.status(200).json({ success: false, error: error.message });
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
  // Respuesta acumulada — se devuelve con lo que logre obtener aunque alguna sección falle
  const payload = {
    success: true,
    topArticles:       [],
    globalStats:       { avgReadTimeSeconds: 0, avgScrollPercentage: 0 },
    osDistribution:    [],
    deviceDistribution: [],
    geo:               { topCities: [], topCountries: [], visitPoints: [] },
    downloads:         [],
    recentActivity:    [],
    conversions:       { whatsapp: 0, beca: 0 },
    errors:            [],   // log de fallos parciales (visible solo en respuesta)
  };

  try {
    await dbConnect();
  } catch (dbErr) {
    console.error('[Dashboard] ❌ dbConnect falló:', dbErr.message);
    return res.status(503).json({ success: false, error: 'No se pudo conectar a la base de datos', detail: dbErr.message });
  }

  // ── TOP ARTÍCULOS ─────────────────────────────────────────────────────
  try {
    let topArticles = await ArticleMetric.aggregate([
      { $group: { _id: '$articleId', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 5 }
    ]).option({ maxTimeMS: 5000 });
    for (let article of topArticles) {
      article.articleId = article._id;
      try {
        const filePath = path.join(contentDir, `${article.articleId}.md`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        article.title = data.titulo || article.articleId;
      } catch (_) { article.title = article.articleId; }
    }
    payload.topArticles = topArticles;
  } catch (e) {
    console.error('[Dashboard] ❌ topArticles:', e.message);
    payload.errors.push({ section: 'topArticles', error: e.message });
  }

  // ── PROMEDIOS GLOBALES ────────────────────────────────────────────────
  try {
    const agg = await ArticleMetric.aggregate([{
      $group: { _id: null, totalViews: { $sum: 1 }, sumTime: { $sum: '$timeSpent' }, avgScroll: { $avg: '$scrollDepth' } }
    }]).option({ maxTimeMS: 5000 });
    if (agg.length > 0) {
      payload.globalStats.avgReadTimeSeconds  = agg[0].totalViews > 0 ? Math.round(agg[0].sumTime / agg[0].totalViews) : 0;
      payload.globalStats.avgScrollPercentage = Math.round(agg[0].avgScroll || 0);
    }
  } catch (e) {
    console.error('[Dashboard] ❌ globalStats:', e.message);
    payload.errors.push({ section: 'globalStats', error: e.message });
  }

  // ── OS & DISPOSITIVOS ─────────────────────────────────────────────────
  try {
    payload.osDistribution = await ArticleMetric.aggregate([
      { $group: { _id: '$os', count: { $sum: 1 } } }, { $sort: { count: -1 } }
    ]).option({ maxTimeMS: 5000 });
    payload.deviceDistribution = await ArticleMetric.aggregate([
      { $group: { _id: '$deviceType', count: { $sum: 1 } } }, { $sort: { count: -1 } }
    ]).option({ maxTimeMS: 5000 });
  } catch (e) {
    console.error('[Dashboard] ❌ os/device:', e.message);
    payload.errors.push({ section: 'osDevice', error: e.message });
  }

  // ── DESCARGAS (colección analytics) ──────────────────────────────────
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('mongoose.connection.db no disponible aún');

    const topDownloads = await db.collection('analytics').aggregate([
      { $match: { event_type: 'download', article_id: { $exists: true, $ne: null } } },
      { $group: {
        _id: { article_id: '$article_id', pdf_text: '$pdf_text', pdf_url: '$pdf_url' },
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).maxTimeMS(5000).toArray();

    // Map to titles
    for (let dl of topDownloads) {
      dl.article_id = dl._id.article_id;
      dl.pdf_text = dl._id.pdf_text;
      dl.pdf_url = dl._id.pdf_url;
      try {
        const filePath = path.join(contentDir, `${dl.article_id}.md`);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(fileContent);
        dl.title = data.titulo || dl.article_id;
      } catch (_) { dl.title = dl.article_id; }
    }
    payload.downloads = topDownloads;
  } catch (e) {
    console.error('[Dashboard] ❌ descargas:', e.message);
    payload.errors.push({ section: 'downloads', error: e.message });
  }

  // ── GEOLOCALIZACIÓN (colección analytics) ────────────────────────────
  // Usamos try/catch independiente — si 'analytics' no existe aún, no rompe las métricas principales
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('mongoose.connection.db no disponible aún');

    const [topCities, topCountries, visitPoints] = await Promise.all([
      // Top 5 Ciudades — filtramos estrictamente: location debe ser objeto con city string
      db.collection('analytics').aggregate([
        { $match: { event_type: { $ne: 'download' }, location: { $type: 'object' }, 'location.city': { $type: 'string', $gt: '' } } },
        { $group: { _id: { city: '$location.city', country: '$location.country' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).maxTimeMS(5000).toArray(),

      // Top 5 Países
      db.collection('analytics').aggregate([
        { $match: { event_type: { $ne: 'download' }, location: { $type: 'object' }, 'location.country': { $type: 'string', $gt: '' } } },
        { $group: { _id: '$location.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]).maxTimeMS(5000).toArray(),

      // Puntos mapa — lat y lon deben ser números reales
      db.collection('analytics').aggregate([
        { $match: {
          event_type: { $ne: 'download' },
          location: { $type: 'object' },
          'location.latitude':  { $type: 'number' },
          'location.longitude': { $type: 'number' }
        }},
        { $group: {
          _id: { lat: '$location.latitude', lon: '$location.longitude', city: '$location.city' },
          count: { $sum: 1 }
        }},
        { $sort: { count: -1 } },
        { $limit: 200 }
      ]).maxTimeMS(5000).toArray()
    ]);

    payload.geo = { topCities, topCountries, visitPoints };
    console.log(`[Dashboard] ✅ Geo: ${topCities.length} ciudades, ${topCountries.length} países, ${visitPoints.length} puntos`);

  } catch (e) {
    console.error('[Dashboard] ❌ geolocalización:', e.message);
    payload.errors.push({ section: 'geo', error: e.message });
    // payload.geo ya tiene arrays vacíos por defecto → el mapa carga en blanco sin romper
  }

  // ── CONVERSIONES ───────────────────────────────────────────────────
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('mongoose.connection.db no disponible aún');

    const whatsappCount = await db.collection('analytics').countDocuments({ event_type: 'whatsapp' }, { maxTimeMS: 5000 });
    const becaCount = await db.collection('analytics').countDocuments({ event_type: 'beca' }, { maxTimeMS: 5000 });

    payload.conversions.whatsapp = whatsappCount;
    payload.conversions.beca = becaCount;
  } catch (e) {
    console.error('[Dashboard] ❌ conversiones:', e.message);
    payload.errors.push({ section: 'conversions', error: e.message });
  }

  // ── ACTIVIDAD RECIENTE ───────────────────────────────────────────────
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('mongoose.connection.db no disponible aún');

    const recentActivity = await db.collection('analytics')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    payload.recentActivity = recentActivity;
  } catch (e) {
    console.error('[Dashboard] ❌ actividad reciente:', e.message);
    payload.errors.push({ section: 'recentActivity', error: e.message });
  }

  // Cabeceras anti-caché: fuerza a Vercel/CDN a NO cachear esta respuesta,
  // garantizando datos en tiempo real desde MongoDB en cada apertura del Dashboard.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Siempre HTTP 200 — el cliente puede ver payload.errors para diagnóstico
  payload.current_ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  res.json(payload);
});


// GET /api/cms/files - Listar archivos .md del repositorio en GitHub (PROTEGIDO)
app.get('/api/cms/files', requireAuth, async (req, res) => {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO  = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({ success: false, error: 'Faltan variables de entorno de GitHub' });
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: 'content',
      ref: 'main',
    });

    const files = Array.isArray(data)
      ? data.filter(f => f.name.endsWith('.md')).map(f => ({ name: f.name, sha: f.sha, size: f.size }))
      : [];

    res.json({ success: true, files });
  } catch (error) {
    console.error('Error listando archivos GitHub:', error);
    res.status(500).json({ success: false, error: error.message || 'Error al listar archivos' });
  }
});

// GET /api/cms/files/:filename - Obtener contenido RAW de un archivo .md desde GitHub (PROTEGIDO)
app.get('/api/cms/files/:filename', requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);

    if (!safeFilename.endsWith('.md')) {
      return res.status(400).json({ success: false, error: 'Solo se permiten archivos .md' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO  = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({ success: false, error: 'Faltan variables de entorno de GitHub' });
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: `content/${safeFilename}`,
      ref: 'main',
    });

    // El contenido viene en Base64 desde GitHub
    const rawContent = Buffer.from(data.content, 'base64').toString('utf-8');

    res.json({ success: true, filename: safeFilename, sha: data.sha, rawContent });
  } catch (error) {
    console.error('Error descargando archivo GitHub:', error);
    res.status(error.status === 404 ? 404 : 500).json({ success: false, error: error.message || 'Error al descargar archivo' });
  }
});

// POST /api/publish - Publicar nuevo artículo via GitHub API (PROTEGIDO)
app.post('/api/publish', requireAuth, async (req, res) => {
  try {
    const { titulo, autor, extracto, layout, fecha, etiquetas, color_tema, imagen_cabecera,
            video_url, pdf_url, pdf_text,
            markdownContent, existingFilename } = req.body;

    if (!titulo || !markdownContent) {
      return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: titulo y markdownContent' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO  = process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(500).json({ success: false, error: 'Faltan variables de entorno de GitHub (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)' });
    }

    // Si venimos de editar un archivo existente, conservar su nombre exacto.
    // Si es un artículo nuevo, generar el slug desde el título.
    let slug, filename;
    if (existingFilename) {
      filename = `content/${path.basename(existingFilename)}`;
      slug = path.basename(existingFilename).replace('.md', '');
    } else {
      slug = titulo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_');
      filename = `content/${slug}.md`;
    }

    // Construir el Frontmatter YAML
    // Se usa array + join para garantizar que cada campo quede en su propia línea.
    // Se usan comillas dobles para URLs para evitar conflictos con caracteres especiales.
    const tagsList = (etiquetas || '').split(',').map(t => `
  - ${t.trim()}`).join('');
    const safePdfText = (pdf_text || 'Descargar PDF').replace(/'/g, "\\'");

    const frontmatterLines = [
      '---',
      `id: ${slug}`,
      `titulo: >-`,
      `  ${titulo}`,
      `autor: ${autor || 'Reforma 2.1'}`,
      `fecha: '${fecha || new Date().getFullYear()}'`,
      `etiquetas:${tagsList || '\n  - General'}`,
      `color_tema: '${color_tema || '#D4A843'}'`,
      `layout: '${layout || 'clasico'}'`,
      `imagen_cabecera: "${(imagen_cabecera || '').replace(/"/g, "'")}"`,
      `video_url: "${(video_url || '').replace(/"/g, "'")}"`,
      `pdf_url: "${(pdf_url || '').replace(/"/g, "'")}"`,
      `pdf_text: '${safePdfText}'`,
      `extracto: >-`,
      `  ${extracto || ''}`,
      '---',
      '',
    ];
    const frontmatter = frontmatterLines.join('\n');

    // LOG DE AUDITORÍA — visible en los logs del servidor / Vercel Functions
    console.log('[CMS PUBLISH] destino:', filename);
    console.log('[CMS PUBLISH] frontmatter:\n' + frontmatter);
    console.log('[CMS PUBLISH] primeros 300 chars del Markdown:', markdownContent.substring(0, 300));

    const fullContent = frontmatter + markdownContent;

    // Codificar el contenido en Base64 (requerido por GitHub API)
    const contentBase64 = Buffer.from(fullContent, 'utf-8').toString('base64');

    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // Verificar si el archivo ya existe para obtener su SHA (necesario para actualizar)
    let fileSha = undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: filename,
      });
      fileSha = data.sha;
    } catch (e) {
      // El archivo no existe, es un artículo nuevo — no se necesita SHA
    }

    // Crear o actualizar el archivo en GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filename,
      message: `📝 [CMS] Publicar artículo: ${titulo}`,
      content: contentBase64,
      branch: 'main',
      ...(fileSha ? { sha: fileSha } : {}),
    });

    res.json({
      success: true,
      message: `Artículo "${titulo}" publicado exitosamente. Vercel desplegará los cambios en unos momentos.`,
      slug,
      filename
    });

  } catch (error) {
    console.error('Error publicando en GitHub:', error);
    res.status(500).json({ success: false, error: error.message || 'Error al publicar en GitHub' });
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
