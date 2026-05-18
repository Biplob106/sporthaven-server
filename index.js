const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('SportHaven Server Running');
});

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});