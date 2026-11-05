export type KenzLocale = 'ar' | 'fr' | 'en';
const messages: Record<KenzLocale, Record<string, string>> = {
  fr: {},
  en: {
    dashboard: 'Dashboard', transactions: 'Transactions', reports: 'Reports', planning: 'Planning & Goals',
    neighborhood: 'Neighborhood & Services', debts: 'Kredy Ledger', zakat: 'Zakat & Events', settings: 'Settings',
    addTransaction: 'Transaction', aiCoach: 'AI Coach', homeTitle: 'Available to spend',
    historyTitle: 'Transaction history', settingsTitle: 'Application settings',
    settingsHint: 'Manage your profile, cash accounts and data privacy.',
    language: 'Language & format', currency: 'Main currency', french: 'French', arabic: 'Arabic',
    all: 'All', income: 'Income', expense: 'Expense', transfer: 'Transfer',
    search: 'Search', export: 'Export CSV', add: 'Add', delete: 'Delete',
    noTransactions: 'No transactions found', period: 'Period', accounts: 'Accounts',
    createAccount: 'Create account', cancel: 'Cancel', accountName: 'Account name',
    accountType: 'Account type', initialBalance: 'Opening balance',
  },
  ar: {
    dashboard: 'لوحة التحكم', transactions: 'العمليات', reports: 'التقارير', planning: 'التخطيط والأهداف',
    neighborhood: 'الحي والخدمات', debts: 'دفتر الديون', zakat: 'الزكاة والمناسبات', settings: 'الإعدادات',
    addTransaction: 'عملية جديدة', aiCoach: 'المستشار الذكي', homeTitle: 'المبلغ المتاح للإنفاق',
    historyTitle: 'سجل العمليات', settingsTitle: 'إعدادات التطبيق',
    settingsHint: 'إدارة ملفك الشخصي وحساباتك وخصوصية بياناتك.',
    language: 'اللغة والتنسيق', currency: 'العملة الرئيسية', french: 'الفرنسية', arabic: 'العربية',
    all: 'الكل', income: 'المداخيل', expense: 'المصاريف', transfer: 'تحويل',
    search: 'بحث', export: 'تصدير CSV', add: 'إضافة', delete: 'حذف',
    noTransactions: 'لا توجد عمليات', period: 'الفترة', accounts: 'الحسابات',
    createAccount: 'إنشاء الحساب', cancel: 'إلغاء', accountName: 'اسم الحساب',
    accountType: 'نوع الحساب', initialBalance: 'الرصيد الافتتاحي',
  },
};
export const kenzText = (locale: string, key: string, fallback?: string) =>
  messages[(locale === 'ar' || locale === 'en' ? locale : 'fr')][key] || fallback || key;
