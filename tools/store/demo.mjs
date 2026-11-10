// Demo data for store graphics: believable, made up, no real brands, nobody's real tabs.
// Used by snap.mjs, which runs Snark's real sidebar/search code against it.

export const WIN = 1;

// Site "brands" for the demo, drawn as monogram icons (see icons.mjs).
export const SITES = {
  'plan.tidepool.app': { letter: 'T', color: '#4c6ef5' },
  'docs.lumen.so': { letter: 'L', color: '#f59f00' },
  'board.kanbo.io': { letter: 'K', color: '#12b886' },
  'metrics.pulseboard.io': { letter: 'P', color: '#7950f2' },
  'mail.postbox.app': { letter: 'M', color: '#e8590c' },
  'cal.dayline.app': { letter: 'D', color: '#1c7ed6' },
  'chat.hivechat.io': { letter: 'H', color: '#d6336c' },
  'tunes.loop.fm': { letter: '♪', color: '#2b2d42' },
  'wiki.fernhill.dev': { letter: 'F', color: '#2f9e44' },
  'figure.studio': { letter: 'f', color: '#ae3ec9' },
  'news.tidyweb.dev': { letter: 'N', color: '#495057' },
  'flights.skyhop.travel': { letter: 'S', color: '#0ca678' },
  'sheets.gridly.app': { letter: 'G', color: '#2f9e44' },
  'shop.tilehaus.com': { letter: 'T', color: '#c2255c' },
  'stay.lisboa-inn.pt': { letter: 'L', color: '#f08c00' },
  'recipes.panfry.co': { letter: 'P', color: '#e03131' },
  'bank.northwind.bank': { letter: 'N', color: '#1864ab' },
  'landing.waitlist.dev': { letter: 'W', color: '#f76707' },
  'names.domainbin.io': { letter: 'D', color: '#5f3dc4' },
  'read.longform.club': { letter: 'R', color: '#862e9c' },
};

const u = (host, path = '') => `https://${host}/${path}`;
const pin = (id, parent, title, host, path, extra = {}) => ({ id, type: 'pin', parent, title, url: u(host, path), ...extra });
const folder = (id, parent, title, extra = {}) => ({ id, type: 'folder', parent, title, ...extra });

export const tree = [
  folder('work', null, 'Work', { icon: '💼', color: 'blue', theme: 'sky' }),
  folder('q4', 'work', 'Q4 launch'),
  pin('plan', 'q4', 'Launch plan', 'plan.tidepool.app', 'launch-q4'),
  pin('pricing', 'q4', 'Pricing page draft', 'docs.lumen.so', 'pricing-v3'),
  pin('beta', 'q4', 'Beta feedback', 'board.kanbo.io', 'beta'),
  pin('launchchk', 'q4', 'Launch checklist', 'docs.lumen.so', 'launch-checklist'),
  folder('ds', 'work', 'Design system'),
  pin('ds1', 'ds', 'Components', 'figure.studio', 'ds/components'),
  pin('ds2', 'ds', 'Tokens', 'wiki.fernhill.dev', 'tokens'),
  pin('ds3', 'ds', 'Icon set', 'figure.studio', 'ds/icons'),
  folder('team', 'work', 'Team'),
  pin('t1', 'team', '1:1 notes', 'docs.lumen.so', 'one-on-ones'),
  pin('t2', 'team', 'Hiring tracker', 'sheets.gridly.app', 'hiring'),
  pin('sprint', 'work', 'Sprint board', 'board.kanbo.io', 'sprint-42'),
  pin('metrics', 'work', 'Metrics', 'metrics.pulseboard.io', 'weekly', { note: 'Check Mondays, cry Tuesdays' }),

  folder('home', null, 'Home', { icon: '🏠', color: 'green', theme: 'mint' }),
  folder('reno', 'home', 'Kitchen reno'),
  pin('tiles', 'reno', 'Backsplash tiles', 'shop.tilehaus.com', 'zellige'),
  pin('budget', 'reno', 'Reno budget', 'sheets.gridly.app', 'reno'),
  folder('lisbon', 'home', 'Trip: Lisbon'),
  pin('flights', 'lisbon', 'Flights', 'flights.skyhop.travel', 'sfo-lis'),
  pin('stay', 'lisbon', 'Where we’re staying', 'stay.lisboa-inn.pt', 'room-12'),
  folder('bills', 'home', 'Bills'),
  pin('bank', 'bills', 'Bank', 'bank.northwind.bank', ''),
  pin('meals', 'home', 'Meal plan', 'docs.lumen.so', 'meals'),
  pin('recipes', 'home', 'Recipes to try', 'recipes.panfry.co', 'saved'),

  folder('side', null, 'Side project', { icon: '🎨', color: 'orange', theme: 'sunset' }),
  folder('launch', 'side', 'Launch'),
  pin('landing', 'launch', 'Landing page', 'landing.waitlist.dev', ''),
  pin('waitlist', 'launch', 'Waitlist signups', 'sheets.gridly.app', 'waitlist'),
  pin('names', 'side', 'Name ideas', 'names.domainbin.io', 'ideas'),
  pin('roadmap', 'side', 'Roadmap', 'plan.tidepool.app', 'side'),

  folder('reading', null, 'Reading', { icon: '📚', color: 'purple', theme: 'lilac' }),
  pin('long', 'reading', 'Longreads queue', 'read.longform.club', 'queue'),
];

export const favorites = [
  { id: 'f-mail', title: 'Mail', url: u('mail.postbox.app') },
  { id: 'f-cal', title: 'Calendar', url: u('cal.dayline.app') },
  { id: 'f-chat', title: 'Chat', url: u('chat.hivechat.io') },
  { id: 'f-wiki', title: 'Wiki', url: u('wiki.fernhill.dev') },
];

export const groups = [
  { id: 100, windowId: WIN, title: 'Work', color: 'blue', collapsed: false },
  { id: 101, windowId: WIN, title: 'Home', color: 'green', collapsed: true },
  { id: 102, windowId: WIN, title: 'Side project', color: 'orange', collapsed: true },
];

const tab = (id, group, title, url, extra = {}) => ({ id, windowId: WIN, groupId: group, title, url, pinned: false, active: false, ...extra });
export const tabs = [
  // favorites (Chrome-pinned)
  { id: 1, windowId: WIN, groupId: -1, title: 'Inbox (3)', url: u('mail.postbox.app'), pinned: true, active: false },
  { id: 2, windowId: WIN, groupId: -1, title: 'Calendar', url: u('cal.dayline.app'), pinned: true, active: false },
  { id: 3, windowId: WIN, groupId: -1, title: 'Chat', url: u('chat.hivechat.io'), pinned: true, active: false },
  // Work
  tab(10, 100, 'Launch plan · Tidepool', u('plan.tidepool.app', 'launch-q4'), { active: true }),
  tab(11, 100, 'Pricing page draft', u('docs.lumen.so', 'pricing-v3')),
  tab(12, 100, 'Sprint 42 · Kanbo', u('board.kanbo.io', 'sprint-42')),
  tab(13, 100, 'How to write a changelog people read', u('news.tidyweb.dev', 'changelogs')),
  tab(14, 100, 'Untitled spreadsheet', u('sheets.gridly.app', 'new')),
  // Home
  tab(20, 101, 'Backsplash tiles · Tilehaus', u('shop.tilehaus.com', 'zellige')),
  tab(21, 101, 'Flights SFO → LIS', u('flights.skyhop.travel', 'sfo-lis')),
  tab(22, 101, '12 sheet-pan dinners', u('recipes.panfry.co', 'sheet-pan')),
  // Side project
  tab(30, 102, 'Waitlist · landing', u('landing.waitlist.dev')),
  tab(31, 102, 'Is snark.dev taken?', u('names.domainbin.io', 'search?q=snark')),
];

// pin -> open tab
export const links = { plan: 10, pricing: 11, sprint: 12, tiles: 20, flights: 21, landing: 30 };
export const favLinks = { [WIN]: { 'f-mail': 1, 'f-cal': 2, 'f-chat': 3 } };

export const closed = [
  { title: 'Best mechanical keyboards (2026)', url: u('news.tidyweb.dev', 'keyboards'), closedAt: Date.now() - 3 * 3600e3 },
  { title: 'Untitled document', url: u('docs.lumen.so', 'untitled'), closedAt: Date.now() - 26 * 3600e3 },
];
