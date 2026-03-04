/**
 * Create a Retell web call and return the access token for the frontend.
 */

import { define } from "../../../utils.ts";
import { createWebCall } from "../../../calls/retell.ts";
import { createCallLog } from "../../../db/queries.ts";

export const handler = define.handlers({
  async POST() {
    const agentId = Deno.env.get("RETELL_AGENT_ID");
    if (!agentId) {
      return Response.json(
        { error: "Voice calling not configured (RETELL_AGENT_ID missing)" },
        { status: 503 },
      );
    }

    try {
      const data = await createWebCall(agentId);

      await createCallLog({
        call_id: data.call_id,
        call_type: "web_call",
        direction: "inbound",
        call_status: data.call_status,
      });

      return Response.json({
        access_token: data.access_token,
        call_id: data.call_id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[voice/web-call] Error:", msg);
      return Response.json({ error: msg }, { status: 502 });
    }
  },
});
