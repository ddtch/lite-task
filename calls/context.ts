/**
 * Per-call dynamic context (date, time, timezone) for the Retell LLM prompt.
 *
 * The Retell general_prompt is set once at LLM creation and stays static.
 * To keep the agent's understanding of "today" current, we pass these values
 * via retell_llm_dynamic_variables on every outbound/inbound call and
 * reference them in the prompt as {{current_date}} etc.
 */

export function buildDateContext(): Record<string, string> {
  const tz = Deno.env.get("TZ") ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();

  const current_date = now.toLocaleDateString("en-CA", { timeZone: tz });
  const current_time = now.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const day_of_week = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);

  return {
    current_date,
    current_time,
    current_datetime: `${current_date} ${current_time}`,
    day_of_week,
    timezone: tz,
  };
}
