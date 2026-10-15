/** Markdown imported with `with { type: "text" }` is its source text. */
declare module "*.md" {
  const text: string;
  export default text;
}
