import { db } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { Studio } from './types';

export async function getStudioBySlug(slug: string): Promise<Studio | null> {
  const { data } = await db().from('studios').select('*').eq('slug', slug).maybeSingle();
  return (data as Studio) ?? null;
}

export async function getStudioById(id: string): Promise<Studio | null> {
  const { data } = await db().from('studios').select('*').eq('id', id).maybeSingle();
  return (data as Studio) ?? null;
}

export function studioSettings(studio: Studio) {
  return getSettings(studio.settings);
}

/** Publik adress till studions bokningssida. */
export function bookingBaseUrl(studio: Studio): string {
  if (studio.custom_domain) return `https://${studio.custom_domain}/s/${studio.slug}`;
  return `${env.appUrl}/s/${studio.slug}`;
}

export function manageUrl(studio: Studio, token: string): string {
  return `${bookingBaseUrl(studio)}/bokning/${token}`;
}

export function firstName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0];
}
