const request = require('supertest');

// Ensure server health checks are test-safe
process.env.SKIP_DB_CHECK = 'true';
process.env.SKIP_BLOB_CHECK = 'true';

// Mock external modules to avoid any network/service calls
jest.mock('@prisma/client', () => {
  const mockClient = {
    $queryRaw: jest.fn().mockResolvedValue([1])
  };
  return { PrismaClient: jest.fn(() => mockClient) };
});

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => ({
        exists: jest.fn().mockResolvedValue(true),
        create: jest.fn().mockResolvedValue(undefined),
        getBlockBlobClient: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue(undefined),
          url: 'https://example.com/mock'
        }))
      }))
    }))
  }
}));

jest.mock('../firebase', () => ({
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user' })
  })
}));

const app = require('../server');

describe('GET /health', () => {
  it('returns ok and basic shape', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
  });
});


