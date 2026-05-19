const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      // add your deployed frontend URL here, e.g. 'https://sporthaven.vercel.app'
    ],
    credentials: true,
  })
);
app.use(express.json());

const port = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const toObjectId = (id) => {
  if (!ObjectId.isValid(id)) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  return new ObjectId(id);
};

async function run() {
  await client.connect();

  const database = client.db('sportHavenDB');
  const facilitiesCollection = database.collection('facilities');
  const bookingsCollection = database.collection('bookings');

  app.get('/', (req, res) => {
    res.send('SportHaven Server Running');
  });

  app.get('/facilities', async (req, res, next) => {
    try {
      const result = await facilitiesCollection.find().toArray();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/facilities/:id', async (req, res, next) => {
    try {
      const result = await facilitiesCollection.findOne({
        _id: toObjectId(req.params.id),
      });
      if (!result) return res.status(404).json({ message: 'Facility not found' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/bookings', async (req, res, next) => {
    try {
      const { email } = req.query;
      const query = email ? { userEmail: email } : {};
      const result = await bookingsCollection.find(query).toArray();
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/bookings', async (req, res, next) => {
    try {
      const booking = {
        ...req.body,
        status: req.body.status || 'pending',
        createdAt: new Date(),
      };
      const result = await bookingsCollection.insertOne(booking);
      res.status(201).json({ _id: result.insertedId, ...booking });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/bookings/:id', async (req, res, next) => {
    try {
      const result = await bookingsCollection.updateOne(
        { _id: toObjectId(req.params.id) },
        { $set: req.body }
      );
      if (!result.matchedCount) return res.status(404).json({ message: 'Booking not found' });
      res.json({ message: 'Booking updated' });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/bookings/:id', async (req, res, next) => {
    try {
      const result = await bookingsCollection.deleteOne({
        _id: toObjectId(req.params.id),
      });
      if (!result.deletedCount) return res.status(404).json({ message: 'Booking not found' });
      res.json({ message: 'Booking cancelled' });
    } catch (err) {
      next(err);
    }
  });

  await client.db('admin').command({ ping: 1 });
  console.log('MongoDB Connected Successfully');
}

run().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
