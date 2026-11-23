import { z } from "zod";

import { isValidIsoDate } from "@/lib/date";
import { DICE_SKILL_MAX_LENGTH, normalizeSkill } from "@/lib/diceSkill";

/** Maximum length of `DiceEvent.importKey`. */
const IMPORT_KEY_MAX_LENGTH = 120;

/** One critical/fumble as the Excel export holds it. */
const excelEntrySchema = z.object({
  habilidad: z.string(),
  fecha: z.string(),
  hora: z.string().nullish(),
  celda: z.string().min(1),
  arco: z.number().int().positive().nullish(),
});

/** The Excel export: player → campaign → critico/pifia → entries. */
export const excelHistorySchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      critico: z.array(excelEntrySchema).default([]),
      pifia: z.array(excelEntrySchema).default([]),
    }),
  ),
);

export type ExcelHistory = z.infer<typeof excelHistorySchema>;

/**
 * The operator's decisions about what in the Excel is what in the app. Names are
 * the Excel's; a `null` target is an explicit "do not import this" (it shows up
 * in the report as skipped, and does not block the import).
 */
export const importMappingSchema = z.object({
  /** Email or exact name of the user the imported rows are attributed to (`createdBy`). */
  importedBy: z.string().min(1),
  /** Excel campaign name → exact name of the app's campaign, or `null` to skip it. */
  campaigns: z.record(z.string(), z.string().min(1).nullable()),
  /** Excel player name → the user's email or exact name, or `null` to skip them. */
  players: z.record(z.string(), z.string().min(1).nullable()),
  /** Skill clean-up: normalised Excel skill → the skill to store. */
  skills: z.record(z.string(), z.string().min(1)).default({}),
  /** "Player|Campaign" pairs (Excel names) to skip, e.g. a player who is not in that campaign. */
  skipPairs: z.array(z.string()).default([]),
});

export type ImportMapping = z.infer<typeof importMappingSchema>;

/** What the plan needs to know about the app's current state. */
export type ImportWorld = {
  campaigns: { id: string; name: string }[];
  users: { id: string; name: string; email: string }[];
  /** "campaignId:userId" for every membership. */
  memberships: Set<string>;
  /** Arc numbers each campaign already has. */
  arcNumbers: Map<string, Set<number>>;
  /** `importKey` values already stored. */
  existingKeys: Set<string>;
  /** "YYYY-MM-DD" of today. */
  today: string;
};

/** A row ready to insert. */
export type PlannedRow = {
  importKey: string;
  campaignId: string;
  userId: string;
  kind: "CRITICAL" | "FUMBLE";
  skill: string;
  date: string;
  time: string | null;
  arcNumber: number | null;
  source: { player: string; campaign: string; cell: string };
};

/** Something the operator has to look at. `blocking` ones stop `--apply`. */
export type ImportIssue = {
  blocking: boolean;
  message: string;
};

export type ImportPlan = {
  rows: PlannedRow[];
  arcsToCreate: { campaignId: string; number: number }[];
  /** Excel player/campaign groups left out on purpose, with how many entries. */
  skipped: { player: string; campaign: string; entries: number; reason: string }[];
  alreadyImported: number;
  issues: ImportIssue[];
  /** Normalised skill → how many rows use it, to build the `skills` mapping. */
  skills: Map<string, number>;
};

/**
 * Resolves a user from an email or an exact name (case-insensitive). Email wins;
 * a name shared by several users is ambiguous and resolves to nothing.
 *
 * @param {ImportWorld["users"]} users - Every user of the app.
 * @param {string} ref - Email or exact name.
 * @returns {{ id: string } | "ambiguous" | null} The user, or why not.
 */
function resolveUser(
  users: ImportWorld["users"],
  ref: string,
): { id: string } | "ambiguous" | null {
  const needle = ref.trim().toLowerCase();
  const byEmail = users.filter((u) => u.email.toLowerCase() === needle);
  if (byEmail.length === 1) {
    return byEmail[0];
  }
  const byName = users.filter((u) => u.name.trim().toLowerCase() === needle);
  if (byName.length === 1) {
    return byName[0];
  }
  return byName.length > 1 ? "ambiguous" : null;
}

/**
 * Turns the Excel export plus the operator's mapping into what an import would
 * do, without touching the database: the rows to insert, the arcs to create,
 * what is skipped and every problem found. Nothing here is lenient about the
 * data: an unmapped campaign or player, a player outside the campaign, a bad
 * date or time and a duplicate key are all blocking issues, so a run that
 * reports none is safe to apply. Rows whose key is already stored are counted
 * and left out, which makes re-running harmless.
 *
 * @param {ExcelHistory} history - The parsed Excel export.
 * @param {ImportMapping} mapping - The operator's mapping.
 * @param {ImportWorld} world - The app's current campaigns, users, memberships and keys.
 * @returns {ImportPlan} What the import would do and what is wrong.
 */
export function planDiceEventImport(
  history: ExcelHistory,
  mapping: ImportMapping,
  world: ImportWorld,
): ImportPlan {
  const plan: ImportPlan = {
    rows: [],
    arcsToCreate: [],
    skipped: [],
    alreadyImported: 0,
    issues: [],
    skills: new Map(),
  };
  const block = (message: string) => plan.issues.push({ blocking: true, message });
  const warn = (message: string) => plan.issues.push({ blocking: false, message });

  const skillMap = new Map(Object.entries(mapping.skills).map(([k, v]) => [normalizeSkill(k), normalizeSkill(v)]));
  const skipPairs = new Set(mapping.skipPairs.map((pair) => pair.trim().toLowerCase()));
  const seenKeys = new Set<string>();
  const arcsWanted = new Map<string, Set<number>>();
  const unmappedPlayers = new Set<string>();
  const unmappedCampaigns = new Set<string>();

  const importer = resolveUser(world.users, mapping.importedBy);
  if (importer === null || importer === "ambiguous") {
    block(`"importedBy" (${mapping.importedBy}) does not match exactly one user.`);
  }

  for (const [player, campaigns] of Object.entries(history)) {
    for (const [campaign, kinds] of Object.entries(campaigns)) {
      const entries = [
        ...kinds.critico.map((entry) => ({ entry, kind: "CRITICAL" as const })),
        ...kinds.pifia.map((entry) => ({ entry, kind: "FUMBLE" as const })),
      ];
      if (entries.length === 0) {
        continue;
      }

      // Resolve the campaign.
      if (!(campaign in mapping.campaigns)) {
        if (!unmappedCampaigns.has(campaign)) {
          unmappedCampaigns.add(campaign);
          block(`Campaign "${campaign}" is not in the mapping.`);
        }
        continue;
      }
      const campaignTarget = mapping.campaigns[campaign];
      if (campaignTarget === null) {
        plan.skipped.push({ player, campaign, entries: entries.length, reason: "campaign skipped in the mapping" });
        continue;
      }
      const matches = world.campaigns.filter((c) => c.name.trim().toLowerCase() === campaignTarget.trim().toLowerCase());
      if (matches.length !== 1) {
        if (!unmappedCampaigns.has(campaign)) {
          unmappedCampaigns.add(campaign);
          block(`Campaign "${campaign}" → "${campaignTarget}" matches ${matches.length} campaigns in the app.`);
        }
        continue;
      }
      const campaignId = matches[0].id;

      // Resolve the player.
      if (!(player in mapping.players)) {
        if (!unmappedPlayers.has(player)) {
          unmappedPlayers.add(player);
          block(`Player "${player}" is not in the mapping.`);
        }
        continue;
      }
      const playerTarget = mapping.players[player];
      if (playerTarget === null) {
        plan.skipped.push({ player, campaign, entries: entries.length, reason: "player skipped in the mapping" });
        continue;
      }
      if (skipPairs.has(`${player}|${campaign}`.toLowerCase())) {
        plan.skipped.push({ player, campaign, entries: entries.length, reason: "pair skipped in the mapping" });
        continue;
      }
      const user = resolveUser(world.users, playerTarget);
      if (user === null || user === "ambiguous") {
        if (!unmappedPlayers.has(player)) {
          unmappedPlayers.add(player);
          block(
            `Player "${player}" → "${playerTarget}" ${user === "ambiguous" ? "matches several users" : "matches no user"}.`,
          );
        }
        continue;
      }
      if (!world.memberships.has(`${campaignId}:${user.id}`)) {
        block(
          `"${player}" is not a member of "${campaignTarget}" in the app (${entries.length} entries). Add them to the campaign, or list "${player}|${campaign}" in skipPairs.`,
        );
        continue;
      }

      for (const { entry, kind } of entries) {
        const where = `${player} / ${campaign} / ${entry.celda}`;
        const importKey = `excel:${player}:${campaign}:${entry.celda}`;

        const rawSkill = normalizeSkill(entry.habilidad);
        const skill = skillMap.get(rawSkill) ?? rawSkill;
        if (skill === "" || skill.length > DICE_SKILL_MAX_LENGTH) {
          block(`${where}: skill "${entry.habilidad}" is empty or longer than ${DICE_SKILL_MAX_LENGTH} characters.`);
          continue;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.fecha) || !isValidIsoDate(entry.fecha)) {
          block(`${where}: invalid date "${entry.fecha}".`);
          continue;
        }
        const time = entry.hora && entry.hora.trim() !== "" ? entry.hora.trim() : null;
        if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
          block(`${where}: invalid time "${entry.hora}".`);
          continue;
        }
        if (importKey.length > IMPORT_KEY_MAX_LENGTH) {
          block(`${where}: import key longer than ${IMPORT_KEY_MAX_LENGTH} characters.`);
          continue;
        }
        if (seenKeys.has(importKey)) {
          block(`${where}: the same cell appears twice in the file.`);
          continue;
        }
        seenKeys.add(importKey);

        if (entry.fecha > world.today) {
          warn(`${where}: date ${entry.fecha} is in the future.`);
        }
        if (world.existingKeys.has(importKey)) {
          plan.alreadyImported += 1;
          continue;
        }

        const arcNumber = entry.arco ?? null;
        if (arcNumber !== null) {
          const known = world.arcNumbers.get(campaignId) ?? new Set<number>();
          if (!known.has(arcNumber)) {
            const wanted = arcsWanted.get(campaignId) ?? new Set<number>();
            wanted.add(arcNumber);
            arcsWanted.set(campaignId, wanted);
          }
        }

        plan.skills.set(skill, (plan.skills.get(skill) ?? 0) + 1);
        plan.rows.push({
          importKey,
          campaignId,
          userId: user.id,
          kind,
          skill,
          date: entry.fecha,
          time,
          arcNumber,
          source: { player, campaign, cell: entry.celda },
        });
      }
    }
  }

  for (const [campaignId, numbers] of arcsWanted) {
    for (const number of [...numbers].sort((a, b) => a - b)) {
      plan.arcsToCreate.push({ campaignId, number });
    }
  }

  return plan;
}

/**
 * Renders a plan as the plain-text report the operator reads before applying:
 * the problems first (blocking ones marked), then what would be written per
 * campaign, what is skipped, and the skills with their counts (the raw
 * material for the `skills` mapping).
 *
 * @param {ImportPlan} plan - The plan to describe.
 * @param {ImportWorld} world - The app's state, to name campaigns.
 * @returns {string} The report, newline separated.
 */
export function formatImportReport(plan: ImportPlan, world: ImportWorld): string {
  const lines: string[] = [];
  const campaignName = (id: string) => world.campaigns.find((c) => c.id === id)?.name ?? id;
  const blocking = plan.issues.filter((issue) => issue.blocking);

  lines.push(`Issues: ${blocking.length} blocking, ${plan.issues.length - blocking.length} warnings`);
  for (const issue of plan.issues) {
    lines.push(`  ${issue.blocking ? "[BLOCKING]" : "[warning] "} ${issue.message}`);
  }

  lines.push("", `To insert: ${plan.rows.length} (already imported: ${plan.alreadyImported})`);
  const perCampaign = new Map<string, { critical: number; fumble: number }>();
  for (const row of plan.rows) {
    const counts = perCampaign.get(row.campaignId) ?? { critical: 0, fumble: 0 };
    counts[row.kind === "CRITICAL" ? "critical" : "fumble"] += 1;
    perCampaign.set(row.campaignId, counts);
  }
  for (const [id, counts] of perCampaign) {
    lines.push(`  ${campaignName(id)}: ${counts.critical} critical, ${counts.fumble} fumble`);
  }

  lines.push("", `Arcs to create: ${plan.arcsToCreate.length}`);
  for (const arc of plan.arcsToCreate) {
    lines.push(`  ${campaignName(arc.campaignId)}: arc ${arc.number}`);
  }

  lines.push("", `Skipped on purpose: ${plan.skipped.reduce((sum, item) => sum + item.entries, 0)} entries`);
  for (const item of plan.skipped) {
    lines.push(`  ${item.player} / ${item.campaign}: ${item.entries} (${item.reason})`);
  }

  lines.push("", `Skills (${plan.skills.size} distinct):`);
  for (const [skill, count] of [...plan.skills].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`  ${String(count).padStart(4)}  ${skill}`);
  }

  return lines.join("\n");
}
