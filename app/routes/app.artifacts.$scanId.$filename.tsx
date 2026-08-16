import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { artifactSignature, shopArtifactKey } from "../scan.server";

const SCAN_ID = /^[0-9a-f-]{36}$/i;
const FILENAME = /^page-\d+-(desktop|mobile)\.png$/;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const scanId = params.scanId || "";
  const filename = params.filename || "";
  if (!SCAN_ID.test(scanId) || !FILENAME.test(filename)) return new Response("Not found", { status: 404 });
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { shop: true } });
  if (!scan) return new Response("Not found", { status: 404 });
  const supplied = new URL(request.url).searchParams.get("signature") || "";
  const expected = artifactSignature(scan.shop, scanId, filename);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.resolve("scan-artifacts", shopArtifactKey(scan.shop), scanId, filename));
    return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
