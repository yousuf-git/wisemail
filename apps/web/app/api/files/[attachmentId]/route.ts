import { getSession } from "@/lib/dal";
import { openAttachmentForUser } from "@/lib/services/attachments";
import { contentDisposition } from "@/lib/storage/disposition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attachment download (TRD §2.13): the session cookie authorizes the member (org, role, project
 * scope), then the browser is redirected to a 5-minute presigned URL whose response carries
 * `Content-Disposition: attachment`, so the file saves under its original name and the page
 * stays put. Free-plan files up to 4 MB are streamed from here instead. Anything the caller may
 * not read answers 404, never revealing that the id exists.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ attachmentId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { attachmentId } = await ctx.params;
  const access = await openAttachmentForUser(session.user.id, attachmentId);
  if (!access.ok) return new Response("Not found", { status: 404 });

  const { target } = access;
  switch (target.kind) {
    case "redirect":
      return new Response(null, {
        status: 302,
        headers: {
          location: target.url,
          "cache-control": "private, no-store",
          "referrer-policy": "no-referrer",
        },
      });
    case "stream":
      return new Response(new Uint8Array(target.body), {
        headers: {
          "content-type": target.contentType,
          "content-disposition": contentDisposition("attachment", target.filename),
          "content-length": String(target.body.length),
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox; default-src 'none'",
          "cache-control": "private, no-store",
        },
      });
    default:
      return Response.json(
        { error: "unavailable", message: "No longer available at Resend" },
        { status: 410 },
      );
  }
}
