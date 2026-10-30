-- Public avatar reads let guests see participants. Writes go through authenticated
-- account server functions; no browser INSERT/UPDATE/DELETE policies are granted.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos', 'profile-photos', true, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
