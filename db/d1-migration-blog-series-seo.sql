-- Migration: Add series, SEO, and reading_time columns to blog_posts
-- Run via: wrangler d1 execute gfd_community --remote --file=d1-migration-blog-series-seo.sql
-- Safe to run multiple times (uses ALTER TABLE IF NOT EXISTS pattern — D1/SQLite allows duplicate-safe ADD COLUMN)

ALTER TABLE blog_posts ADD COLUMN series TEXT;
ALTER TABLE blog_posts ADD COLUMN seo_description TEXT;
ALTER TABLE blog_posts ADD COLUMN seo_og_image TEXT;
ALTER TABLE blog_posts ADD COLUMN reading_time INTEGER;

-- Optional index: group/filter posts by series
CREATE INDEX IF NOT EXISTS idx_blog_posts_series ON blog_posts(series);
