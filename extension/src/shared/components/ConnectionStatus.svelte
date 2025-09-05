<script lang="ts">
  import { Circle, RefreshCw } from '@lucide/svelte';

  import {
    getConnectionStatus,
    addConnectionListener,
    removeConnectionListener,
  } from '$shared/connection';

  let connecting = $state<boolean>(false);
  let mounted = $state<boolean>(false);
  let status = $state<'connected' | 'disconnected' | 'checking'>('checking');

  const isConnected = $derived(status === 'connected');
  const isDisconnected = $derived(status === 'disconnected');

  async function handleManualRetry(): Promise<void> {
    if (connecting) return;
    connecting = true;
    try {
      await checkConnection();
    } finally {
      connecting = false;
    }
  }

  async function checkConnection(): Promise<void> {
    try {
      status = await getConnectionStatus();
    } catch (error) {
      console.error('Failed to check connection status:', error);
      status = 'disconnected';
    }
  }

  function handleConnectionUpdate(newStatus: 'connected' | 'disconnected'): void {
    status = newStatus;
  }

  $effect(() => {
    if (!mounted) {
      mounted = true;
      checkConnection();
    }
  });

  $effect(() => {
    addConnectionListener(handleConnectionUpdate);

    return () => {
      removeConnectionListener(handleConnectionUpdate);
    };
  });
</script>

<div class="flex items-center gap-2">
  <div class="flex items-center gap-1">
    {#if isDisconnected && !connecting}
      <div class="tooltip tooltip-bottom" data-tip="Reconnect to native host">
        <button onclick={handleManualRetry} class="btn btn-ghost btn-xs p-1 min-h-0 h-auto">
          <RefreshCw size={12} />
        </button>
      </div>
    {:else if connecting}
      <div class="loading loading-spinner loading-xs"></div>
    {/if}

    <Circle size={8} class={isConnected ? 'fill-success text-success' : 'fill-error text-error'} />
  </div>
</div>
