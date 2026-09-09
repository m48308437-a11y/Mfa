const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_SECRET';

// Auth required middleware
const authRequired = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'احراز هویت لازم است' });
    }
    
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده است' });
  }
};

// Admin required middleware
const adminRequired = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'دسترسی مدیر لازم است' });
  }
  next();
};

// Moderator required middleware
const moderatorRequired = (req, res, next) => {
  if (!req.user || !['admin', 'moderator'].includes(req.user.role)) {
    return res.status(403).json({ error: 'دسترسی لازم نیست' });
  }
  next();
};

// Validation middleware
const validateAnime = (req, res, next) => {
  const { title, status, age_rating, type, season } = req.body;
  
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'عنوان فارسی الزامی است' });
  }
  
  const allowedStatus = ['در حال پخش', 'پایان یافته', 'به‌زودی', 'لغو شده'];
  if (status && !allowedStatus.includes(status)) {
    return res.status(400).json({ error: 'وضعیت نامعتبر است' });
  }
  
  const allowedAgeRating = ['G', 'PG', 'PG-13', 'R', '+18', ''];
  if (age_rating && !allowedAgeRating.includes(age_rating)) {
    return res.status(400).json({ error: 'رده سنی نامعتبر است' });
  }
  
  const allowedType = ['TV', 'Movie', 'OVA', 'ONA', 'Special', ''];
  if (type && !allowedType.includes(type)) {
    return res.status(400).json({ error: 'نوع انیمه نامعتبر است' });
  }
  
  const allowedSeason = ['winter', 'spring', 'summer', 'fall', ''];
  if (season && !allowedSeason.includes(season)) {
    return res.status(400).json({ error: 'فصل نامعتبر است' });
  }
  
  next();
};

const validateRegister = (req, res, next) => {
  const { username, password, email } = req.body;
  
  if (!username || String(username).trim().length < 3) {
    return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد' });
  }
  
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }
  
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'ایمیل نامعتبر است' });
  }
  
  next();
};

const validateComment = (req, res, next) => {
  const { text } = req.body;
  
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'متن نظر خالی است' });
  }
  
  if (String(text).trim().length < 2) {
    return res.status(400).json({ error: 'متن نظر خیلی کوتاه است' });
  }
  
  next();
};

module.exports = {
  authRequired,
  adminRequired,
  moderatorRequired,
  validateAnime,
  validateRegister,
  validateComment
};
