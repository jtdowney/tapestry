<script lang="ts">
  interface Props {
    value: string;
    patterns: string[];
    loading?: boolean;
    class?: string;
  }

  let { value = $bindable(), patterns, loading = false, class: className = '' }: Props = $props();
</script>

<select
  bind:value
  class="select select-bordered w-full {className}"
  disabled={loading || patterns.length === 0}
>
  {#if loading || patterns.length === 0}
    <option value="">
      {#if loading}
        Loading patterns...
      {:else}
        No patterns available
      {/if}
    </option>
  {/if}
  {#each patterns as pattern, i (`${pattern}:${i}`)}
    <option value={pattern}>{pattern}</option>
  {/each}
</select>
