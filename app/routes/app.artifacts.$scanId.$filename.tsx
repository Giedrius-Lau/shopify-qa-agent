import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { shopArtifactKey } from "../scan.server";

const SCAN_ID = /^[0-9a-f-]{36}$/i;
const FILENAME = /^page-\d+-(desktop|mobile)\.png$/;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const scanId = params.scanId || "";
  const filename = params.filename || "";
  if (!SCAN_ID.test(scanId) || !FILENAME.test(filename)) return new Response("Not found", { status: 404 });
  const scan = await prisma.scan.findFirst({ where: { id: scanId, shop: session.shop }, select: { id: true } });
  if (!scan) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.resolve("scan-artifacts", shopArtifactKey(session.shop), scanId, filename));
    return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
