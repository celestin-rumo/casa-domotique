import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";

const URL = import.meta.env.VITE_HA_URL as string;
const TOKEN = import.meta.env.VITE_HA_TOKEN as string;

let connection: Connection | null = null;

export async function connect(): Promise<Connection> {
  if (connection) return connection;
  const auth = createLongLivedTokenAuth(URL, TOKEN);
  connection = await createConnection({ auth });
  return connection;
}

// Reçoit toutes les entités et leurs mises à jour en temps réel.
export function onEntities(cb: (entities: HassEntities) => void) {
  return connect().then((conn) => subscribeEntities(conn, cb));
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
