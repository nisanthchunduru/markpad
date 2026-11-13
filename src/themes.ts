export const themeNames = ['github', 'gothic', 'newsprint', 'night', 'pixyll', 'pixyll-night', 'whitey'] as const;
export const themeLabels: Record<typeof themeNames[number], string> = {
  github: 'GitHub', gothic: 'Gothic', newsprint: 'Newsprint', night: 'Night',
  pixyll: 'Pixyll', 'pixyll-night': 'Pixyll Night', whitey: 'Whitey'
};
export type ThemeName = typeof themeNames[number];

export function isThemeName(value: unknown): value is ThemeName {
  return themeNames.some(theme => theme === value);
}
