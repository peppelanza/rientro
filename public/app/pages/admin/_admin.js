// Base for admin pages (design 06): checks the role, loads the sidebar counts, then loadAdmin().
import { api, getMe, go } from '../../lib.js';
import { Page } from '../_base.js';

export const STATUS_KIND = { approved: 'success', in_review: 'neutral', changes_requested: 'explore', onboarding: 'neutral', rejected: 'neutral', suspended: 'neutral' };
export const initials = n => (n || '?').split(/[ @.]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export class AdminPage extends Page {
  async load() {
    const me = await getMe();
    if (me.user.role !== 'admin') return go('/');
    this.me = me;
    this.counts = await api('GET', '/api/admin/sidebar');
    await this.loadAdmin?.();
  }
  async refreshCounts() { this.counts = await api('GET', '/api/admin/sidebar'); }
  side(active) { return { active, counts: this.counts || {}, email: this.me?.user.email || '' }; }
}
