// Cloudflare Worker - proxy TMDB pour Bobine.
//
// Role : garder la cle TMDB cote serveur (dans un secret Cloudflare) pour
// qu'elle ne soit JAMAIS visible dans le code livre au navigateur. L'app
// appelle ce Worker au lieu d'appeler TMDB directement ; le Worker relaie la
// requete en ajoutant l'authentification.
//
// Ce fichier ne contient aucun secret : il peut rester public dans le depot.
// Deploiement (gratuit, sans carte bancaire) : voir worker/README.md.

const TMDB = 'https://api.themoviedb.org/3';

// Restreint l'usage a l'origine de ton app pour eviter que d'autres consomment
// ton quota. Mets l'URL de ton app (ex: 'https://bobine.pages.dev'), ou laisse
// '*' pour autoriser tout le monde.
const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    // Le chemin recu (ex: /movie/123) est relaye tel quel vers TMDB /3.
    const url = new URL(request.url);
    const target = new URL(TMDB + url.pathname + url.search);

    // Authentification : jeton v4 (Bearer) si defini, sinon cle v3 en query.
    // On definit l'un OU l'autre en secret Cloudflare (voir README).
    const headers = { accept: 'application/json' };
    if (env.TMDB_TOKEN) {
      headers.Authorization = `Bearer ${env.TMDB_TOKEN}`;
    } else if (env.TMDB_KEY) {
      target.searchParams.set('api_key', env.TMDB_KEY);
    } else {
      return new Response(
        JSON.stringify({ error: 'Worker mal configure : definis TMDB_TOKEN ou TMDB_KEY.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const res = await fetch(target, { headers });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
