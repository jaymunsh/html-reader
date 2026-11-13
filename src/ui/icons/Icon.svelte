<script lang="ts" module>
  export type IconName = 'back' | 'search' | 'bookmark' | 'bookmark-filled' | 'menu' | 'to-top' | 'to-bottom' | 'prev' | 'next'
    | 'close' | 'more' | 'settings' | 'warning' | 'cloud' | 'check' | 'chevron-up' | 'chevron-down' | 'folder' | 'file' | 'panel' | 'plus';
  const P: Record<IconName, string> = {
    back: 'M15 5l-7 7 7 7',
    prev: 'M15 5l-7 7 7 7',
    next: 'M9 5l7 7-7 7',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
    bookmark: 'M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z',
    'bookmark-filled': 'M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z',
    menu: 'M4 7h16M4 12h16M4 17h16',
    'to-top': 'M6 5h12M12 19V9M7 13l5-5 5 5',
    'to-bottom': 'M6 19h12M12 5v10M7 11l5 5 5-5',
    close: 'M6 6l12 12M18 6L6 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
    warning: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    cloud: 'M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1.3A3.5 3.5 0 0117 18z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    'chevron-up': 'M6 15l6-6 6 6',
    'chevron-down': 'M6 9l6 6 6-6',
    folder: 'M3 7a1 1 0 011-1h5l2 2h8a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1z',
    file: 'M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5',
    panel: 'M4 5h16v14H4zM15 5v14',
    plus: 'M12 5v14M5 12h14',
  };
</script>

<script lang="ts">
  let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'bookmark-filled' ? 'currentColor' : 'none'}
  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={P[name]} /></svg>
