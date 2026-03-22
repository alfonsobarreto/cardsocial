require('./mocks');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const VaultItem = require('../models/VaultItem');
const User = require('../models/User');

const makeAuthHeader = (userId = 'user_vault') => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
  return { token, userId };
};

const mockUser = (userId) => {
  User.findById.mockResolvedValue({
    _id: userId,
    name: 'Test User',
    email: 'vault@example.com',
    role: 'user',
    isActive: true,
  });
};

beforeEach(() => {
  VaultItem._reset();
  jest.clearAllMocks();
});

describe('Vault routes', () => {
  test('POST /api/vault – creates an encrypted item', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const res = await request(app)
      .post('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'My Password', category: 'password', data: 'super_secret_123' });

    expect(res.status).toBe(201);
    expect(res.body.item.label).toBe('My Password');
    expect(res.body.item.encryptedData).toBeUndefined();
  });

  test('POST /api/vault – fails without label', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const res = await request(app)
      .post('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'note', data: 'private' });

    expect(res.status).toBe(400);
  });

  test('GET /api/vault – lists items without encrypted data', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    // Seed a vault item
    await VaultItem.create({ owner: userId, label: 'Note', category: 'note', encryptedData: 'enc', iv: 'iv' });

    const res = await request(app)
      .get('/api/vault')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    res.body.items.forEach((item) => {
      expect(item.encryptedData).toBeUndefined();
    });
  });

  test('GET /api/vault/:id/data – returns decrypted data', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    // Create item via API to get encrypted data stored
    const createRes = await request(app)
      .post('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Secret', category: 'note', data: 'my secret text' });

    const id = createRes.body.item._id;

    // Retrieve the raw item from the store to mock findOne
    const stored = Object.values(VaultItem._items).find((i) => i._id === id);
    VaultItem.findOne.mockResolvedValueOnce({ ...stored, save: jest.fn() });

    const res = await request(app)
      .get(`/api/vault/${id}/data`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBe('my secret text');
  });

  test('DELETE /api/vault/:id – deletes an item', async () => {
    const { token, userId } = makeAuthHeader();
    mockUser(userId);

    const createRes = await request(app)
      .post('/api/vault')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Temp', category: 'other', data: 'x' });

    const id = createRes.body.item._id;
    VaultItem.findOneAndDelete.mockResolvedValueOnce({ _id: id });

    const res = await request(app)
      .delete(`/api/vault/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Item deleted');
  });
});
