"use client";

import { ProjectDot } from "@/components/projects/project-color-picker";
import type { ProjectDTO } from "@/lib/dto/project";

/** Checkbox list of projects (used for invite and scope editing). */
export function ProjectChecklist({
  projects,
  value,
  onChange,
  name,
}: {
  projects: Pick<ProjectDTO, "id" | "name" | "color">[];
  value: string[];
  onChange: (ids: string[]) => void;
  name: string;
}) {
  return (
    <ul
      className="grid max-h-56 gap-1 overflow-y-auto rounded-lg bg-canvas p-1.5"
      aria-label={name}
    >
      {projects.map((p) => {
        const id = `${name}-${p.id}`;
        const checked = value.includes(p.id);
        return (
          <li key={p.id}>
            <label
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-canvas-sunken"
            >
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((v) => v !== p.id) : [...value, p.id])
                }
                className="size-4 accent-[var(--accent)]"
              />
              <ProjectDot color={p.color} />
              <span className="min-w-0 truncate">{p.name}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
