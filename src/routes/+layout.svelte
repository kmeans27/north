<script lang="ts">
  import '../styles/tokens.css';
  import '../styles/base.css';
  import { base, resolve } from '$app/paths';
  import { page } from '$app/state';
  import { loadSession, session } from '$lib/store/session.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  /** Routes that exist. Grows milestone by milestone; a dead link is worse than none. */
  type Route = '/';

  interface NavItem {
    href: Route;
    label: string;
  }

  const NAV: NavItem[] = [{ href: '/', label: 'today' }];

  const current = $derived(page.url.pathname.replace(base, '') || '/');
  const isActive = (href: string): boolean =>
    href === '/' ? current === '/' : current === href || current.startsWith(href + '/');

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
</script>

<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar">
  <div class="shell topbar-inner">
    <a class="logotype wordmark" href={resolve('/')}>north</a>

    <nav class="nav" aria-label="Primary">
      {#each NAV as item (item.href)}
        <a
          class="navlink"
          class:active={isActive(item.href)}
          href={resolve(item.href)}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >{item.label}</a>
      {/each}
    </nav>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<style>
  .skip-link {
    position: absolute;
    left: var(--s-4);
    top: calc(var(--s-16) * -1);
    z-index: 10;
    background: var(--paper);
    color: var(--ink);
    padding: var(--s-2) var(--s-3);
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

  .wordmark {
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
    font-size: var(--fs-13);
    color: var(--ink-muted);
    text-decoration: none;
    padding: var(--s-2) 0;
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

  @media (max-width: 480px) {
    .nav {
      gap: var(--s-4);
    }
  }
</style>
