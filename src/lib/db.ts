import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** Databasklient med full behörighet. Används bara på servern. */
export function db(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      throw new Error('Supabase är inte konfigurerat (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }
    client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Kastar ett läsbart fel om Supabase svarar med fel. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what = 'Databasfel'): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function getConfig(key: string): Promise<string | null> {
  const { data } = await db().from('app_config').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

export async function setConfig(key: string, value: string) {
  must(
    await db().from('app_config').upsert({ key, value, updated_at: new Date().toISOString() }),
    'Kunde inte spara inställning',
  );
}

export async function audit(studioId: string | null, actor: string | null, action: string, details?: unknown) {
  await db().from('audit_log').insert({ studio_id: studioId, actor, action, details: details ?? null });
}
