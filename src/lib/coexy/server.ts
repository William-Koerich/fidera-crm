import "server-only";
import { CoexyClient } from "./client";

export function getCoexyClient(): CoexyClient {
  const apiKey = process.env.COEXY_API_KEY;
  if (!apiKey) throw new Error("Missing COEXY_API_KEY.");
  return new CoexyClient({ apiKey, baseUrl: process.env.COEXY_API_URL });
}
