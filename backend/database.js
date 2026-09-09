const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Initialize database schema
async function initDatabase() {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        bio TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
        preferences JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Studios table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS studios (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        country TEXT DEFAULT '',
        founded_year INTEGER,
        description TEXT DEFAULT '',
        logo TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Genres table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS genres (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Anime table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anime (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        jp_title TEXT DEFAULT '',
        en_title TEXT DEFAULT '',
        synopsis TEXT DEFAULT '',
        poster TEXT DEFAULT '',
        cover TEXT DEFAULT '',
        year INTEGER,
        season TEXT CHECK (season IN ('winter', 'spring', 'summer', 'fall', '')),
        status TEXT DEFAULT 'در حال پخش' CHECK (status IN ('در حال پخش', 'پایان یافته', 'به‌زودی', 'لغو شده')),
        type TEXT DEFAULT 'TV' CHECK (type IN ('TV', 'Movie', 'OVA', 'ONA', 'Special', '')),
        episodes INTEGER DEFAULT 0,
        duration INTEGER DEFAULT 0,
        score NUMERIC(3,1) DEFAULT 0,
        age_rating TEXT DEFAULT '' CHECK (age_rating IN ('G', 'PG', 'PG-13', 'R', '+18', '')),
        studio_id INTEGER REFERENCES studios(id) ON DELETE SET NULL,
        country TEXT DEFAULT '',
        source_material TEXT DEFAULT '',
        official_site TEXT DEFAULT '',
        mal_id INTEGER,
        is_featured BOOLEAN DEFAULT false,
        is_trending BOOLEAN DEFAULT false,
        view_count INTEGER DEFAULT 0,
        published_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Anime-Genres relation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anime_genres (
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        genre_id INTEGER REFERENCES genres(id) ON DELETE CASCADE,
        PRIMARY KEY (anime_id, genre_id)
      )
    `);

    // Anime-Tags relation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anime_tags (
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (anime_id, tag_id)
      )
    `);

    // Characters table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        jp_name TEXT DEFAULT '',
        description TEXT DEFAULT '',
        image TEXT DEFAULT '',
        role TEXT DEFAULT 'supporting' CHECK (role IN ('main', 'supporting', 'background')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Anime-Characters relation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anime_characters (
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        voice_actor TEXT DEFAULT '',
        PRIMARY KEY (anime_id, character_id)
      )
    `);

    // Related anime
    await pool.query(`
      CREATE TABLE IF NOT EXISTS related_anime (
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        related_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        relation_type TEXT DEFAULT 'sequel' CHECK (relation_type IN ('sequel', 'prequel', 'side_story', 'alternative', 'summary', 'other')),
        PRIMARY KEY (anime_id, related_id)
      )
    `);

    // Favorites
    await pool.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, anime_id)
      )
    `);

    // Watchlist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'planning' CHECK (status IN ('watching', 'completed', 'planning', 'dropped', 'on_hold')),
        progress INTEGER DEFAULT 0,
        rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 10),
        notes TEXT DEFAULT '',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, anime_id)
      )
    `);

    // Ratings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        score NUMERIC(2,1) NOT NULL CHECK (score >= 0 AND score <= 10),
        review TEXT DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, anime_id)
      )
    `);

    // Comments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Comment likes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_likes (
        comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (comment_id, user_id)
      )
    `);

    // Activity log
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details JSONB DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Featured anime
    await pool.query(`
      CREATE TABLE IF NOT EXISTS featured_anime (
        id SERIAL PRIMARY KEY,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        type TEXT DEFAULT 'hero' CHECK (type IN ('hero', 'trending', 'recommended', 'editor_choice')),
        title TEXT DEFAULT '',
        subtitle TEXT DEFAULT '',
        is_active BOOLEAN DEFAULT true,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // SEO meta
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seo_meta (
        id SERIAL PRIMARY KEY,
        page TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        keywords TEXT DEFAULT '',
        og_image TEXT DEFAULT '',
        canonical_url TEXT DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Anime versions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anime_versions (
        id SERIAL PRIMARY KEY,
        anime_id INTEGER REFERENCES anime(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        changes JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_anime_title ON anime(title);
      CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(year);
      CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status);
      CREATE INDEX IF NOT EXISTS idx_anime_score ON anime(score DESC);
      CREATE INDEX IF NOT EXISTS idx_anime_created ON anime(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_comments_anime ON comments(anime_id);
      CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
      CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
    `);

    // Create default admin
    const admin = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (admin.rowCount === 0) {
      const bcrypt = require('bcryptjs');
      const password = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')`,
        ['admin', password]
      );
      console.log('✅ Default admin created (username: admin, password: admin123)');
    }

    // Create demo user
    const demoUser = await pool.query('SELECT id FROM users WHERE username = $1', ['mfauser']);
    if (demoUser.rowCount === 0) {
      const bcrypt = require('bcryptjs');
      const password = await bcrypt.hash('user123', 10);
      await pool.query(
        `INSERT INTO users (username, password, role) VALUES ($1, $2, 'user')`,
        ['mfauser', password]
      );
      console.log('✅ Demo user created (username: mfauser, password: user123)');
    }

    console.log('✅ Database schema initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initDatabase
};
