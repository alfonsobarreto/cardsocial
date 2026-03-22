process.env.JWT_SECRET = 'test_secret';
process.env.VAULT_ENCRYPTION_KEY = 'test_key_32chars_padded_to_length';

// ── Mock mongoose ──────────────────────────────────────────────────────────────
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(undefined),
    Schema: actual.Schema,
    model: jest.fn((name) => name),
  };
});

// ── Mock User model ────────────────────────────────────────────────────────────
jest.mock('../models/User', () => {
  // Use require inside factory – allowed by jest
  const mockBcrypt = require('bcryptjs');

  const users = {};
  const Model = {
    findOne: jest.fn(async ({ email } = {}) => {
      const user = Object.values(users).find((u) => u.email === email);
      if (!user) return null;
      return {
        ...user,
        comparePassword: async (pwd) => mockBcrypt.compare(pwd, user.password),
        save: jest.fn().mockResolvedValue(user),
      };
    }),
    findById: jest.fn(async (id) => {
      const user = users[String(id)];
      if (!user) return null;
      return { ...user, save: jest.fn().mockResolvedValue(user) };
    }),
    create: jest.fn(async (data) => {
      const id = String(Math.random());
      const hashed = await mockBcrypt.hash(data.password, 1);
      const user = { _id: id, role: 'user', isActive: true, ...data, password: hashed };
      users[id] = user;
      return { ...user, save: jest.fn().mockResolvedValue(user) };
    }),
    countDocuments: jest.fn().mockResolvedValue(2),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }),
    findByIdAndUpdate: jest.fn(async (id, update) => {
      const user = users[String(id)];
      if (!user) return null;
      Object.assign(user, update.$set || update);
      return user;
    }),
    _users: users,
    _reset: () => { Object.keys(users).forEach((k) => delete users[k]); },
  };
  return Model;
});

// ── Mock Card model ────────────────────────────────────────────────────────────
jest.mock('../models/Card', () => {
  const cards = {};
  const makeDoc = (card) => ({
    ...card,
    save: jest.fn().mockImplementation(async () => {
      Object.assign(cards[card._id], card);
      return cards[card._id];
    }),
  });
  const Model = {
    create: jest.fn(async (data) => {
      const id = String(Math.random());
      const card = { _id: id, viewCount: 0, shareCount: 0, moderationStatus: 'pending', isPublic: true, isActive: true, ...data };
      cards[id] = card;
      return makeDoc(card);
    }),
    findOne: jest.fn(async (query) => {
      const card = Object.values(cards).find((c) => {
        return (!query._id || String(c._id) === String(query._id)) &&
               (!query.slug || c.slug === query.slug) &&
               (!query.owner || String(c.owner) === String(query.owner)) &&
               (query.isPublic === undefined || c.isPublic === query.isPublic) &&
               (query.isActive === undefined || c.isActive === query.isActive);
      });
      if (!card) return null;
      return makeDoc({ ...card });
    }),
    find: jest.fn((query) => {
      const promise = Promise.resolve(
        Object.values(cards).filter((c) => !query || !query.owner || String(c.owner) === String(query.owner))
      );
      promise.sort = () => promise;
      promise.populate = () => promise;
      return promise;
    }),
    findOneAndDelete: jest.fn(async (query) => {
      const card = Object.values(cards).find((c) =>
        String(c._id) === String(query._id) && String(c.owner) === String(query.owner)
      );
      if (!card) return null;
      delete cards[card._id];
      return card;
    }),
    findById: jest.fn(async (id) => cards[String(id)] || null),
    findByIdAndUpdate: jest.fn(async (id, update) => {
      const card = cards[String(id)];
      if (!card) return null;
      Object.assign(card, update);
      return card;
    }),
    countDocuments: jest.fn().mockResolvedValue(1),
    _cards: cards,
    _reset: () => { Object.keys(cards).forEach((k) => delete cards[k]); },
  };
  return Model;
});

// ── Mock VaultItem model ───────────────────────────────────────────────────────
jest.mock('../models/VaultItem', () => {
  const items = {};
  const Model = {
    create: jest.fn(async (data) => {
      const id = String(Math.random());
      const item = { _id: id, ...data };
      items[id] = item;
      return item;
    }),
    find: jest.fn((query) => {
      const promise = Promise.resolve(
        Object.values(items).filter((i) => String(i.owner) === String(query.owner))
      );
      promise.sort = () => promise;
      return promise;
    }),
    findOne: jest.fn(async (query) => {
      const item = Object.values(items).find((i) =>
        String(i._id) === String(query._id) && String(i.owner) === String(query.owner)
      );
      if (!item) return null;
      return { ...item, save: jest.fn().mockResolvedValue(item) };
    }),
    findOneAndDelete: jest.fn(async (query) => {
      const item = Object.values(items).find((i) =>
        String(i._id) === String(query._id) && String(i.owner) === String(query.owner)
      );
      if (!item) return null;
      delete items[item._id];
      return item;
    }),
    _items: items,
    _reset: () => { Object.keys(items).forEach((k) => delete items[k]); },
  };
  return Model;
});

// ── Mock Contact model ─────────────────────────────────────────────────────────
jest.mock('../models/Contact', () => {
  const contacts = {};
  const Model = {
    create: jest.fn(async (data) => {
      const id = String(Math.random());
      const contact = { _id: id, tags: [], notes: '', ...data };
      contacts[id] = contact;
      return contact;
    }),
    find: jest.fn((query) => {
      const promise = Promise.resolve(Object.values(contacts));
      promise.sort = () => promise;
      promise.populate = () => promise;
      return promise;
    }),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
    _reset: () => { Object.keys(contacts).forEach((k) => delete contacts[k]); },
  };
  return Model;
});

// ── Mock Report model ──────────────────────────────────────────────────────────
jest.mock('../models/Report', () => {
  const reports = {};
  const Model = {
    create: jest.fn(async (data) => {
      const id = String(Math.random());
      const report = { _id: id, status: 'open', ...data };
      reports[id] = report;
      return report;
    }),
    find: jest.fn((query) => {
      const promise = Promise.resolve(Object.values(reports));
      promise.sort = () => promise;
      promise.populate = () => promise;
      return promise;
    }),
    countDocuments: jest.fn().mockResolvedValue(0),
    findByIdAndUpdate: jest.fn(),
    _reset: () => { Object.keys(reports).forEach((k) => delete reports[k]); },
  };
  return Model;
});

module.exports = {};
