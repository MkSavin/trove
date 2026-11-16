import migrateSkill from "../../plugin/skills/trove-migrate/SKILL.md" with { type: "text" };
import storeSkill from "../../plugin/skills/trove-store/SKILL.md" with { type: "text" };

/** The skills shipped with the assistant plugins, bundled so every client gets the same text. */
export const SKILLS: Readonly<Record<string, string>> = {
  "trove-store": storeSkill,
  "trove-migrate": migrateSkill,
};
