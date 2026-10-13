/** Minimal NextRequest/NextResponse stand-ins for bridged route handlers. */

export class NextRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return Response.json(body, init);
  }
  static redirect(url: string | URL, status = 307) {
    return Response.redirect(url, status);
  }
}
