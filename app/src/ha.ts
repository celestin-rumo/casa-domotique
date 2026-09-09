import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService,
  ERR_CONNECTION_LOST,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";

export const HA_URL = import.meta.env.VITE_HA_URL as string;
const TOKEN = import.meta.env.VITE_HA_TOKEN as string;

// Ce qu'on nomme quand ça ne répond pas : l'hôte, jamais « le serveur ».
export const HOTE = (() => {
  try {
    return new URL(HA_URL).host;
  } catch {
    return HA_URL;
  }
})();

let connection: Connection | null = null;

export async function connect(): Promise<Connection> {
  if (connection) return connection;
  const auth = createLongLivedTokenAuth(HA_URL, TOKEN);
  connection = await createConnection({ auth });
  return connection;
}

// Reçoit toutes les entités et leurs mises à jour en temps réel.
export function onEntities(cb: (entities: HassEntities) => void) {
  return connect().then((conn) => subscribeEntities(conn, cb));
}

export type Liaison = "connexion" | "ok" | "perdu" | "erreur";

// La librairie se reconnecte toute seule ; ce qu'elle ne fait pas, c'est le
// dire. Sans ces écouteurs, le point reste vert natel débranché du Wi-Fi.
export function onLiaison(cb: (etat: Liaison) => void) {
  return connect().then((conn) => {
    const perdu = () => cb("perdu");
    const ok = () => cb("ok");
    conn.addEventListener("disconnected", perdu);
    conn.addEventListener("reconnect-error", perdu);
    conn.addEventListener("ready", ok);
    return () => {
      conn.removeEventListener("disconnected", perdu);
      conn.removeEventListener("reconnect-error", perdu);
      conn.removeEventListener("ready", ok);
    };
  });
}

// Un service qui échoue rejette soit avec un simple numéro d'erreur de la
// librairie, soit avec la réponse entière de Home Assistant — l'enveloppe
// { type, success, error: { code, message } }, vérifié en coupant le Pi,
// et non le seul { code, message }. On en tire une phrase.
export function messageDe(e: unknown): string {
  if (e === ERR_CONNECTION_LOST) return "connexion perdue";
  if (typeof e === "number") return `erreur ${e}`;
  const err = (e && typeof e === "object" && "error" in e ? (e as { error: unknown }).error : e) as
    | { code?: unknown; message?: unknown }
    | null
    | undefined;
  if (err && typeof err === "object" && err.message) return String(err.message);
  if (err && typeof err === "object" && err.code) return `erreur ${String(err.code)}`;
  return String(e);
}

export async function activateScene(entityId: string) {
  const conn = await connect();
  const domain = entityId.startsWith("script.") ? "script" : "scene";
  await callService(conn, domain, "turn_on", { entity_id: entityId });
}

export async function setVolume(entityId: string, level: number) {
  const conn = await connect();
  await callService(conn, "media_player", "volume_set", {
    entity_id: entityId,
    volume_level: level,
  });
}

// Le script joue la playlist ET met à jour input_select.playlist ; c'est cet
// écho, reçu par subscribeEntities, qui confirme le choix — pas cet appel.
export async function playPlaylist(name: string, player: string) {
  const conn = await connect();
  await callService(conn, "script", "play_playlist", { name, player });
}

export async function toggleLight(entityId: string) {
  const conn = await connect();
  await callService(conn, "light", "toggle", { entity_id: entityId });
}

export type ReglageLumiere = {
  brightness?: number; // 1–255
  color_temp_kelvin?: number;
  hs_color?: [number, number];
};

// Régler sans allumer n'existe pas dans Home Assistant : turn_on avec un
// réglage, c'est le réglage. L'ampoule s'allume si elle ne l'était pas.
export async function setLight(entityId: string, reglage: ReglageLumiere) {
  const conn = await connect();
  await callService(conn, "light", "turn_on", { entity_id: entityId, ...reglage });
}

export async function mediaPlayPause(entityId: string) {
  const conn = await connect();
  await callService(conn, "media_player", "media_play_pause", { entity_id: entityId });
}

export async function mediaNext(entityId: string) {
  const conn = await connect();
  await callService(conn, "media_player", "media_next_track", { entity_id: entityId });
}

// Le chef du groupe reçoit les membres ; une pièce qui cesse d'écouter se
// retire elle-même. C'est la sémantique de media_player.join / unjoin.
export async function joinPlayers(chef: string, membres: string[]) {
  const conn = await connect();
  await callService(conn, "media_player", "join", { entity_id: chef, group_members: membres });
}

export async function unjoinPlayer(entityId: string) {
  const conn = await connect();
  await callService(conn, "media_player", "unjoin", { entity_id: entityId });
}

// Les trois réglages du réveil sont des helpers : on les écrit, et l'écho
// est l'état du helper lui-même.
export async function setTime(entityId: string, hhmm: string) {
  const conn = await connect();
  await callService(conn, "input_datetime", "set_datetime", { entity_id: entityId, time: `${hhmm}:00` });
}

export async function setBoolean(entityId: string, on: boolean) {
  const conn = await connect();
  await callService(conn, "input_boolean", on ? "turn_on" : "turn_off", { entity_id: entityId });
}

export async function setNumber(entityId: string, value: number) {
  const conn = await connect();
  await callService(conn, "input_number", "set_value", { entity_id: entityId, value });
}

// script.turn_on rend la main tout de suite : appeler le script par son
// propre service bloquerait l'appel jusqu'à la fin — vingt minutes pour un
// lever de soleil. Les variables sont celles que le script déclare en fields.
export async function runScript(entityId: string, variables?: Record<string, unknown>) {
  const conn = await connect();
  await callService(conn, "script", "turn_on", { entity_id: entityId, ...(variables ? { variables } : {}) });
}

// L'aller-retour WebSocket, en millisecondes — ce que l'écran Réglages affiche.
export async function latence(): Promise<number> {
  const conn = await connect();
  const debut = performance.now();
  await conn.ping();
  return Math.round(performance.now() - debut);
}
