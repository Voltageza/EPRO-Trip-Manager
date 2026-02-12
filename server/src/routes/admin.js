import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listUsers, createUser, setUserActive, resetPassword, setDefaultVehicle, deleteUser } from '../services/authService.js';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// List all users
router.get('/users', (req, res) => {
  res.json(listUsers());
});

// Create a new user
router.post('/users', async (req, res) => {
  const { username, password, displayName, role, default_vehicle } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const user = await createUser(username, password, displayName, role || 'user', default_vehicle);
    res.json(user);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update user (toggle active, reset password)
router.patch('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { is_active, password, default_vehicle } = req.body;

  try {
    let user;
    if (is_active !== undefined) {
      user = setUserActive(id, is_active);
    }
    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
      }
      user = await resetPassword(id, password);
    }
    if (default_vehicle !== undefined) {
      user = setDefaultVehicle(id, default_vehicle);
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (cannot delete self)
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const result = deleteUser(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ success: true });
});

export default router;
