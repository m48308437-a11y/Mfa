const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./database');
const { authRequired, adminRequired, validateAnime, validateRegister, validateComment } = require('./middleware');
const { AuthController, AnimeController, CommentController, AdminController } = require('./controllers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, database: 'postgresql', status: 'ok' });
  } catch (error) {
    res.status(500).json({ success: false, database: 'postgresql', status: 'error' });
  }
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', validateRegister, AuthController.register);
app.post('/api/auth/login', AuthController.login);
app.get('/api/auth/me', authRequired, AuthController.me);
app.patch('/api/auth/profile', authRequired, AuthController.updateProfile);
app.post('/api/auth/logout', authRequired, AuthController.logout);

// ==================== ANIME ROUTES ====================
app.get('/api/anime', AnimeController.list);
app.get('/api/anime/featured', AnimeController.featured);
app.get('/api/anime/trending', AnimeController.trending);
app.get('/api/anime/user/favorites', authRequired, AnimeController.getFavorites);
app.get('/api/anime/user/watchlist', authRequired, AnimeController.getWatchlist);
app.get('/api/anime/:id', AnimeController.detail);
app.post('/api/anime', authRequired, adminRequired, validateAnime, AnimeController.create);
app.put('/api/anime/:id', authRequired, adminRequired, validateAnime, AnimeController.update);
app.delete('/api/anime/:id', authRequired, adminRequired, AnimeController.delete);
app.post('/api/anime/:id/favorite', authRequired, AnimeController.toggleFavorite);
app.post('/api/anime/:id/watchlist', authRequired, AnimeController.updateWatchlist);
app.post('/api/anime/:id/rate', authRequired, AnimeController.rate);

// ==================== COMMENT ROUTES ====================
app.get('/api/comments/anime/:id', CommentController.getByAnime);
app.get('/api/comments/pending', authRequired, adminRequired, CommentController.getPending);
app.post('/api/comments/anime/:id', authRequired, validateComment, CommentController.create);
app.post('/api/comments/:id/like', authRequired, CommentController.toggleLike);
app.patch('/api/comments/:id/status', authRequired, adminRequired, CommentController.updateStatus);
app.delete('/api/comments/:id', authRequired, adminRequired, CommentController.delete);

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/stats', authRequired, adminRequired, AdminController.getStats);
app.get('/api/admin/users', authRequired, adminRequired, AdminController.getUsers);
app.patch('/api/admin/users/:id/role', authRequired, adminRequired, AdminController.updateUserRole);
app.get('/api/admin/activity-log', authRequired, adminRequired, AdminController.getActivityLog);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
async function startServer() {
  try {
    await db.initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MIFA server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
