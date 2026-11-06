// Gradient themes for spaces. Each has a light and dark pair [top, bottom].
export const THEMES = {
  sky:    { name: 'Sky',    light: ['#d4e4f8', '#b9cdee'], dark: ['#1c2b42', '#141d2c'] },
  aqua:   { name: 'Aqua',   light: ['#d2f0f4', '#b3e0e8'], dark: ['#163338', '#10242a'] },
  mint:   { name: 'Mint',   light: ['#d6f1e5', '#bce4d3'], dark: ['#17312a', '#11231e'] },
  lemon:  { name: 'Lemon',  light: ['#f8f1cc', '#ede0a4'], dark: ['#33301b', '#252314'] },
  sand:   { name: 'Sand',   light: ['#f4ead8', '#e8d8bb'], dark: ['#33291d', '#261e15'] },
  sunset: { name: 'Sunset', light: ['#fde3d0', '#f6c8cf'], dark: ['#3b2521', '#2d1b23'] },
  rose:   { name: 'Rose',   light: ['#fbdbe5', '#f0c3d4'], dark: ['#3a1f2b', '#2a1620'] },
  lilac:  { name: 'Lilac',  light: ['#e6ddf8', '#d1c3f0'], dark: ['#281f3e', '#1c172d'] },
  slate:  { name: 'Slate',  light: ['#e6e9ef', '#d2d8e2'], dark: ['#25282f', '#1b1d22'] },
};

// Default theme for a space follows its Chrome tab-group color.
const BY_GROUP_COLOR = {
  grey: 'slate', blue: 'sky', cyan: 'aqua', green: 'mint', yellow: 'lemon',
  orange: 'sunset', red: 'rose', pink: 'rose', purple: 'lilac',
};

export function themeKeyFor(space) {
  const t = space?.root?.theme;
  if (t && THEMES[t]) return t;
  return BY_GROUP_COLOR[space?.color] ?? 'slate';
}

export function themeColors(space, dark) {
  const t = THEMES[themeKeyFor(space)];
  return dark ? t.dark : t.light;
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a, b, f) {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join('')}`;
}
