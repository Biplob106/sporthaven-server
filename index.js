const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://sporthaven.vercel.app',
    ],
    credentials: true,
  })
);
app.use(express.json());

const port = process.env.PORT || 5000;
const AUTH_BASE = process.env.AUTH_BASE || 'http://localhost:3000';
const JWKS = createRemoteJWKSet(new URL(`${AUTH_BASE}/api/auth/jwks`));

const uri = process.env.MONGODB_URI;

let cachedClient = null;
let cachedDb = null;

const getDb = async () => {
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }
  await cachedClient.connect();
  cachedDb = cachedClient.db('sportHavenDB');
  return cachedDb;
};

const getCollections = async () => {
  const db = await getDb();
  return {
    facilitiesCollection: db.collection('facilities'),
    bookingsCollection: db.collection('bookings'),
  };
};

const toObjectId = (id) => {
  if (!ObjectId.isValid(id)) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  return new ObjectId(id);
};

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_BASE,
      audience: AUTH_BASE,
    });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

app.get('/', (req, res) => {
  res.send('SportHaven Server Running');
});

app.get('/facilities', async (req, res, next) => {
  try {
    const { facilitiesCollection } = await getCollections();
    const { search, types, owner_email } = req.query;
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (types) query.facility_type = { $in: types.split(',') };
    if (owner_email) query.owner_email = owner_email;
    const result = await facilitiesCollection.find(query).toArray();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/facilities/:id', async (req, res, next) => {
  try {
    const { facilitiesCollection } = await getCollections();
    const result = await facilitiesCollection.findOne({
      _id: toObjectId(req.params.id),
    });
    if (!result) return res.status(404).json({ message: 'Facility not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/facilities', verifyToken, async (req, res, next) => {
  try {
    const { facilitiesCollection } = await getCollections();
    const facility = {
      ...req.body,
      owner_email: req.user.email,
      booking_count: 0,
      createdAt: new Date(),
    };
    const result = await facilitiesCollection.insertOne(facility);
    res.status(201).json({ _id: result.insertedId, ...facility });
  } catch (err) {
    next(err);
  }
});

app.patch('/facilities/:id', verifyToken, async (req, res, next) => {
  try {
    const { facilitiesCollection } = await getCollections();
    const _id = toObjectId(req.params.id);
    const existing = await facilitiesCollection.findOne({ _id });
    if (!existing) return res.status(404).json({ message: 'Facility not found' });
    if (existing.owner_email !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { _id: _ignore, owner_email, booking_count, ...patch } = req.body;
    await facilitiesCollection.updateOne({ _id }, { $set: patch });
    res.json({ message: 'Facility updated' });
  } catch (err) {
    next(err);
  }
});

app.delete('/facilities/:id', verifyToken, async (req, res, next) => {
  try {
    const { facilitiesCollection } = await getCollections();
    const _id = toObjectId(req.params.id);
    const existing = await facilitiesCollection.findOne({ _id });
    if (!existing) return res.status(404).json({ message: 'Facility not found' });
    if (existing.owner_email !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await facilitiesCollection.deleteOne({ _id });
    res.json({ message: 'Facility deleted' });
  } catch (err) {
    next(err);
  }
});

app.get('/bookings', verifyToken, async (req, res, next) => {
  try {
    const { bookingsCollection } = await getCollections();
    const result = await bookingsCollection
      .find({ user_email: req.user.email })
      .toArray();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/bookings', verifyToken, async (req, res, next) => {
  try {
    const { facilitiesCollection, bookingsCollection } = await getCollections();
    const { facility_id, booking_date, time_slot, hours, total_price } = req.body;
    if (!facility_id || !booking_date || !time_slot) {
      return res.status(400).json({ message: 'Missing required booking fields' });
    }
    const booking = {
      facility_id,
      user_email: req.user.email,
      booking_date,
      time_slot,
      hours,
      total_price,
      status: 'pending',
      createdAt: new Date(),
    };
    const result = await bookingsCollection.insertOne(booking);
    await facilitiesCollection.updateOne(
      { _id: toObjectId(facility_id) },
      { $inc: { booking_count: 1 } }
    );
    res.status(201).json({ _id: result.insertedId, ...booking });
  } catch (err) {
    next(err);
  }
});

app.patch('/bookings/:id', verifyToken, async (req, res, next) => {
  try {
    const { bookingsCollection } = await getCollections();
    const _id = toObjectId(req.params.id);
    const existing = await bookingsCollection.findOne({ _id });
    if (!existing) return res.status(404).json({ message: 'Booking not found' });
    if (existing.user_email !== req.user.email) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { _id: _ignore, user_email, ...patch } = req.body;
    await bookingsCollection.updateOne({ _id }, { $set: patch });
    res.json({ message: 'Booking updated' });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = app;
