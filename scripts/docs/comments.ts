export type Comment = {
  kind: "line" | "block";
  /** 1-based, like `endLine`. */
  line: number;
  endLine: number;
  text: string;
  /** Nothing but the comment on its first line. */
  alone: boolean;
};

const REGEX_MAY_FOLLOW =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|void|await|yield))$/;

const skipString = (text: string, from: number): number => {
  const quote = text[from];
  let at = from + 1;
  while (at < text.length && text[at] !== quote && text[at] !== "\n") {
    at += text[at] === "\\" ? 2 : 1;
  }
  return at + 1;
};

const skipRegex = (text: string, from: number): number => {
  let inClass = false;
  let at = from + 1;
  while (at < text.length && text[at] !== "\n") {
    const char = text[at];
    if (char === "\\") at++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) break;
    at++;
  }
  return at + 1;
};

const lineAt = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

const isAlone = (text: string, offset: number): boolean =>
  text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset).trim() === "";

/** Every comment of a TypeScript text; strings, templates and regular expressions are skipped. */
export const scanComments = (text: string): Comment[] => {
  const comments: Comment[] = [];
  const templates: number[] = [];
  let depth = 0;
  let last = -1;
  let at = 0;

  const skipTemplate = (from: number): number => {
    for (let i = from; i < text.length; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === "`") return i + 1;
      else if (text[i] === "$" && text[i + 1] === "{") {
        templates.push(depth++);
        return i + 2;
      }
    }
    return text.length;
  };

  const take = (kind: Comment["kind"], end: number, inner: string): void => {
    comments.push({
      kind,
      line: lineAt(text, at),
      endLine: lineAt(text, end),
      text: inner,
      alone: isAlone(text, at),
    });
    at = end;
  };

  while (at < text.length) {
    const char = text[at] ?? "";
    const next = text[at + 1];
    if (char === "/" && next === "/") {
      const end = text.indexOf("\n", at);
      const stop = end < 0 ? text.length : end;
      take("line", stop, text.slice(at + 2, stop));
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", at + 2);
      const stop = end < 0 ? text.length : end + 2;
      take("block", stop, text.slice(at + 2, stop - 2));
      continue;
    }
    if (char === '"' || char === "'") at = skipString(text, at);
    else if (char === "`") at = skipTemplate(at + 1);
    else if (char === "/" && REGEX_MAY_FOLLOW.test(text.slice(Math.max(0, last - 7), last + 1))) {
      at = skipRegex(text, at);
    } else {
      if (char === "{") depth++;
      if (char === "}" && templates.at(-1) === --depth) {
        templates.pop();
        at = skipTemplate(at + 1);
      } else {
        if (char.trim() !== "") last = at;
        at++;
      }
      continue;
    }
    last = at - 1;
  }
  return comments;
};
