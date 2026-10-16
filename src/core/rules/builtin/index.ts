import type { Rule } from "../rule.ts";
import { duplicateSuspect } from "./duplicates.ts";
import { fieldFormat, requiredField, unknownField } from "./fields.ts";
import { folderType } from "./folders.ts";
import { stale } from "./freshness.ts";
import { frontMatter } from "./front-matter.ts";
import {
  duplicateId,
  idFormat,
  idHyphen,
  itemEnum,
  ledgerBlock,
  ledgerColumns,
  ledgerRowShape,
} from "./ledger.ts";
import { deadLink } from "./links.ts";
import { liveBlock, liveBlockStale, writePlace } from "./live.ts";
import { archiveStatus, lifecycle } from "./placement.ts";
import { promptBody } from "./prompt.ts";
import { headerRefs } from "./references.ts";
import { itemSize } from "./size.ts";
import { staleCheck } from "./stale-check.ts";
import { statusLine } from "./status-line.ts";
import { knownStatus, knownType, typeStatus } from "./vocabulary.ts";
import { deferralLifted, waitRefs } from "./waiting.ts";

export const builtinRules: readonly Rule[] = [
  frontMatter,
  requiredField,
  fieldFormat,
  unknownField,
  knownType,
  knownStatus,
  typeStatus,
  archiveStatus,
  lifecycle,
  statusLine,
  ledgerBlock,
  ledgerColumns,
  ledgerRowShape,
  idHyphen,
  idFormat,
  itemEnum,
  duplicateId,
  itemSize,
  duplicateSuspect,
  promptBody,
  headerRefs,
  folderType,
  deadLink,
  liveBlock,
  liveBlockStale,
  writePlace,
  waitRefs,
  deferralLifted,
  stale,
  staleCheck,
];
