const { CosmosClient } = require('@azure/cosmos');
const dotenv = require('dotenv');

dotenv.config();

const client = new CosmosClient({ endpoint: process.env.COSMOS_DB_ENDPOINT, key: process.env.COSMOS_DB_KEY });

const database = client.database('music-marketplace'); // database name
const container = database.container('songs'); // container name
const purchasesContainer = client
  .database("music-marketplace")
  .container("purchases");

module.exports = container;

