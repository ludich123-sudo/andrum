export type Studio = {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  org_nr: string | null;
  website: string | null;
  description: string | null;
  accent_color: string;
  logo_url: string | null;
  timezone: string;
  custom_domain: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  platform_fee_percent: number;
  settings: any;
  created_at: string;
};

export type ServiceKind = 'class' | 'course' | 'appointment';

export type Service = {
  id: string;
  studio_id: string;
  kind: ServiceKind;
  name: string;
  description: string | null;
  duration_min: number;
  price_ore: number;
  vat_rate: number;
  capacity: number;
  buffer_min: number;
  sessions_count: number;
  color: string | null;
  active: boolean;
  sort: number;
};

export type Series = {
  id: string;
  studio_id: string;
  service_id: string | null;
  name: string;
  description: string | null;
  price_ore: number;
  vat_rate: number;
  capacity: number;
  allow_late_join: boolean;
  status: 'active' | 'cancelled';
  created_at: string;
};

export type Session = {
  id: string;
  studio_id: string;
  service_id: string | null;
  series_id: string | null;
  kind: 'class' | 'course' | 'appointment' | 'block';
  title: string;
  starts_at: string;
  ends_at: string;
  blocked_until: string;
  capacity: number;
  price_ore: number;
  vat_rate: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
};

export type Customer = { id: string; studio_id: string; email: string; name: string | null; phone: string | null };

export type Booking = {
  id: string;
  studio_id: string;
  customer_id: string;
  kind: ServiceKind;
  session_id: string | null;
  series_id: string | null;
  title: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  price_ore: number;
  voucher_id: string | null;
  voucher_ore: number;
  amount_ore: number;
  vat_rate: number;
  paid_ore: number;
  refunded_ore: number;
  payment_method: string | null;
  manage_token: string;
  stripe_checkout_id: string | null;
  stripe_payment_intent: string | null;
  waitlist_id: string | null;
  source: 'online' | 'manual';
  note: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  customers?: Customer;
};

export type Waitlist = {
  id: string;
  studio_id: string;
  session_id: string | null;
  series_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  status: 'waiting' | 'offered' | 'claimed' | 'expired' | 'cancelled';
  token: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
};

export const KIND_LABEL: Record<string, string> = {
  class: 'Drop-in-pass',
  course: 'Kurs',
  appointment: 'Behandling',
  block: 'Blockerad tid',
};
