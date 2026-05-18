const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
const { MongoClient, ServerApiVersion } = require('mongodb');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

// MongoDB URI
const uri = process.env.MONGODB_URI;

// Create Mongo Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  await client.connect();

  const database = client.db('sportHavenDB');
  const facilitiesCollection = database.collection('facilities');
  const bookingsCollection = database.collection('bookings');

  app.get('/facilities', async (req, res) => {
    const result = await facilitiesCollection.find().toArray();
    res.send(result);
  });

  await client.db('admin').command({ ping: 1 });
  console.log(' MongoDB Connected Successfully');
}

run().catch((err) => {
  console.error('❌ MongoDB connection failed:', err.message);
});

// Root Route
app.get('/', (req, res) => {
  res.send('SportHaven Server Running');
});

// Server Listen
app.listen(port, () => {
  console.log(` Server running on port ${port}`);
});