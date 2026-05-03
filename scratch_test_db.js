import dbConnect from './api/db.js';
import mongoose from 'mongoose';

async function dump() {
  try {
    await dbConnect();
    const db = mongoose.connection.db;
    const docs = await db.collection('analytics').find({}).toArray();
    console.log(`Found ${docs.length} documents.`);
    console.log(JSON.stringify(docs, null, 2));
  } catch(err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
dump();
