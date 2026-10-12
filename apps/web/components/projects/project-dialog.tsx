"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  createProjectAction,
  updateProjectAction,
} from "@/app/(app)/[orgSlug]/settings/projects/actions";
import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectDTO } from "@/lib/dto/project";
import { createProjectSchema, type CreateProjectInput } from "@/lib/validation/project";
import { ProjectColorPicker } from "./project-color-picker";

/** Create (no `project`) or edit a project. */
export function ProjectDialog({
  orgSlug,
  project,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  project?: ProjectDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const defaults: CreateProjectInput = {
    name: project?.name ?? "",
    color: project?.color ?? "accent",
    description: project?.description ?? "",
  };
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: CreateProjectInput) {
    setFormError(null);
    const result = project
      ? await updateProjectAction(orgSlug, { ...values, projectId: project.id })
      : await createProjectAction(orgSlug, values);
    if (!result.ok) {
      const fields = result.error.fieldErrors ?? {};
      let handled = false;
      for (const key of ["name", "color", "description"] as const) {
        if (fields[key]?.[0]) {
          form.setError(key, { message: fields[key]![0] });
          handled = true;
        }
      }
      if (!handled) setFormError(result.error.message);
      return;
    }
    toast.success(project ? "Project saved" : `Created “${result.data.name}”`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) form.reset(defaults);
        else setFormError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-xl">
                {project ? "Edit project" : "New project"}
              </DialogTitle>
            </DialogHeader>
            <FormAlert>{formError}</FormAlert>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder="Acme storefront" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel id="project-color-label">Color</FormLabel>
                  <ProjectColorPicker
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy="project-color-label"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description <span className="font-normal text-ink-muted">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="font-bold">
                {form.formState.isSubmitting ? "Saving…" : project ? "Save" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
