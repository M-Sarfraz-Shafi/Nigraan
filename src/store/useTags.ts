import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Tag } from "../api/types";

/** A modest fixed palette rather than a full color picker — keeps every tag legible against its own light background tint. */
export const TAG_COLORS = ["#2563eb", "#16a34a", "#eab308", "#f97316", "#ef4444", "#a855f7", "#0891b2", "#64748b"];

/** Loads and caches the shared, cross-project tag list, with create/rename/recolor/delete that keep local state in sync without a full reload. */
export function useTags() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.tags.list().then(setTags).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async (name: string, color: string) => {
    const tag = await api.tags.create(name, color);
    setTags((prev) => (prev ? [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)) : [tag]));
    return tag;
  }, []);

  const update = useCallback(async (id: string, patch: { name?: string; color?: string }) => {
    const tag = await api.tags.update(id, patch);
    setTags((prev) => prev && prev.map((t) => (t.id === id ? tag : t)).sort((a, b) => a.name.localeCompare(b.name)));
    return tag;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.tags.delete(id);
    setTags((prev) => prev && prev.filter((t) => t.id !== id));
  }, []);

  return { tags: tags ?? [], loading: tags === null, error, create, update, remove, reload: load };
}
