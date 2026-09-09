const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// ==================== AUTH CONTROLLER ====================
const AuthController = {
  register: async (req, res) => {
    try {
      const { username, password, email } = req.body;
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '');

      if (!cleanUsername || cleanUsername.length < 3) {
        return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد' });
      }

      if (cleanPassword.length < 6) {
        return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'ایمیل نامعتبر است' });
      }

      const exists = await db.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [cleanUsername, email || '']
      );
      if (exists.rowCount > 0) {
        return res.status(409).json({ error: 'این نام کاربری یا ایمیل قبلاً ثبت شده است' });
      }

      const hashedPassword = await bcrypt.hash(cleanPassword, 10);

      const result = await db.query(
        `INSERT INTO users (username, email, password, role)
         VALUES ($1, $2, $3, 'user')
         RETURNING id, username, email, role, created_at`,
        [cleanUsername, email || null, hashedPassword]
      );

      const user = result.rows[0];

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      await db.query(
        `INSERT INTO activity_log (user_id, action, target_type, details, ip_address, user_agent)
         VALUES ($1, 'register', 'user', $2, $3, $4)`,
        [user.id, { username: user.username }, req.ip, req.get('user-agent')]
      );

      res.status(201).json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'خطا در ثبت‌نام' });
    }
  },

  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '');

      if (!cleanUsername || !cleanPassword) {
        return res.status(400).json({ error: 'نام کاربری و رمز عبور را وارد کنید' });
      }

      const result = await db.query('SELECT * FROM users WHERE username = $1', [cleanUsername]);

      if (result.rowCount === 0) {
        return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      }

      const user = result.rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'حساب کاربری شما غیرفعال است' });
      }

      const valid = await bcrypt.compare(cleanPassword, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      }

      await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      await db.query(
        `INSERT INTO activity_log (user_id, action, target_type, details, ip_address, user_agent)
         VALUES ($1, 'login', 'user', $2, $3, $4)`,
        [user.id, { username: user.username }, req.ip, req.get('user-agent')]
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          bio: user.bio
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'خطا در ورود' });
    }
  },

  me: async (req, res) => {
    try {
      const result = await db.query(
        `SELECT id, username, email, avatar, bio, role, preferences, created_at, last_login
         FROM users WHERE id = $1`,
        [req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'کاربر پیدا نشد' });
      }

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'خطا در دریافت اطلاعات' });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { avatar, bio, email, preferences } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (avatar !== undefined) { updates.push(`avatar = $${paramCount++}`); values.push(avatar); }
      if (bio !== undefined) { updates.push(`bio = $${paramCount++}`); values.push(bio); }
      if (email !== undefined) { updates.push(`email = $${paramCount++}`); values.push(email); }
      if (preferences !== undefined) { updates.push(`preferences = $${paramCount++}`); values.push(JSON.stringify(preferences)); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'هیچ فیلدی برای بروزرسانی ارسال نشده' });
      }

      values.push(req.user.id);
      const result = await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
         RETURNING id, username, email, avatar, bio, role, preferences`,
        values
      );

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'خطا در بروزرسانی پروفایل' });
    }
  },

  logout: async (req, res) => {
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, action, target_type, ip_address, user_agent)
         VALUES ($1, 'logout', 'user', $2, $3)`,
        [req.user.id, req.ip, req.get('user-agent')]
      );
      res.json({ success: true });
    } catch (error) {
      res.json({ success: true });
    }
  }
};

// ==================== ANIME CONTROLLER ====================
const AnimeController = {
  list: async (req, res) => {
    try {
      const { q, genre, status, country, year, season, type, minScore, sort, page = 1, limit = 20 } = req.query;

      const values = [];
      const conditions = [];

      if (q) {
        values.push(`%${q}%`);
        conditions.push(`(a.title ILIKE $${values.length} OR a.jp_title ILIKE $${values.length} OR a.en_title ILIKE $${values.length})`);
      }

      if (genre) {
        values.push(`%${genre}%`);
        conditions.push(`EXISTS (SELECT 1 FROM anime_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.anime_id = a.id AND g.name ILIKE $${values.length})`);
      }

      if (status) { values.push(status); conditions.push(`a.status = $${values.length}`); }
      if (country) { values.push(`%${country}%`); conditions.push(`a.country ILIKE $${values.length}`); }
      if (year) { values.push(year); conditions.push(`a.year = $${values.length}`); }
      if (season) { values.push(season); conditions.push(`a.season = $${values.length}`); }
      if (type) { values.push(type); conditions.push(`a.type = $${values.length}`); }
      if (minScore !== null && Number.isFinite(Number(minScore))) { values.push(Number(minScore)); conditions.push(`a.score >= $${values.length}`); }

      let sql = `
        SELECT a.*, s.name as studio_name,
        COALESCE(json_agg(DISTINCT g.name) FILTER (WHERE g.name IS NOT NULL), '[]') as genres
        FROM anime a
        LEFT JOIN studios s ON s.id = a.studio_id
        LEFT JOIN anime_genres ag ON ag.anime_id = a.id
        LEFT JOIN genres g ON g.id = ag.genre_id
      `;

      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' GROUP BY a.id, s.name';

      if (sort === 'score') sql += ' ORDER BY a.score DESC, a.id DESC';
      else if (sort === 'alpha') sql += ' ORDER BY a.title ASC';
      else if (sort === 'popular') sql += ' ORDER BY a.view_count DESC, a.id DESC';
      else sql += ' ORDER BY a.created_at DESC';

      const offset = (page - 1) * limit;
      values.push(Number(limit), offset);
      sql += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

      const result = await db.query(sql, values);

      let countSql = 'SELECT COUNT(DISTINCT a.id) FROM anime a';
      if (conditions.length) countSql += ' WHERE ' + conditions.join(' AND ');
      const countResult = await db.query(countSql, values.slice(0, -2));
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: result.rows,
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      console.error('Anime list error:', error);
      res.status(500).json({ error: 'خطا در دریافت انیمه‌ها' });
    }
  },

  detail: async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      const result = await db.query(`
        SELECT a.*, s.name as studio_name, s.country as studio_country,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', g.id, 'name', g.name)) FILTER (WHERE g.id IS NOT NULL), '[]') as genres,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') as tags
        FROM anime a
        LEFT JOIN studios s ON s.id = a.studio_id
        LEFT JOIN anime_genres ag ON ag.anime_id = a.id
        LEFT JOIN genres g ON g.id = ag.genre_id
        LEFT JOIN anime_tags at ON at.anime_id = a.id
        LEFT JOIN tags t ON t.id = at.tag_id
        WHERE a.id = $1
        GROUP BY a.id, s.name, s.country
      `, [id]);

      if (result.rows.length === 0) return res.status(404).json({ error: 'انیمه پیدا نشد' });

      const anime = result.rows[0];

      const charactersResult = await db.query(`
        SELECT c.*, ac.voice_actor, ac.role
        FROM characters c
        JOIN anime_characters ac ON ac.character_id = c.id
        WHERE ac.anime_id = $1
        ORDER BY ac.role DESC, c.name ASC
      `, [id]);
      anime.characters = charactersResult.rows;

      const relatedResult = await db.query(`
        SELECT a.id, a.title, a.poster, a.score, ra.relation_type
        FROM related_anime ra
        JOIN anime a ON a.id = ra.related_id
        WHERE ra.anime_id = $1
        ORDER BY a.score DESC
      `, [id]);
      anime.related = relatedResult.rows;

      await db.query('UPDATE anime SET view_count = view_count + 1 WHERE id = $1', [id]);

      const commentsResult = await db.query(`
        SELECT c.id, c.text, c.created_at, c.user_id, u.username, u.avatar, COUNT(r.id) AS likes
        FROM comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN comment_likes r ON r.comment_id = c.id
        WHERE c.anime_id = $1 AND c.status = 'approved' AND c.parent_id IS NULL
        GROUP BY c.id, u.id, u.username, u.avatar
        ORDER BY c.created_at DESC
      `, [id]);

      let userStatus = null;
      if (req.user) {
        const [favRes, watchRes, rateRes] = await Promise.all([
          db.query('SELECT 1 FROM favorites WHERE user_id = $1 AND anime_id = $2', [req.user.id, id]),
          db.query('SELECT * FROM watchlist WHERE user_id = $1 AND anime_id = $2', [req.user.id, id]),
          db.query('SELECT score FROM ratings WHERE user_id = $1 AND anime_id = $2', [req.user.id, id])
        ]);
        userStatus = {
          isFavorite: favRes.rowCount > 0,
          watchlist: watchRes.rows[0] || null,
          userRating: rateRes.rows[0]?.score || null
        };
      }

      res.json({ success: true, anime, comments: commentsResult.rows, userStatus });
    } catch (error) {
      console.error('Anime detail error:', error);
      res.status(500).json({ error: 'خطا در دریافت اطلاعات' });
    }
  },

  create: async (req, res) => {
    try {
      const { title, jp_title = '', en_title = '', synopsis = '', poster = '', cover = '', year, season = '', status = 'در حال پخش', type = 'TV', episodes = 0, duration = 0, score = 0, age_rating = '', studio_id = null, country = '', genres = [], tags = [] } = req.body;

      const result = await db.query(`
        INSERT INTO anime (title, jp_title, en_title, synopsis, poster, cover, year, season, status, type, episodes, duration, score, age_rating, studio_id, country)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *
      `, [title, jp_title, en_title, synopsis, poster, cover, year, season, status, type, episodes, duration, score, age_rating, studio_id, country]);

      const anime = result.rows[0];

      if (genres.length > 0) {
        for (const genreName of genres) {
          await db.query(`INSERT INTO anime_genres (anime_id, genre_id) SELECT $1, id FROM genres WHERE name = $2 ON CONFLICT DO NOTHING`, [anime.id, genreName]);
        }
      }

      if (tags.length > 0) {
        for (const tagName of tags) {
          await db.query(`INSERT INTO anime_tags (anime_id, tag_id) SELECT $1, id FROM tags WHERE name = $2 ON CONFLICT DO NOTHING`, [anime.id, tagName]);
        }
      }

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id, details) VALUES ($1, 'create_anime', 'anime', $2, $3)`, [req.user.id, anime.id, { title: anime.title }]);

      res.status(201).json({ success: true, anime });
    } catch (error) {
      console.error('Create anime error:', error);
      res.status(500).json({ error: 'خطا در افزودن انیمه' });
    }
  },

  update: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const oldAnime = await db.query('SELECT * FROM anime WHERE id = $1', [id]);
      if (oldAnime.rowCount === 0) return res.status(404).json({ error: 'انیمه پیدا نشد' });

      const fields = [];
      const values = [];
      let paramCount = 1;
      const allowedFields = ['title', 'jp_title', 'en_title', 'synopsis', 'poster', 'cover', 'year', 'season', 'status', 'type', 'episodes', 'duration', 'score', 'age_rating', 'studio_id', 'country', 'is_featured', 'is_trending'];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          fields.push(`${field} = $${paramCount}`);
          values.push(req.body[field]);
          paramCount++;
        }
      }

      if (fields.length === 0) return res.json({ success: true, anime: oldAnime.rows[0] });

      values.push(id);
      const result = await db.query(`UPDATE anime SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`, values);

      if (req.body.genres !== undefined) {
        await db.query('DELETE FROM anime_genres WHERE anime_id = $1', [id]);
        for (const genreName of req.body.genres) {
          await db.query(`INSERT INTO anime_genres (anime_id, genre_id) SELECT $1, id FROM genres WHERE name = $2 ON CONFLICT DO NOTHING`, [id, genreName]);
        }
      }

      res.json({ success: true, anime: result.rows[0] });
    } catch (error) {
      console.error('Update anime error:', error);
      res.status(500).json({ error: 'خطا در ویرایش انیمه' });
    }
  },

  delete: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await db.query('DELETE FROM anime WHERE id = $1 RETURNING id', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'انیمه پیدا نشد' });

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id) VALUES ($1, 'delete_anime', 'anime', $2)`, [req.user.id, id]);

      res.json({ success: true });
    } catch (error) {
      console.error('Delete anime error:', error);
      res.status(500).json({ error: 'خطا در حذف انیمه' });
    }
  },

  featured: async (req, res) => {
    try {
      const type = req.query.type || 'hero';
      const result = await db.query(`
        SELECT a.*, fa.position, fa.title as featured_title, fa.subtitle
        FROM featured_anime fa
        JOIN anime a ON a.id = fa.anime_id
        WHERE fa.type = $1 AND fa.is_active = true
        ORDER BY fa.position ASC
      `, [type]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Featured error:', error);
      res.status(500).json({ error: 'خطا در دریافت انیمه‌های ویژه' });
    }
  },

  trending: async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const result = await db.query(`SELECT * FROM anime WHERE is_trending = true ORDER BY view_count DESC, score DESC LIMIT $1`, [limit]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Trending error:', error);
      res.status(500).json({ error: 'خطا در دریافت ترندها' });
    }
  },

  toggleFavorite: async (req, res) => {
    try {
      const animeId = Number(req.params.id);
      const userId = req.user.id;

      const existing = await db.query('SELECT 1 FROM favorites WHERE user_id = $1 AND anime_id = $2', [userId, animeId]);

      let isFavorite;
      if (existing.rowCount > 0) {
        await db.query('DELETE FROM favorites WHERE user_id = $1 AND anime_id = $2', [userId, animeId]);
        isFavorite = false;
      } else {
        await db.query('INSERT INTO favorites (user_id, anime_id) VALUES ($1, $2)', [userId, animeId]);
        isFavorite = true;
      }

      res.json({ success: true, isFavorite });
    } catch (error) {
      console.error('Toggle favorite error:', error);
      res.status(500).json({ error: 'خطا در تغییر علاقه‌مندی' });
    }
  },

  getFavorites: async (req, res) => {
    try {
      const result = await db.query(`SELECT a.*, f.created_at as favorited_at FROM favorites f JOIN anime a ON a.id = f.anime_id WHERE f.user_id = $1 ORDER BY f.created_at DESC`, [req.user.id]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Get favorites error:', error);
      res.status(500).json({ error: 'خطا در دریافت علاقه‌مندی‌ها' });
    }
  },

  updateWatchlist: async (req, res) => {
    try {
      const animeId = Number(req.params.id);
      const { status, progress, rating, notes } = req.body;
      const userId = req.user.id;

      const result = await db.query(`
        INSERT INTO watchlist (user_id, anime_id, status, progress, rating, notes, started_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, anime_id)
        DO UPDATE SET status = EXCLUDED.status, progress = EXCLUDED.progress, rating = EXCLUDED.rating, notes = EXCLUDED.notes, updated_at = NOW()
        RETURNING *
      `, [userId, animeId, status || 'planning', progress || 0, rating || null, notes || '']);

      res.json({ success: true, watchlist: result.rows[0] });
    } catch (error) {
      console.error('Update watchlist error:', error);
      res.status(500).json({ error: 'خطا در بروزرسانی لیست تماشا' });
    }
  },

  getWatchlist: async (req, res) => {
    try {
      const status = req.query.status;
      let sql = `SELECT w.*, a.title, a.poster, a.score, a.episodes FROM watchlist w JOIN anime a ON a.id = w.anime_id WHERE w.user_id = $1`;
      const values = [req.user.id];

      if (status) { sql += ' AND w.status = $2'; values.push(status); }
      sql += ' ORDER BY w.updated_at DESC';

      const result = await db.query(sql, values);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Get watchlist error:', error);
      res.status(500).json({ error: 'خطا در دریافت لیست تماشا' });
    }
  },

  rate: async (req, res) => {
    try {
      const animeId = Number(req.params.id);
      const { score, review } = req.body;

      if (score === undefined || score < 0 || score > 10) {
        return res.status(400).json({ error: 'امتیاز باید بین ۰ تا ۱۰ باشد' });
      }

      const result = await db.query(`
        INSERT INTO ratings (user_id, anime_id, score, review)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, anime_id)
        DO UPDATE SET score = EXCLUDED.score, review = EXCLUDED.review, updated_at = NOW()
        RETURNING *
      `, [req.user.id, animeId, score, review || '']);

      const avgResult = await db.query('SELECT AVG(score) as avg_score FROM ratings WHERE anime_id = $1', [animeId]);
      const avgScore = Number(avgResult.rows[0].avg_score || 0).toFixed(1);

      await db.query('UPDATE anime SET score = $1 WHERE id = $2', [avgScore, animeId]);

      res.json({ success: true, rating: result.rows[0], newAverage: avgScore });
    } catch (error) {
      console.error('Rate error:', error);
      res.status(500).json({ error: 'خطا در ثبت امتیاز' });
    }
  }
};

// ==================== COMMENT CONTROLLER ====================
const CommentController = {
  create: async (req, res) => {
    try {
      const animeId = Number(req.params.id);
      const { text, parent_id } = req.body;
      const cleanText = String(text || '').trim();

      if (!cleanText) return res.status(400).json({ error: 'متن نظر خالی است' });

      const anime = await db.query('SELECT id FROM anime WHERE id = $1', [animeId]);
      if (anime.rowCount === 0) return res.status(404).json({ error: 'انیمه پیدا نشد' });

      const result = await db.query(`INSERT INTO comments (anime_id, user_id, parent_id, text, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id, text, status, created_at`, [animeId, req.user.id, parent_id || null, cleanText]);

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id, details) VALUES ($1, 'create_comment', 'comment', $2, $3)`, [req.user.id, result.rows[0].id, { anime_id: animeId }]);

      res.status(201).json({ success: true, message: 'نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود', comment: result.rows[0] });
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({ error: 'خطا در ثبت نظر' });
    }
  },

  getByAnime: async (req, res) => {
    try {
      const animeId = Number(req.params.id);
      const result = await db.query(`
        SELECT c.id, c.text, c.created_at, c.user_id, c.parent_id, u.username, u.avatar, COALESCE(l.likes_count, 0) as likes
        FROM comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN (SELECT comment_id, COUNT(*) as likes_count FROM comment_likes GROUP BY comment_id) l ON l.comment_id = c.id
        WHERE c.anime_id = $1 AND c.status = 'approved'
        ORDER BY c.created_at DESC
      `, [animeId]);

      const comments = result.rows;
      const tree = [];
      const map = {};

      for (const comment of comments) {
        map[comment.id] = { ...comment, replies: [] };
      }

      for (const comment of comments) {
        if (comment.parent_id && map[comment.parent_id]) {
          map[comment.parent_id].replies.push(map[comment.id]);
        } else {
          tree.push(map[comment.id]);
        }
      }

      res.json({ success: true, comments: tree });
    } catch (error) {
      console.error('Get comments error:', error);
      res.status(500).json({ error: 'خطا در دریافت نظرات' });
    }
  },

  getPending: async (req, res) => {
    try {
      const result = await db.query(`
        SELECT c.id, c.text, c.status, c.created_at, c.parent_id, u.username, u.avatar, a.title as anime_title, a.id as anime_id
        FROM comments c
        JOIN users u ON u.id = c.user_id
        JOIN anime a ON a.id = c.anime_id
        WHERE c.status = 'pending'
        ORDER BY c.created_at DESC
      `);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Get pending comments error:', error);
      res.status(500).json({ error: 'خطا در دریافت نظرات' });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'وضعیت نامعتبر است' });
      }

      const result = await db.query(`UPDATE comments SET status = $1 WHERE id = $2 RETURNING id, status`, [status, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'نظر پیدا نشد' });

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id, details) VALUES ($1, 'update_comment_status', 'comment', $2, $3)`, [req.user.id, id, { status }]);

      res.json({ success: true, comment: result.rows[0] });
    } catch (error) {
      console.error('Update comment status error:', error);
      res.status(500).json({ error: 'خطا در تغییر وضعیت' });
    }
  },

  delete: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = await db.query('DELETE FROM comments WHERE id = $1 RETURNING id', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'نظر پیدا نشد' });

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id) VALUES ($1, 'delete_comment', 'comment', $2)`, [req.user.id, id]);

      res.json({ success: true });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({ error: 'خطا در حذف نظر' });
    }
  },

  toggleLike: async (req, res) => {
    try {
      const commentId = Number(req.params.id);
      const userId = req.user.id;

      const existing = await db.query('SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);

      let liked;
      if (existing.rowCount > 0) {
        await db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
        liked = false;
      } else {
        await db.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)', [commentId, userId]);
        liked = true;
      }

      const countResult = await db.query('SELECT COUNT(*) FROM comment_likes WHERE comment_id = $1', [commentId]);

      res.json({ success: true, liked, likes: Number(countResult.rows[0].count) });
    } catch (error) {
      console.error('Toggle like error:', error);
      res.status(500).json({ error: 'خطا در تغییر لایک' });
    }
  }
};

// ==================== ADMIN CONTROLLER ====================
const AdminController = {
  getStats: async (req, res) => {
    try {
      const [animeCount, usersCount, pendingComments, activeUsers, totalViews] = await Promise.all([
        db.query('SELECT COUNT(*) FROM anime'),
        db.query('SELECT COUNT(*) FROM users'),
        db.query("SELECT COUNT(*) FROM comments WHERE status = 'pending'"),
        db.query('SELECT COUNT(DISTINCT user_id) FROM activity_log WHERE created_at > NOW() - INTERVAL \'7 days\''),
        db.query('SELECT COALESCE(SUM(view_count), 0) FROM anime')
      ]);

      res.json({
        success: true,
        stats: {
          animeCount: Number(animeCount.rows[0].count),
          usersCount: Number(usersCount.rows[0].count),
          pendingComments: Number(pendingComments.rows[0].count),
          activeUsers: Number(activeUsers.rows[0].count),
          totalViews: Number(totalViews.rows[0].coalesce)
        }
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'خطا در دریافت آمار' });
    }
  },

  getUsers: async (req, res) => {
    try {
      const { q, role, page = 1, limit = 20 } = req.query;
      const values = [];
      const conditions = [];

      if (q) { values.push(`%${q}%`); conditions.push(`username ILIKE $${values.length}`); }
      if (role) { values.push(role); conditions.push(`role = $${values.length}`); }

      let sql = 'SELECT id, username, email, role, avatar, is_active, last_login, created_at FROM users';
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY created_at DESC';

      const offset = (page - 1) * limit;
      values.push(limit, offset);
      sql += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

      const result = await db.query(sql, values);

      let countSql = 'SELECT COUNT(*) FROM users';
      if (conditions.length) countSql += ' WHERE ' + conditions.join(' AND ');
      const countResult = await db.query(countSql, values.slice(0, -2));

      res.json({
        success: true,
        data: result.rows,
        pagination: { page: Number(page), limit: Number(limit), total: Number(countResult.rows[0].count), totalPages: Math.ceil(Number(countResult.rows[0].count) / limit) }
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'خطا در دریافت کاربران' });
    }
  },

  updateUserRole: async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { role } = req.body;

      if (!['user', 'admin', 'moderator'].includes(role)) {
        return res.status(400).json({ error: 'نقش نامعتبر است' });
      }

      if (Number(req.user.id) === id && role !== 'admin') {
        return res.status(400).json({ error: 'نمی‌توانید ادمینی خود را حذف کنید' });
      }

      const result = await db.query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role`, [role, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'کاربر پیدا نشد' });

      await db.query(`INSERT INTO activity_log (user_id, action, target_type, target_id, details) VALUES ($1, 'update_user_role', 'user', $2, $3)`, [req.user.id, id, { role }]);

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'خطا در تغییر نقش' });
    }
  },

  getActivityLog: async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const result = await db.query(`
        SELECT al.*, u.username
        FROM activity_log al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Get activity log error:', error);
      res.status(500).json({ error: 'خطا در دریافت لاگ فعالیت' });
    }
  }
};

module.exports = { AuthController, AnimeController, CommentController, AdminController };
