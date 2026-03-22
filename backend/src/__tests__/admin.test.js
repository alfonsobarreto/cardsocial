require('./mocks');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const Card = require('../models/Card');
const Report = require('../models/Report');

const makeToken = (userId, role = 'admin') =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET);

const mockUser = (userId, role = 'admin') => {
  User.findById.mockResolvedValue({
    _id: userId,
    name: 'Admin',
    email: 'admin@example.com',
    role,
    isActive: true,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Admin routes', () => {
  test('GET /api/admin/stats – returns stats for admin', async () => {
    const userId = 'admin1';
    const token = makeToken(userId);
    mockUser(userId, 'admin');

    User.countDocuments.mockResolvedValue(5);
    Card.countDocuments.mockImplementation((q) => {
      if (q && q.moderationStatus === 'pending') return Promise.resolve(2);
      return Promise.resolve(10);
    });
    Report.countDocuments.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(5);
    expect(res.body.totalCards).toBe(10);
    expect(res.body.pendingCards).toBe(2);
    expect(res.body.openReports).toBe(1);
  });

  test('GET /api/admin/stats – 403 for regular user', async () => {
    const userId = 'regular1';
    const token = makeToken(userId, 'user');
    User.findById.mockResolvedValue({
      _id: userId,
      role: 'user',
      isActive: true,
    });

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('GET /api/admin/users – lists users', async () => {
    const userId = 'admin2';
    const token = makeToken(userId);
    mockUser(userId, 'admin');

    User.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ _id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'user' }]),
    });
    User.countDocuments.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test('GET /api/admin/cards/pending – lists pending cards', async () => {
    const userId = 'admin3';
    const token = makeToken(userId);
    mockUser(userId, 'admin');

    Card.find.mockImplementation((query) => {
      const p = Promise.resolve([{ _id: 'c1', name: 'Test Card', moderationStatus: 'pending' }]);
      p.sort = () => p;
      p.populate = () => p;
      return p;
    });

    const res = await request(app)
      .get('/api/admin/cards/pending')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
  });

  test('PUT /api/admin/cards/:id/moderate – approves a card', async () => {
    const userId = 'admin4';
    const token = makeToken(userId);
    mockUser(userId, 'admin');

    Card.findByIdAndUpdate.mockResolvedValue({ _id: 'card1', moderationStatus: 'approved' });

    const res = await request(app)
      .put('/api/admin/cards/card1/moderate')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', note: 'Looks good' });

    expect(res.status).toBe(200);
    expect(res.body.card.moderationStatus).toBe('approved');
  });

  test('PUT /api/admin/cards/:id/moderate – rejects invalid status', async () => {
    const userId = 'admin5';
    const token = makeToken(userId);
    mockUser(userId, 'admin');

    const res = await request(app)
      .put('/api/admin/cards/card1/moderate')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(400);
  });
});
