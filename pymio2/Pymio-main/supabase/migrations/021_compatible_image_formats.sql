BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES
  ('product-images','product-images',true,512000,ARRAY['image/webp','image/png','image/jpeg']),
  ('profile-images','profile-images',true,512000,ARRAY['image/webp','image/png','image/jpeg']),
  ('community-profile-images','community-profile-images',false,524288,ARRAY['image/webp','image/png','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

COMMIT;
