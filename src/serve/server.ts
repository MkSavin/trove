import { basename } from "node:path";
import type { Server } from "bun";
import { TroveError } from "../core/errors.ts";
import type { StoreIndex } from "../core/index/index.ts";
import { escapeHtml, layout } from "./html.ts";
import { documentPage } from "./pages/document.ts";
import type { Page } from "./pages/page.ts";
import { documentsPage, itemsPage } from "./pages/query.ts";
import { summariesPage } from "./pages/summaries.ts";

export type ServeOptions = {
  /** 0 picks a free port. */
  port: number;
  /** Called on every request, so pages show the files as they are now. */
  open: () => Promise<StoreIndex>;
};

const HOSTNAME = "127.0.0.1";
const DOC_PREFIX = "/doc/";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};

const route = async (index: StoreIndex, url: URL): Promise<Page> => {
  if (url.pathname === "/") return documentsPage(index, url.searchParams);
  if (url.pathname === "/items") return itemsPage(index, url.searchParams);
  if (url.pathname === "/summaries") return summariesPage(index, url.searchParams);
  if (url.pathname.startsWith(DOC_PREFIX)) {
    return documentPage(index, decodeURIComponent(url.pathname.slice(DOC_PREFIX.length)));
  }
  return { title: "Not found", body: "<p>No such page.</p>", status: 404 };
};

const html = (store: string, page: Page): Response =>
  new Response(layout(store, page.title, page.body), {
    status: page.status ?? 200,
    headers: HEADERS,
  });

/** Another Host means a foreign site reached the port through its own domain name. */
const isOwnHost = (host: string | null, port: number | undefined): boolean =>
  host === `${HOSTNAME}:${port}` || host === `localhost:${port}`;

const respond = async (request: Request, server: Server<undefined>, options: ServeOptions) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("read-only", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  if (!isOwnHost(request.headers.get("host"), server.port)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const index = await options.open();
    return html(basename(index.root), await route(index, new URL(request.url)));
  } catch (error) {
    if (!(error instanceof TroveError || error instanceof URIError)) throw error;
    return html("trove", {
      title: "Error",
      body: `<p class="error">${escapeHtml(error.message)}</p>`,
      status: 400,
    });
  }
};

/** A read-only dashboard of the store, reachable from this machine only. */
export const serveStore = (options: ServeOptions): Server<undefined> =>
  Bun.serve({
    hostname: HOSTNAME,
    port: options.port,
    development: false,
    fetch: (request, server) => respond(request, server, options),
    error: (error) => {
      console.error(error);
      return new Response("internal error", { status: 500 });
    },
  });
