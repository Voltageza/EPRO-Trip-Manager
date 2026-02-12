import { Router } from 'express';
import { getUserCount, createUser, authenticate, generateToken, getUser } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Check if setup is needed (0 users)
router.get('/status', (req, res) => {
  const count = getUserCount();
  res.json({ needsSetup: count === 0 });
});

// Create first admin account (only works when 0 users exist)
router.post('/setup', async (req, res) => {
  if (getUserCount() > 0) {
    return res.status(403).json({ error: 'Setup already completed' });
  }

  const { username, password, displayName, default_vehicle } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const user = await createUser(username, password, displayName, 'admin', default_vehicle);
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({ token, user });
});

// Get current user profile
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
