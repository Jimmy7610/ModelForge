import { describe, it, expect } from 'vitest';
import { NavigationPage } from '../src/shared/types';
import { DEFAULT_SETTINGS, APP_VERSION } from '../src/shared/constants';

describe('Navigation and Constants Configuration', () => {
  it('defines all 9 navigation destinations', () => {
    const pages: NavigationPage[] = [
      'home',
      'models',
      'model-lab',
      'teams',
      'projects',
      'builder',
      'terminal',
      'history',
      'settings',
    ];

    expect(pages).toHaveLength(9);
    expect(pages).toContain('builder');
    expect(pages).toContain('home');
    expect(pages).toContain('models');
    expect(pages).toContain('model-lab');
    expect(pages).toContain('teams');
    expect(pages).toContain('projects');
    expect(pages).toContain('terminal');
    expect(pages).toContain('history');
    expect(pages).toContain('settings');
  });

  it('defaults to Builder as the hero startup page', () => {
    expect(DEFAULT_SETTINGS.startupPage).toBe('builder');
  });

  it('exposes correct app version', () => {
    expect(APP_VERSION).toBe('0.5.0');
  });
});
