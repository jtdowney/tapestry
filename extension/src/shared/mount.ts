import { mount, type Component } from 'svelte';

export function mountApp(component: Component, elementId = 'app') {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    console.error(`Could not find #${elementId} element to mount component`);
    return;
  }

  return mount(component, {
    target: targetElement,
  });
}

export function handleDOMReady(mountFn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFn);
  } else {
    mountFn();
  }
}
