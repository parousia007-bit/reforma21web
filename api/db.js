import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Configuración local: leer variables del .env
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'Por favor define la variable de entorno MONGODB_URI dentro de .env'
  );
}

/**
 * Patrón Singleton global para la conexión de Mongoose.
 * En un entorno Serverless como Vercel, el estado global se mantiene
 * entre invocaciones de una misma función Lambda (en estado "warm").
 * Esto previene agotar el pool de conexiones a la BD con cada petición.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Fallback rápido si la conexión se cae
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log('Conectado a MongoDB exitosamente.');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
