// Alles, was die Edge Function "coop" aus der Spiellogik braucht. Wird mit
// `npm run functions:build` zu supabase/functions/_shared/coop-server.js
// gebündelt (Deno kann die Projektdateien nicht direkt importieren).

export { applyCommand, checkProtocol, COOP_ROW_TTL_HOURS, CoopError, isParticipant, memberFromSave } from "./server";
export { COOP_PROTOCOL_VERSION, newLobbyCode } from "./protocol";
export type { CoopCommand, CoopMember, CoopRequest, CoopResponse, CoopRow } from "./protocol";
