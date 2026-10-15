import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { TroveError } from "../core/errors.ts";
import { regulation, TOPICS, type Topic } from "../core/regulation/regulation.ts";
import { renderNewDocument } from "../core/templates/new-document.ts";
import { type Context, openFor } from "./context.ts";

const MARKDOWN = "text/markdown";

const isTopic = (value: string): value is Topic => TOPICS.some((topic) => topic === value);

const single = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** Resources read the store of the server's working folder. */
export const registerResources = (server: McpServer, context: Context): void => {
  server.registerResource(
    "regulation",
    new ResourceTemplate("trove://regulation/{topic}", {
      list: async () => ({
        resources: TOPICS.map((topic) => ({
          uri: `trove://regulation/${topic}`,
          name: `regulation: ${topic}`,
          mimeType: MARKDOWN,
        })),
      }),
    }),
    { description: "How this store works, generated from its config", mimeType: MARKDOWN },
    async (uri, { topic }) => {
      const name = single(topic);
      if (!isTopic(name))
        throw new TroveError(`unknown topic ${name}; one of ${TOPICS.join(", ")}`);
      const store = await openFor(context, undefined);
      return { contents: [{ uri: uri.href, text: regulation(store.config, store.rules, name) }] };
    },
  );

  server.registerResource(
    "config",
    "trove://config",
    { description: "The store's trove.yaml", mimeType: "application/yaml" },
    async (uri) => {
      const store = await openFor(context, undefined);
      return { contents: [{ uri: uri.href, text: await Bun.file(store.configPath).text() }] };
    },
  );

  server.registerResource(
    "template",
    new ResourceTemplate("trove://template/{type}", { list: undefined }),
    { description: "What a new document of a type starts as", mimeType: MARKDOWN },
    async (uri, { type }) => {
      const store = await openFor(context, undefined);
      const name = single(type);
      if (!store.config.types[name]) throw new TroveError(`unknown type ${name}`);
      const text = renderNewDocument(store.config, {
        type: name,
        name: "<NAME>",
        title: "<topic>",
        status: store.config.types[name]?.initial ?? Object.keys(store.config.statuses)[0] ?? "",
        date: store.index.today,
        fields: [],
      });
      return { contents: [{ uri: uri.href, text }] };
    },
  );
};
