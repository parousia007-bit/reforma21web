const mongoose = require('mongoose');

const ArticleMetricSchema = new mongoose.Schema({
  articleId: {
    type: String,
    required: true,
    unique: true, // indexado automáticamente, vital para búsquedas rápidas
    index: true
  },
  views: {
    type: Number,
    default: 0
  },
  totalReadTime: {
    type: Number,
    default: 0
  },
  maxScrollDepth: {
    type: Number,
    default: 0
  },
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // añade createdAt y updatedAt automáticamente
});

// Evitamos problemas de recompilación del modelo en entornos Serverless
module.exports = mongoose.models.ArticleMetric || mongoose.model('ArticleMetric', ArticleMetricSchema);
