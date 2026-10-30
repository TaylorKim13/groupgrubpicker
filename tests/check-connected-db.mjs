import { createClient } from '@supabase/supabase-js';

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
for (const table of ['rooms', 'profiles', 'preset_filters', 'friendships', 'crews', 'room_filter_usage', 'room_selection_usage', 'group_creation_usage']) {
  const { error, status } = await client.from(table).select('*').limit(0);
  console.log(table, status, error ? JSON.stringify({ code: error.code, message: error.message }) : 'available');
}
const { data, error } = await client.storage.getBucket('profile-photos');
console.log('profile-photos', error ? error.message : JSON.stringify({ public: data.public, file_size_limit: data.file_size_limit, allowed_mime_types: data.allowed_mime_types }));
