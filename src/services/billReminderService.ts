import { RecurringItem } from '../domain/types';

export type BillReminderPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function getBillReminderPermission(): BillReminderPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestBillReminderPermission(): Promise<BillReminderPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
  } catch (error) {
    console.warn('Unable to request bill notification permission:', error);
  }
  return Notification.permission;
}

export function daysUntilBill(date: string, today = localDate()): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = date.split('-').map(Number);
  const todayUtc = Date.UTC(y1, m1 - 1, d1);
  const dueUtc = Date.UTC(y2, m2 - 1, d2);
  return Math.round((dueUtc - todayUtc) / 86400000);
}

export function dispatchBillReminders(userId: string, items: RecurringItem[]): number {
  if (typeof window === 'undefined' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0;
  const key = `kenz_bill_reminders_sent_v1_${userId}`;
  let sent: string[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(parsed)) sent = parsed.filter((value) => typeof value === 'string');
  } catch { sent = []; }

  const sentSet = new Set(sent);
  let delivered = 0;
  for (const item of items) {
    if (!item.isActive || !item.reminderEnabled) continue;
    const days = daysUntilBill(item.nextDueDate);
    const lead = Math.max(0, Math.min(30, item.reminderDaysBefore ?? 1));
    if (days > lead) continue;
    const reminderId = `${item.id}:${item.nextDueDate}`;
    if (sentSet.has(reminderId)) continue;
    const dueText = days < 0 ? `En retard de ${Math.abs(days)} jour(s)`
      : days === 0 ? "Échéance aujourd'hui"
      : `Échéance dans ${days} jour(s)`;
    try {
      new Notification(`Kenz · ${item.name}`, {
        body: `${dueText} · ${(item.amountMinor / 100).toLocaleString()} ${item.currency}`,
        tag: `kenz-bill-${reminderId}`,
      });
      sentSet.add(reminderId);
      delivered += 1;
    } catch (error) {
      console.warn('Unable to display bill reminder:', error);
    }
  }

  try { localStorage.setItem(key, JSON.stringify([...sentSet].slice(-500))); }
  catch (error) { console.warn('Unable to persist bill reminder delivery state:', error); }
  return delivered;
}

export function formatBillDueLabel(date: string, locale: 'ar' | 'fr' | 'en'): string {
  const days = daysUntilBill(date);
  if (days < 0) {
    const count = Math.abs(days);
    return locale === 'ar' ? `متأخرة منذ ${count} يوم` : locale === 'fr' ? `En retard de ${count} j` : `${count}d overdue`;
  }
  if (days === 0) return locale === 'ar' ? 'مستحقة اليوم' : locale === 'fr' ? "À payer aujourd'hui" : 'Due today';
  if (locale === 'ar') return `خلال ${days} يوم`;
  return locale === 'fr' ? `Dans ${days} j` : `In ${days} days`;
}
