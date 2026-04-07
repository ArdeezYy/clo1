import { NextResponse } from "next/server";

import { encryptPayload, bytesToHex, utf8ToBytes, validateParams, type MagiParams } from "@/lib/magi/engine";
import { decodeImageBase64, encodePngDataUrl, packEncryptedImage } from "@/lib/magi/image-codec";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params = parseParams(body);

    if (body.inputType === "text") {
      if (typeof body.text !== "string" || body.text.length === 0) {
        throw new Error("Teks input wajib diisi.");
      }

      const encrypted = encryptPayload(utf8ToBytes(body.text), params);

      return NextResponse.json({
        outputType: "text",
        result: bytesToHex(encrypted).toUpperCase(),
        encoding: "hex",
        metadata: {
          inputType: "text",
          bytes: encrypted.length,
        },
      });
    }

    if (body.inputType === "image") {
      if (!body.image?.data || !body.image?.mimeType) {
        throw new Error("Payload gambar tidak lengkap.");
      }

      const decoded = decodeImageBase64(body.image.data, body.image.mimeType);
      const encrypted = encryptPayload(decoded.rgba, params);
      const packed = packEncryptedImage(encrypted, decoded.width, decoded.height);
      const encoded = encodePngDataUrl(packed);

      return NextResponse.json({
        outputType: "image",
        mimeType: encoded.mimeType,
        dataUrl: encoded.dataUrl,
        metadata: {
          inputType: "image",
          originalWidth: decoded.width,
          originalHeight: decoded.height,
          packedWidth: packed.width,
          packedHeight: packed.height,
        },
      });
    }

    throw new Error("inputType harus text atau image.");
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Encrypt request gagal diproses.",
      },
      { status: 400 },
    );
  }
}

function parseParams(body: unknown): MagiParams {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid.");
  }

  const candidate = body as Record<string, unknown>;
  const params = {
    playfairKey: String(candidate.playfairKey ?? ""),
    railFenceDepth: Number(candidate.railFenceDepth ?? 0),
    desKeyHex: String(candidate.desKey ?? ""),
    ivHex: String(candidate.iv ?? ""),
  };

  validateParams(params);
  return params;
}
