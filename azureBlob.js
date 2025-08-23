const { BlobServiceClient } = require('@azure/storage-blob');
const dotenv = require('dotenv');

dotenv.config();

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

const containerName = "music-files"; // container for music files
const containerClient = blobServiceClient.getContainerClient(containerName);

module.exports = containerClient;
