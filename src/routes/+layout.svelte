<script lang="ts">
  /* The shell: wordmark, nav, theme, the data load, the keyboard listener and
     the toast host (06-architecture.md §2). */
  import '../styles/tokens.css';
  import '../styles/base.css';
  import { goto } from '$app/navigation';
  import { base, resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    attachKeyboard,
    currentRowContext,
    type KeyAction,
    type RoutePath
  } from '$lib/keyboard';
  import { addDays } from '$lib/metrics/dates';
  import { loadSession, session, undoLast } from '$lib/store/session.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  /** Routes that exist. Grows milestone by milestone; a dead link is worse than none. */
  type Route = '/' | '/week' | '/trends' | '/settings';
  /** A route with the demo flag kept on; typed so `resolve()` accepts it. */
  type NavTarget = Route | `${Route}?demo=1`;

  interface NavItem {
    href: Route;
    label: string;
  }

  const NAV: NavItem[] = [
    { href: '/', label: 'today' },
    { href: '/week', label: 'week' },
    { href: '/trends', label: 'trends' },
    { href: '/settings', label: 'set' }
  ];

  /** The `G` targets that exist today. Missing ones are inert, not 404s. */
  const LIVE_ROUTES: Partial<Record<RoutePath, Route>> = {
    '/': '/',
    '/week': '/week',
    '/trends': '/trends',
    '/settings': '/settings'
  };

  /** 04-ux.md §4, as the help overlay shows it. */
  const KEY_HELP: { keys: string; action: string }[] = [
    { keys: 'Tab / Shift+Tab', action: 'move between rows' },
    { keys: 'J / K', action: 'move down / up' },
    { keys: '1–7', action: 'set the focused row to its Nth option' },
    { keys: 'Space', action: 'primary action' },
    { keys: 'Backspace', action: 'clear the focused row' },
    { keys: 'E', action: 'edit the note' },
    { keys: '⌘Z / Ctrl+Z', action: 'undo the last write' },
    { keys: 'G then T / W / R / S', action: 'today / week / trends / settings' },
    { keys: '[ / ]', action: 'previous / next day' },
    { keys: 'Esc', action: 'dismiss a sheet, blur a field' },
    { keys: '?', action: 'this list' }
  ];

  let helpOpen = $state(false);
  let chord = $state(false);
  let online = $state(true);

  const current = $derived(page.url.pathname.replace(base, '') || '/');
  const isActive = (href: string): boolean =>
    href === '/' ? current === '/' : current === href || current.startsWith(href + '/');

  /** Navigation keeps the demo flag: leaving it would silently swap the data. */
  function href(route: Route): NavTarget {
    return session.demo ? `${route}?demo=1` : route;
  }

  // Load on mount and on every search change (?d=, ?demo=1).
  $effect(() => {
    void loadSession(page.url.search);
  });

  // Settings own the theme and density (04-ux.md §7, 05-design.md §1).
  $effect(() => {
    const root = document.documentElement;
    const preference = session.settings.theme;
    const dark =
      preference === 'dark' ||
      (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.density = session.settings.density;
  });

  // The word `offline` is the whole offline state (04-ux.md §9).
  $effect(() => {
    const update = (): void => {
      online = navigator.onLine;
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });

  /**
   * `[` and `]` move the viewed day. The mode param (`?demo=1`) travels with
   * the URL, otherwise browsing days would drop out of demo mode.
   */
  function goToDay(date: string | null): void {
    const parts: string[] = [];
    if (session.demo) parts.push('demo=1');
    if (date) parts.push(`d=${date}`);
    void goto(resolve(parts.length > 0 ? `/?${parts.join('&')}` : '/'));
  }

  function perform(action: KeyAction): void {
    const rows = currentRowContext();
    switch (action.type) {
      case 'undo':
        void undoLast();
        break;
      case 'goto': {
        const route = LIVE_ROUTES[action.route];
        if (route) void goto(resolve(href(route)));
        break;
      }
      case 'help':
        helpOpen = !helpOpen;
        break;
      case 'escape':
        if (helpOpen) helpOpen = false;
        else if (rows) rows.onAction(action);
        else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        break;
      case 'shiftDay': {
        // Only the Today screen shows one day; elsewhere `[` and `]` are inert.
        if (current !== '/') break;
        const next = addDays(session.date, action.delta);
        goToDay(next > session.today ? null : next);
        break;
      }
      case 'move':
      case 'option':
      case 'primary':
      case 'clear':
      case 'editNote':
        rows?.onAction(action);
        break;
      case 'none':
      case 'chord':
        break;
    }
  }

  // One listener for the whole app (06-architecture.md §2).
  $effect(() =>
    attachKeyboard({
      sheetOpen: () => helpOpen,
      onAction: perform,
      onChordChange: (active) => {
        chord = active;
      }
    })
  );
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar">
  <div class="shell topbar-inner">
    <a class="logotype wordmark" href={resolve(href('/'))}>north</a>

    <div class="topbar-right">
      {#if chord}<span class="meta chord">g…</span>{/if}
      {#if !online}<span class="meta offline">offline</span>{/if}
      <nav class="nav" aria-label="Primary">
        {#each NAV as item (item.href)}
          <a
            class="navlink"
            class:active={isActive(item.href)}
            href={resolve(href(item.href))}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >{item.label}</a
          >
        {/each}
      </nav>
    </div>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<Toast onundo={() => void undoLast()} />

<Sheet open={helpOpen} title="Keyboard" onclose={() => (helpOpen = false)}>
  <dl class="keys">
    {#each KEY_HELP as row (row.keys)}
      <div class="key-row">
        <dt class="num">{row.keys}</dt>
        <dd class="meta">{row.action}</dd>
      </div>
    {/each}
  </dl>
</Sheet>

<style>
  .skip-link {
    position: absolute;
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    left: var(--s-4);
    top: calc(var(--s-16) * -1);
    z-index: 40;
    background: var(--paper);
    color: var(--ink);
    padding: 0 var(--s-3);
    border: var(--bw-hair) solid var(--rule-strong);
    font-size: var(--fs-13);
    transition: top var(--t-fast) var(--ease);
  }

  .skip-link:focus-visible {
    top: var(--s-2);
  }

  .topbar {
    height: var(--topbar-h);
    border-bottom: var(--bw-hair) solid var(--rule);
    background: var(--paper);
  }

  .topbar-inner {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-6);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: var(--s-4);
  }

  .offline,
  .chord {
    color: var(--ink-muted);
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-min);
    min-width: var(--tap-min);
    color: var(--ink);
    text-decoration: none;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--s-5);
  }

  .navlink {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tap-min);
    min-width: var(--tap-min);
    font-size: var(--fs-13);
    color: var(--ink-muted);
    text-decoration: none;
    transition: color var(--t-fast) var(--ease);
  }

  .navlink::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bw-hair);
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform var(--t-base) var(--ease);
  }

  .navlink:hover,
  .navlink.active {
    color: var(--ink);
  }

  .navlink:hover::after,
  .navlink.active::after {
    transform: scaleX(1);
  }

  .keys {
    display: grid;
    gap: var(--s-2);
  }

  .key-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
    align-items: baseline;
  }

  .key-row dt {
    font-size: var(--fs-12);
    color: var(--ink);
  }

  @media (max-width: 480px) {
    /* Four links plus the wordmark have to fit in 280 px at a 320 px viewport.
       The 44 px tap floor on every link is non-negotiable, so the gaps give. */
    .topbar-inner {
      gap: var(--s-3);
    }

    .nav {
      gap: var(--s-3);
    }
  }
</style>
