"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { checkSlug, createOrganization } from "@/app/onboarding/actions";
import { createOrgSchema, slugify, slugSchema, type CreateOrgInput } from "@/lib/validation/org";

type SlugState = "idle" | "checking" | "available" | "taken";

export function CreateOrgForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [checked, setChecked] = useState<{ slug: string; available: boolean } | null>(null);
  // Once the person edits the address themselves, stop deriving it from the name.
  const slugTouched = useRef(false);

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "", slug: "" },
  });
  const slug = useWatch({ control: form.control, name: "slug" });

  const slugValid = slugSchema.safeParse(slug).success;
  // Availability is derived: a result only counts while it is for the slug currently typed.
  const slugState: SlugState = !slugValid
    ? "idle"
    : checked?.slug !== slug
      ? "checking"
      : checked.available
        ? "available"
        : "taken";

  useEffect(() => {
    if (!slugValid) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await checkSlug({ slug });
      if (!stale && result.ok) setChecked({ slug, available: result.data.available });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [slug, slugValid]);

  async function onSubmit(values: CreateOrgInput) {
    setFormError(null);
    const result = await createOrganization(values);
    if (!result.ok) {
      const slugError = result.error.fieldErrors?.slug?.[0];
      if (slugError) form.setError("slug", { message: slugError });
      else setFormError(result.error.message);
      if (result.error.code === "conflict") setChecked({ slug: values.slug, available: false });
      return;
    }
    router.replace(`/${result.data.slug}`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormAlert>{formError}</FormAlert>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="organization"
                  placeholder="Bakery Co."
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!slugTouched.current) {
                      form.setValue("slug", slugify(e.target.value), { shouldValidate: false });
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="bakery-co"
                  {...field}
                  onChange={(e) => {
                    slugTouched.current = true;
                    field.onChange(e.target.value.toLowerCase());
                  }}
                />
              </FormControl>
              <FormDescription aria-live="polite">
                {slugState === "checking" && "Checking…"}
                {slugState === "available" && "Nice, that one's free."}
                {slugState === "taken" && "That one's taken. Try another."}
                {slugState === "idle" && `Your workspace lives at /${slug || "your-workspace"}`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full font-semibold"
          disabled={form.formState.isSubmitting || slugState === "taken"}
        >
          {form.formState.isSubmitting ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </Form>
  );
}
