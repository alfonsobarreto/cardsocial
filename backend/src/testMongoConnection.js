const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;

async function testConnection() {
  try {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    console.log('Connected successfully to MongoDB');

    const db = client.db(dbName);
    const stats = await db.stats();
    console.log('Database Stats:', stats);

    await client.close();
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

testConnection();