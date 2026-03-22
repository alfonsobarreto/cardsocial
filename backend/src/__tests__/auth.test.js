require('./mocks');

const request = require('supertest');
const app = require('../server');
const User = require('../models/User');

beforeEach(() => {
  User._reset();
});

describe('Auth routes', () => {
  test('POST /api/auth/register – creates a user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
  });

  test('POST /api/auth/register – fails with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register – rejects duplicate email', async () => {
    const payload = { name: 'Alice', email: 'alice@example.com', password: 'password123' };
    await request(app).post('/api/auth/register').send(payload);

    // Second registration – make findOne return the existing user
    User.findOne.mockResolvedValueOnce({ email: 'alice@example.com' });

    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login – returns token on valid credentials', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    // Mock findOne().select('+password') chaining
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('password123', 1);
    const userDoc = {
      _id: reg.body.user.id,
      email: 'alice@example.com',
      role: 'user',
      isActive: true,
      password: hashed,
      comparePassword: async (pwd) => bcrypt.compare(pwd, hashed),
      save: jest.fn().mockResolvedValue({}),
    };
    User.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(userDoc) });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login – rejects wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('password123', 1);
    User.findOne.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({
        email: 'alice@example.com',
        isActive: true,
        password: hashed,
        comparePassword: async (pwd) => bcrypt.compare(pwd, hashed),
        save: jest.fn().mockResolvedValue({}),
      }),
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me – returns current user', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

    User.findById.mockResolvedValueOnce({
      _id: reg.body.user.id,
      name: 'Alice',
      email: 'alice@example.com',
      role: 'user',
      isActive: true,
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/auth/me – returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
