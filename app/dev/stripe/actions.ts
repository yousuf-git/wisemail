"use server";

import { notFound, redirect } from "next/navigation";

import { stripeIsFake } from "@/lib/billing/stripe";
import {
  applyPortalAction,
  cancelCheckout,
  completeCheckout,
  type PortalAction,
} from "@/lib/billing/stripe-fake";
import { env } from "@/lib/env";

/** Server actions behind the fake hosted Checkout and Portal. Dev only; 404 everywhere else. */
function guard() {
  if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) notFound();
}

export async function payCheckoutAction(formData: FormData) {
  guard();
  const { redirectUrl } = await completeCheckout(String(formData.get("id")));
  redirect(redirectUrl);
}

export async function cancelCheckoutAction(formData: FormData) {
  guard();
  redirect(cancelCheckout(String(formData.get("id"))).redirectUrl);
}

const ACTIONS: PortalAction[] = ["cancel", "resume", "fail_payment", "pay", "confirm_update"];

export async function portalAction(formData: FormData) {
  guard();
  const action = String(formData.get("action")) as PortalAction;
  if (!ACTIONS.includes(action)) notFound();
  const { redirectUrl } = await applyPortalAction(String(formData.get("id")), action);
  redirect(redirectUrl);
}
