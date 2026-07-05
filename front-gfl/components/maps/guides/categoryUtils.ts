// Maps stored GuideCategory values (DB enum strings) to translation keys under `guides.categories`.
export const GUIDE_CATEGORY_KEYS: Record<string, string> = {
    'Boss Strategy': 'bossStrategy',
    'Items': 'items',
    'Shortcuts': 'shortcuts',
    'Triggers': 'triggers',
    'Beginner Tips': 'beginnerTips',
    'General': 'general',
};

export function guideCategoryLabel(t: (key: string) => string, category: string): string {
    const key = GUIDE_CATEGORY_KEYS[category];
    return key ? t(`categories.${key}`) : category;
}
