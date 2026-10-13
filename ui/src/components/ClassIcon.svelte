<script lang="ts">
  import type { ClassInfo } from "../lib/classes";

  let { cls, size = 20 }: { cls: ClassInfo; size?: number } = $props();
</script>

{#if cls.icon}
  <img src={cls.icon} alt={cls.name} title={cls.name} width={size} height={size} draggable="false" />
{:else}
  <span class="none" style:width="{size}px" style:height="{size}px"></span>
{/if}

<style>
  img,
  .none {
    flex: none;
    display: inline-block;
  }
</style>
