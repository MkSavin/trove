import { styleText } from "node:util";
import type { Io } from "../io.ts";

type Format = Parameters<typeof styleText>[0];

export type Paint = (format: Format, text: string) => string;

export const painter =
  (io: Io): Paint =>
  (format, text) =>
    io.color ? styleText(format, text, { validateStream: false }) : text;
