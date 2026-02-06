const express = require('express');
const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const gstApiRoutes = require('./routes/gstApi');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Default Route
app.get('/', (req, res) => {
    res.json({ message: 'GST Billing Backend API is running' });
});

// API Routes
app.use('/', apiRoutes);
app.use('/', gstApiRoutes);

// Error Handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports.handler = serverless(app);
