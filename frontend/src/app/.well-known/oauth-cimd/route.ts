import { originFromRequest } from "@/lib/googleToken";
import { HF_SCOPES } from "@/lib/providerKeys";

// "Sign in with Hugging Face" with no app registered by hand: Hugging Face
// reads this page, whose own URL is the client ID (a Client ID Metadata Document).
export function GET(req: Request) {
  const origin = originFromRequest(req);
  return Response.json({
    client_id: `${origin}/.well-known/oauth-cimd`,
    client_name: "The Third Eye",
    client_uri: origin,
    logo_uri: `${origin}/icon.png`,
    redirect_uris: [`${origin}/api/connect/huggingface/callback`],
    token_endpoint_auth_method: "none",
    scopes: HF_SCOPES,
  });
}
