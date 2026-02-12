import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import config from '../config.js';

const SALT_ROUNDS = 10;

// Prepared statements
const stmts = {
  countUsers: db.prepare('SELECT COUNT(*) as count FROM users'),
  findByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  findById: db.prepare('SELECT id, username, display_name, role, is_active, default_vehicle, created_at, updated_at FROM users WHERE id = ?'),
  listAll: db.prepare('SELECT id, username, display_name, role, is_active, default_vehicle, created_at, updated_at FROM users ORDER BY id'),
  insert: db.prepare('INSERT INTO users (username, password, display_name, role, is_active, default_vehicle, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'),
  updateActive: db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?'),
  updateDefaultVehicle: db.prepare('UPDATE users SET default_vehicle = ?, updated_at = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
};

export function getUserCount() {
  return stmts.countUsers.get().count;
}

export async function createUser(username, password, displayName, role = 'user', defaultVehicle = null) {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date().toISOString();

  // First user auto-promoted to admin
  if (getUserCount() === 0) {
    role = 'admin';
  }

  const result = stmts.insert.run(username, hash, displayName || username, role, defaultVehicle, now);
  return stmts.findById.get(result.lastInsertRowid);
}

export async function authenticate(username, password) {
  const user = stmts.findByUsername.get(username);
  if (!user) return null;
  if (!user.is_active) return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  const { password: _, ...safeUser } = user;
  return safeUser;
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export function getUser(id) {
  return stmts.findById.get(id);
}

export function listUsers() {
  return stmts.listAll.all();
}

export function setUserActive(id, isActive) {
  const now = new Date().toISOString();
  stmts.updateActive.run(isActive ? 1 : 0, now, id);
  return stmts.findById.get(id);
}

export async function resetPassword(id, newPassword) {
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const now = new Date().toISOString();
  stmts.updatePassword.run(hash, now, id);
  return stmts.findById.get(id);
}

export function setDefaultVehicle(id, registration) {
  const now = new Date().toISOString();
  stmts.updateDefaultVehicle.run(registration || null, now, id);
  return stmts.findById.get(id);
}

export function deleteUser(id) {
  return stmts.deleteUser.run(id);
}
