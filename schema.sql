PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  compare_price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  salt TEXT,
  password_hash TEXT,
  provider TEXT NOT NULL DEFAULT 'email',
  picture TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  shipping REAL NOT NULL,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

INSERT OR IGNORE INTO products (id, name, category, description, price, compare_price, stock, image, badge, featured) VALUES
('rr-kundan-01', 'Rajwada Kundan Rakhi', 'Kundan', 'A regal kundan centrepiece framed with fine pearls and tied with a soft crimson thread.', 699, 899, 18, '/assets/rakhi-kundan.jpg', 'Bestseller', 1),
('rr-peacock-02', 'Mor Meenakari Rakhi', 'Meenakari', 'A jewel-toned peacock motif, hand-finished in classic meenakari colours.', 549, 699, 12, '/assets/rakhi-peacock.jpg', 'Artisan-made', 1),
('rr-pair-03', 'Saanjh Bhaiya–Bhabhi Pair', 'Bhaiya–Bhabhi', 'An elegant rakhi and lumba pair with garnet beads, pearls and festive tassels.', 999, 1299, 8, '/assets/rakhi-bhaiya-bhabhi.jpg', 'Limited', 1),
('rr-kids-04', 'Nanhe Maharaj Kids Rakhi', 'Kids', 'A joyful little elephant rakhi, light on the wrist and made for little brothers.', 349, 449, 25, '/assets/rakhi-kids.jpg', 'Kids’ favourite', 1),
('rr-kundan-05', 'Noor Pearl Rakhi', 'Pearl', 'A graceful strand of ivory pearls with a floral kundan medallion.', 449, 599, 16, '/assets/rakhi-kundan.jpg', 'New', 0),
('rr-peacock-06', 'Neelkanth Heritage Rakhi', 'Meenakari', 'A vivid heritage rakhi in teal and antique gold, inspired by palace frescoes.', 749, 949, 10, '/assets/rakhi-peacock.jpg', 'New', 0),
('rr-pair-07', 'Gulnaar Couple Set', 'Bhaiya–Bhabhi', 'A warm, celebratory duo with ruby tones, antique gold and playful tassels.', 1199, 1499, 6, '/assets/rakhi-bhaiya-bhabhi.jpg', 'Gift-ready', 0),
('rr-kids-08', 'Haathi Saathi Rakhi', 'Kids', 'A bright, friendly elephant motif on a soft, skin-friendly cotton thread.', 299, 399, 30, '/assets/rakhi-kids.jpg', 'Playful', 0);
