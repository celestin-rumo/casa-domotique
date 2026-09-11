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

// Le script joue la playlist — un nom de la table ou une adresse de la
// bibliothèque — et en laisse l'écho dans input_text.playlist_courante (plus
// input_select.playlist pour un nom de la table). C'est cet écho, reçu par
// subscribeEntities, qui dit ce qui joue — pas cet appel.
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

// Les réglages en texte : la courbe du réveil, ses lumières, sa playlist,
// les playlists épinglées. 255 caractères au plus — c'est Home Assistant
// qui refuse au-delà, et le refus remonte comme une faute.
export async function setText(entityId: string, value: string) {
  const conn = await connect();
  await callService(conn, "input_text", "set_value", { entity_id: entityId, value });
}

export async function setSelect(entityId: string, option: string) {
  const conn = await connect();
  await callService(conn, "input_select", "select_option", { entity_id: entityId, option });
}

// --- La bibliothèque de Music Assistant ---
//
// get_library est un service qui RÉPOND : il se demande avec return_response,
// et il veut l'entrée de configuration de Music Assistant, qu'on ne connaît
// qu'en la demandant à Home Assistant. Elle ne change pas pendant la vie de
// l'app — une seule demande, gardée tant qu'elle réussit.
export type PlaylistBib = { uri: string; name: string; image?: string | null };

let entreeMA: Promise<string> | null = null;

function entreeMusicAssistant(): Promise<string> {
  if (!entreeMA) {
    entreeMA = connect().then(async (conn) => {
      const entrees = await conn.sendMessagePromise<{ entry_id: string; state: string }[]>({
        type: "config_entries/get",
        domain: "music_assistant",
      });
      const e = entrees.find((x) => x.state === "loaded") ?? entrees[0];
      if (!e) throw new Error("Music Assistant n'est pas relié à Home Assistant");
      return e.entry_id;
    });
    // Un échec ne reste pas en mémoire : la prochaine demande réessaie.
    entreeMA.catch(() => (entreeMA = null));
  }
  return entreeMA;
}

// Toute la bibliothèque d'un coup — plus de cent playlists sur ce compte, une
// seconde de Music Assistant —, puis la recherche se fait sur le natel, lettre
// par lettre, sans repasser par le Pi. Une playlist sans nom, Music Assistant
// en garde, n'a rien à afficher.
export async function bibliotheque(limite = 1000): Promise<PlaylistBib[]> {
  const conn = await connect();
  const config_entry_id = await entreeMusicAssistant();
  const r = (await callService(
    conn,
    "music_assistant",
    "get_library",
    { config_entry_id, media_type: "playlist", limit: limite },
    undefined,
    true,
  )) as { response?: { items?: PlaylistBib[] } };
  return (r.response?.items ?? []).filter((p) => p.name?.trim());
}

// script.turn_on rend la main tout de suite : appeler le script par son
// propre service bloquerait l'appel jusqu'à la fin — vingt minutes pour un
// lever de soleil. Les variables sont celles que le script déclare en fields.
export async function runScript(entityId: string, variables?: Record<string, unknown>) {
  const conn = await connect();
  await callService(conn, "script", "turn_on", { entity_id: entityId, ...(variables ? { variables } : {}) });
}

// --- Enregistrer une ambiance : le seul endroit où l'app fait du REST ---
//
// Home Assistant n'expose pas l'écriture des scènes par WebSocket : son
// propre éditeur passe par POST /api/config/scene/config/<id>, et c'est le
// seul chemin qui persiste dans /config/scenes.yaml. `scene.create` existe
// bien en service, mais il fabrique une scène en mémoire, perdue au
// redémarrage — inutilisable ici.
//
// D'où le seul usage du REST dans toute l'app — lire la scène, puis
// l'écrire — et sa conséquence : le CORS s'applique, contrairement aux
// WebSockets. Servie par Home Assistant depuis
// /local/casa/, l'app est sur la même origine et rien n'est à régler. En
// développement, sur localhost:5173, il faut déclarer l'origine dans
// Paramètres → Système → Réseau — et surtout pas par un bloc « http: » en
// YAML, déprécié depuis HA 2026.x (docs/architecture.md).
//
// L'état est lu tel que Home Assistant le donne, pas tel que l'app le croit :
// ce sont ses attributs qui deviennent la scène.

export type EtatLumiere = { state: string; attributes: Record<string, unknown> };

// Ce qu'une scène retient d'une lampe allumée : ce qui décrit l'ambiance, pas
// l'ampoule. L'éditeur de Home Assistant, lui, stocke tout — friendly_name,
// supported_features, la liste des effets — et les ignore à l'application ;
// les écarter ici garde simplement la scène lisible.
//
// `color_mode` n'est pas un détail : c'est lui qui dit à Home Assistant
// laquelle des couleurs appliquer quand la scène en porte plusieurs. Sans
// lui, une Hue réglée en xy peut revenir dans une autre teinte. Et
// `rgbw_color` est la seule couleur des ampoules WiZ.
const RETENUS = [
  "brightness", "color_mode", "color_temp_kelvin",
  "rgb_color", "rgbw_color", "rgbww_color", "hs_color", "xy_color", "effect",
];

export function scenePourLumieres(
  lumieres: string[],
  etats: Record<string, EtatLumiere | undefined>,
): Record<string, Record<string, unknown>> {
  const entities: Record<string, Record<string, unknown>> = {};
  for (const id of lumieres) {
    const e = etats[id];
    if (!e) continue; // une lampe absente n'entre pas dans la scène
    if (e.state !== "on") {
      entities[id] = { state: "off" };
      continue;
    }
    const garde: Record<string, unknown> = { state: "on" };
    for (const cle of RETENUS) {
      const v = e.attributes[cle];
      if (v !== undefined && v !== null) garde[cle] = v;
    }
    entities[id] = garde;
  }
  return entities;
}

type ConfigScene = { id: string; name: string; entities: Record<string, unknown>; [cle: string]: unknown };

// Un fetch que le CORS bloque ne reçoit aucune réponse : il échoue avant,
// sur une TypeError. C'est donc là, et pas sur un code HTTP, qu'on le
// reconnaît — avec son jumeau indiscernable, le Pi injoignable.
async function requete(chemin: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${HA_URL}${chemin}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error("requête bloquée — origine à déclarer dans Paramètres → Système → Réseau, ou Pi injoignable");
  }
}

// Fusionner, jamais remplacer. La scène peut porter des lumières que l'app
// ne connaît pas — ajoutées dans l'interface de Home Assistant, absentes de
// config.ts — ainsi qu'une icône et des métadonnées posées par l'éditeur.
// Réécrire la scène avec les seules lumières de l'app les effacerait toutes,
// sans un mot : l'enregistrement ne touche donc qu'à ce qu'il connaît.
//
// `renommer` : le nom de la scène suit celui qu'on vient de donner — pour une
// ambiance ajoutée depuis l'app, dont le nom se change dans l'app. Les
// autres gardent le nom que Home Assistant leur connaît.
export async function enregistrerScene(
  sceneId: string,
  nom: string,
  lumieres: Record<string, Record<string, unknown>>,
  renommer = false,
) {
  const chemin = `/api/config/scene/config/${encodeURIComponent(sceneId)}`;
  const lue = await requete(chemin);
  if (!lue.ok && lue.status !== 404) {
    throw new Error(`Home Assistant refuse de lire la scène (${lue.status})`);
  }
  const existante: ConfigScene | null = lue.ok ? await lue.json() : null;
  const scene: ConfigScene = existante ?? { id: sceneId, name: nom, entities: {} };
  scene.entities = { ...scene.entities, ...lumieres };
  if (renommer) scene.name = nom;

  const r = await requete(chemin, { method: "POST", body: JSON.stringify(scene) });
  if (!r.ok) throw new Error(`Home Assistant a refusé l'enregistrement (${r.status})`);
}

// Retirer la scène d'une ambiance ajoutée qu'on supprime : le même chemin,
// en DELETE, que l'éditeur de Home Assistant. Une scène déjà absente — jamais
// enregistrée, ou retirée dans l'interface — n'est pas une erreur : ce qu'on
// voulait est fait.
export async function supprimerScene(sceneId: string) {
  const r = await requete(`/api/config/scene/config/${encodeURIComponent(sceneId)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`Home Assistant refuse de retirer la scène (${r.status})`);
}

// L'aller-retour WebSocket, en millisecondes — ce que l'écran Réglages affiche.
export async function latence(): Promise<number> {
  const conn = await connect();
  const debut = performance.now();
  await conn.ping();
  return Math.round(performance.now() - debut);
}
