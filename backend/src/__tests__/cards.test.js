require('./mocks');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Card = require('../models/Card');
const User = require('../models/User');

const makeAuthHeader = (userId = 'user123', role = 'user') => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return { token, userId };
};

const mockUser = (userId, role = 'user') => {
  User.findById.mockResolvedValue({
    _id: userId,
    name: 'Test User',
    email: 'test@example.com',
    role,
    isActive: true,
  });
};

beforeEach(() => {
  Card._reset();
  jest.clearAllMocks();
});

describe('Card routes', () => {
  test('POST /api/cards – creates a card with slug and qrCode', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bob Smith', jobTitle: 'Engineer', company: 'Acme' });

    expect(res.status).toBe(201);
    expect(res.body.card.name).toBe('Bob Smith');
    expect(res.body.card.slug).toBeDefined();
    expect(res.body.card.qrCode).toBeDefined();
  });

  test('POST /api/cards – fails without name', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobTitle: 'Engineer' });

    expect(res.status).toBe(400);
  });

  test('GET /api/cards – returns user cards', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    // Pre-populate card store
    await Card.create({ owner: userId, name: 'Card One', slug: 'abc123' });

    const res = await request(app)
      .get('/api/cards')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
  });

  test('GET /api/cards/public/:slug – returns card and increments viewCount', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const createRes = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Public Card' });

    const { slug } = createRes.body.card;

    const savedCard = { ...createRes.body.card, viewCount: 0, isPublic: true, isActive: true };
    Card.findOne.mockImplementation(async (query) => {
      if (query.slug === slug) {
        return { ...savedCard, save: jest.fn().mockResolvedValue(savedCard) };
      }
      return null;
    });

    const res = await request(app).get(`/api/cards/public/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.card.viewCount).toBe(1);
  });

  test('DELETE /api/cards/:id – deletes owned card', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const createRes = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Delete' });

    const id = createRes.body.card._id;

    // Mock findOneAndDelete to return the card
    Card.findOneAndDelete.mockResolvedValueOnce({ _id: id, name: 'To Delete' });

    const res = await request(app)
      .delete(`/api/cards/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Card deleted');
  });

  test('DELETE /api/cards/:id – returns 404 for non-owned card', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);
    Card.findOneAndDelete.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/cards/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
