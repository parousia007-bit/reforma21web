import mongoose from 'mongoose';

const ArticleMetricSchema = new mongoose.Schema({
  articleId: {
    type: String,
    required: true,
    index: true // ya no es unique, ahora es un log de interacciones
  },
  timeSpent: {
    type: Number,
    default: 0
  },
  scrollDepth: {
    type: Number,
    default: 0
  },
  ip: { type: String },
  os: { type: String },
  deviceType: { type: String },
  browser: { type: String },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // añade createdAt y updatedAt automáticamente
});

// Evitamos problemas de recompilación del modelo en entornos Serverless
export default mongoose.models.ArticleMetric || mongoose.model('ArticleMetric', ArticleMetricSchema);
