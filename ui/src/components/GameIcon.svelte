<script lang="ts">
  import { abnormalIconCandidates, iconIfReady, resolveIcon, skillIconCandidates, tablesReady, WAND_ICON } from "../lib/icons";

  // Give either a skill code or an abnormal (buff) id.
  let { skill = 0, abnormal = 0, size = 20 }: { skill?: number; abnormal?: number; size?: number } = $props();

  let src = $state(WAND_ICON);

  $effect(() => {
    const s = skill;
    const a = abnormal;
    let live = true;
    tablesReady.then(() => {
      if (!live) return;
      const candidates = a ? abnormalIconCandidates(a, s) : skillIconCandidates(s);
      const ready = iconIfReady(candidates);
      if (ready) {
        src = ready;
        return;
      }
      resolveIcon(candidates).then((url) => {
        if (live) src = url;
      });
    });
    return () => {
      live = false;
    };
  });
</script>

<img {src} alt="" width={size} height={size} draggable="false" onerror={() => (src = WAND_ICON)} />

<style>
  img {
    flex: none;
    border-radius: 3px;
    object-fit: cover;
  }
</style>
