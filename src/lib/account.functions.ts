import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getAccount = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase.from('profiles').select('display_name, avatar').eq('id', context.userId).single();
    if (error) throw new Error('Could not load your profile');
    const { data: preset } = await context.supabase.from('preset_filters').select('settings').eq('user_id', context.userId).maybeSingle();
    return { profile, settings: preset?.settings ?? null };
  });

export const saveAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ display_name: z.string().trim().min(1).max(24), avatar: z.string().min(1).max(8) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('profiles').update(data).eq('id', context.userId);
    if (error) throw new Error('Could not save your profile');
    return { ok: true };
  });