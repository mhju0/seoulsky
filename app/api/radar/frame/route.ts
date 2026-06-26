import { renderFrame } from "@/lib/radar/apihub";
import { isValidFrameKey } from "@/lib/radar/kma";

/**
 * GET /api/radar/frame?t=<yyyyMMddHHmm> — the server-rendered Seoul echo PNG for one
 * frame. The client only ever talks to this route; the apihub key and the ~13 MB raw
 * reflectivity grid NEVER reach the browser. The route fetches + crops + reprojects +
 * colours the grid (cached per `tm`), then streams the small transparent PNG. A produced
 * frame is immutable, so the response is cached hard.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!isValidFrameKey(t)) {
    return new Response("bad request", { status: 400 });
  }

  try {
    const png = await renderFrame(t);
    // Copy into a fresh ArrayBuffer-backed view: a small (e.g. fully-transparent) frame's
    // Buffer can be pool-backed, and Buffer isn't a typed BodyInit.
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // A produced frame never changes — let the browser/CDN keep it.
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch {
    // No key, source down, frame not published yet, or malformed grid — degrade quietly
    // (no key in any message).
    return new Response("radar unavailable", { status: 502 });
  }
}
