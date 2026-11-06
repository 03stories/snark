// Feature metadata. The sidebar's ⚙ reveal renders toggles + settings from this
// list. To add a feature: add an entry here, create features/<name>.js, and
// import it in background.js. See features/_template.js.
//
// Setting types: boolean (default) or select ({ type: 'select', options: [{ value, label }] }).

export const FEATURES = [
  {
    id: 'groupPins',
    name: 'Spaces & pinned tabs',
    description: 'Spaces you swipe between. Each space is a Chrome tab group with its own pinned tabs, folders and Today.',
    default: true,
    settings: [
      { key: 'newTabsJoinSpace', label: 'New tabs join the space you’re in', default: true },
      { key: 'collapseOthers', label: 'Collapse other spaces’ tab groups when switching', default: true },
      { key: 'pinsAtTop', label: 'Keep pinned tabs at the top of their tab group, in sidebar order', default: true },
      { key: 'googleIcons', label: 'Fill in icons for sites you haven’t opened yet from Google’s favicon service (sends the site’s domain to Google)', default: false },
    ],
  },
  {
    id: 'autoClear',
    name: 'Auto-clear',
    description: 'Closes unpinned tabs you haven’t touched in a while (they go to the Archive page’s Closed tabs), and empties the Archive on the schedule set there.',
    default: true,
    settings: [
      {
        key: 'after',
        label: 'Clear after',
        type: 'select',
        default: '24',
        options: [
          { value: '12', label: '12 hours' },
          { value: '24', label: '24 hours' },
          { value: '168', label: '7 days' },
          { value: '720', label: '30 days' },
        ],
      },
      { key: 'includeGrouped', label: 'Clear unpinned tabs inside spaces too (not just “Not in a space”)', default: true },
      {
        key: 'archiveAfter',
        label: 'Empty the Archive after',
        hidden: true, // set inline on the Archive page
        type: 'select',
        default: '720',
        options: [
          { value: '0', label: 'Never' },
          { value: '24', label: '1 day' },
          { value: '168', label: '1 week' },
          { value: '720', label: '1 month' },
        ],
      },
    ],
  },
  {
    id: 'copyUrl',
    name: 'Copy URL',
    description: '⌘⇧C copies the current tab URL with a little toast. Assign a key to “Copy as Markdown link” in shortcuts.',
    default: true,
    settings: [
      { key: 'showToast', label: 'Show on-page toast', default: true },
      { key: 'stripTracking', label: 'Strip tracking params (utm_*, fbclid, gclid…)', default: false },
    ],
  },
];
