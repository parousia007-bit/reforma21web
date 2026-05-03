import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import dbConnect from './api/db.js';

async function inspect() {
  await dbConnect();
  const db = mongoose.connection.db;
  
  const visits = await db.collection('analytics').find({ event_type: 'visit' }).sort({ _id: -1 }).limit(5).toArray();
  console.log("=== LATEST VISITS ===");
  console.log(JSON.stringify(visits, null, 2));

  const downloads = await db.collection('analytics').find({ event_type: 'download' }).sort({ _id: -1 }).limit(5).toArray();
  console.log("=== LATEST DOWNLOADS ===");
  console.log(JSON.stringify(downloads, null, 2));
  
  process.exit(0);
}

inspect().catch(console.error);
