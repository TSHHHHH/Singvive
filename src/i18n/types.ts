export type LocaleId = 'en' | 'zh-Hans';

export const DEFAULT_LOCALE: LocaleId = 'en';

export const LOCALES: { id: LocaleId; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh-Hans', label: '简体中文' },
];

export function isLocaleId(value: string): value is LocaleId {
  return value === 'en' || value === 'zh-Hans';
}

/** Nested message tree: strings or deeper objects / string arrays (guide bullets). */
export type MessageNode = string | string[] | { [key: string]: MessageNode };

export type MessageTree = { [key: string]: MessageNode };
