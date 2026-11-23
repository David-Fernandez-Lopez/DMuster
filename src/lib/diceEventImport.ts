import { z } from "zod";

import { isValidIsoDate } from "@/lib/date";
import { DICE_SKILL_MAX_LENGTH, normalizeSkill } from "@/lib/diceSkill";

/** Maximum length of `DiceEvent.importKey`. */
const IMPORT_KEY_MAX_LENGTH = 120;

/** One critical/fumble as the Excel export holds it. */
const excelEntrySchema = z
  .object({
    /** A readable name for the skill. Optional when `habilidad_original` is there. */
    habilidad: z.string().nullish(),
    /**
     * The text exactly as the Excel wrote it. When present it is what gets mapped (it is
     * what the mapping is keyed on); `habilidad` is then only a convenience reading.
     */
    habilidad_original: z.string().nullish(),
    /** The preparer's remark about how the entry was read; kept on the event. */
    nota: z.string().nullish(),
    fecha: z.string(),
    hora: z.string().nullish(),
    celda: z.string().min(1),
    arco: z.number().int().positive().nullish(),
  })
  .refine((entry) => ((entry.habilidad_original ?? entry.habilidad) ?? "").trim() !== "", {
    message: "an entry needs `habilidad_original` or `habilidad`",
    path: ["habilidad"],
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
  /**
   * Excel skill text (normalised: trimmed, upper case) → key of the entry in the
   * campaign's system catalogue (`"PERCEPCION": "PERCEPTION"`, `"DYING": "DYING"`).
   * For catalogue entries that take a detail, `"LORE: GUILD"` resolves on its own
   * from a `"LORE"` mapping: the prefix picks the entry, the rest becomes the detail.
   */
  skills: z.record(z.string(), z.string().min(1)).default({}),
  /**
   * Per-campaign adjustments to `skills`, by Excel campaign name: the same format, and
   * they win over `skills` for that campaign only. For when one text means something
   * different in another system (`"ATAQUE"` is `ATTACK` in Pathfinder, but Stormlight has
   * no such entry: `"Puente X": { "ATAQUE": "LIGHT_WEAPONRY" }`).
   */
  campaignSkills: z.record(z.string(), z.record(z.string(), z.string().min(1))).default({}),
  /** "Player|Campaign" pairs (Excel names) to skip, e.g. a player who is not in that campaign. */
  skipPairs: z.array(z.string()).default([]),
});

export type ImportMapping = z.infer<typeof importMappingSchema>;

/** What the plan needs to know about the app's current state. */
export type ImportWorld = {
  campaigns: { id: string; name: string; systemId: string | null }[];
  /** Each system's catalogue, by system id. */
  catalog: Map<string, { id: string; key: string; allowsDetail: boolean; requiresDetail: boolean; active: boolean }[]>;
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
  /** The Excel text that was mapped (what `habilidad_original` held, or `habilidad`). */
  originalText: string;
  /** The preparer's remark, or `null`. */
  note: string | null;
  /** The catalogue entry's id. */
  skillId: string;
  /** Its key, for the report. */
  skillKey: string;
  detail: string | null;
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
  /** Catalogue key → how many rows use it. */
  skills: Map<string, number>;
  /** Excel skill texts nobody mapped → how many entries use them: what to add to `skills`. */
  unmappedSkills: Map<string, number>;
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
 * Finds the catalogue entry an Excel skill text stands for. The text is looked
 * up in the mapping as it is. A mapped value is a catalogue key, optionally
 * followed by an explicit detail (`"CUSTOM_SKILL: FUERZA"`). Failing a direct
 * hit, a "PREFIX: detail" text whose prefix is mapped to an entry that takes a
 * detail splits into that entry and the detail ("LORE: GUILD" → Lore + "GUILD").
 *
 * @param {string} text - The Excel text, already normalised.
 * @param {Map<string, string>} skillMap - Normalised Excel text → catalogue key (or "KEY: detail").
 * @param {{ id: string; key: string; allowsDetail: boolean; requiresDetail: boolean; active: boolean }[]} catalog -
 *   The campaign's system catalogue.
 * @returns {{ id: string; key: string; detail: string | null } | "unmapped" | "missing" | "badDetail"} The
 *   entry; `"unmapped"` when the mapping says nothing about the text; `"missing"` when it names a key the
 *   system does not offer; `"badDetail"` when it gives a detail to an entry that takes none, or none to
 *   one that requires it.
 */
function resolveSkill(
  text: string,
  skillMap: Map<string, string>,
  catalog: { id: string; key: string; allowsDetail: boolean; requiresDetail: boolean; active: boolean }[],
): { id: string; key: string; detail: string | null } | "unmapped" | "missing" | "badDetail" {
  const direct = skillMap.get(text);
  if (direct !== undefined) {
    const colon = direct.indexOf(":");
    const key = (colon === -1 ? direct : direct.slice(0, colon)).trim();
    const detail = colon === -1 ? null : normalizeSkill(direct.slice(colon + 1)) || null;
    const entry = catalog.find((candidate) => candidate.key === key && candidate.active);
    if (!entry) {
      return "missing";
    }
    if ((detail !== null && !entry.allowsDetail) || (detail === null && entry.requiresDetail)) {
      return "badDetail";
    }
    return { id: entry.id, key: entry.key, detail };
  }

  const colon = text.indexOf(":");
  if (colon > 0) {
    const prefixKey = skillMap.get(text.slice(0, colon).trim());
    const detail = text.slice(colon + 1).trim();
    if (prefixKey !== undefined && detail !== "") {
      const entry = catalog.find((candidate) => candidate.key === prefixKey && candidate.active);
      if (!entry) {
        return "missing";
      }
      if (entry.allowsDetail) {
        return { id: entry.id, key: entry.key, detail };
      }
    }
  }
  return "unmapped";
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
    unmappedSkills: new Map(),
  };
  const block = (message: string) => plan.issues.push({ blocking: true, message });
  const warn = (message: string) => plan.issues.push({ blocking: false, message });

  const baseSkills = Object.entries(mapping.skills).map(([k, v]): [string, string] => [normalizeSkill(k), v.trim()]);
  const skillMaps = new Map<string, Map<string, string>>();
  /** The skills mapping in force for an Excel campaign: the global one, then that campaign's own on top. */
  const skillMapFor = (campaign: string): Map<string, string> => {
    let map = skillMaps.get(campaign);
    if (!map) {
      const own = Object.entries(mapping.campaignSkills[campaign] ?? {}).map(
        ([k, v]): [string, string] => [normalizeSkill(k), v.trim()],
      );
      map = new Map([...baseSkills, ...own]);
      skillMaps.set(campaign, map);
    }
    return map;
  };
  const noSystem = new Set<string>();
  const missingKeys = new Map<string, number>();
  const badDetails = new Map<string, number>();
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
      const systemId = matches[0].systemId;
      if (systemId === null) {
        if (!noSystem.has(campaignId)) {
          noSystem.add(campaignId);
          block(`Campaign "${campaignTarget}" has no role system in the app: pick one in "Editar campaña" first.`);
        }
        continue;
      }
      const catalog = world.catalog.get(systemId) ?? [];
      const skillMap = skillMapFor(campaign);

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

        const sourceText = ((entry.habilidad_original ?? entry.habilidad) ?? "").trim();
        const rawSkill = normalizeSkill(sourceText);
        const resolved = resolveSkill(rawSkill, skillMap, catalog);
        if (resolved === "unmapped") {
          plan.unmappedSkills.set(rawSkill, (plan.unmappedSkills.get(rawSkill) ?? 0) + 1);
          continue;
        }
        if (resolved === "badDetail") {
          badDetails.set(rawSkill, (badDetails.get(rawSkill) ?? 0) + 1);
          continue;
        }
        if (resolved === "missing") {
          const key = `"${skillMap.get(rawSkill) ?? skillMap.get(rawSkill.split(":")[0].trim())}" for "${rawSkill}" in "${campaignTarget}"`;
          missingKeys.set(key, (missingKeys.get(key) ?? 0) + 1);
          continue;
        }
        if (resolved.detail !== null && resolved.detail.length > DICE_SKILL_MAX_LENGTH) {
          block(`${where}: detail "${resolved.detail}" is longer than ${DICE_SKILL_MAX_LENGTH} characters.`);
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

        plan.skills.set(resolved.key, (plan.skills.get(resolved.key) ?? 0) + 1);
        plan.rows.push({
          importKey,
          campaignId,
          userId: user.id,
          kind,
          originalText: sourceText.slice(0, 60),
          note: entry.nota?.trim() ? entry.nota.trim().slice(0, 255) : null,
          skillId: resolved.id,
          skillKey: resolved.key,
          detail: resolved.detail,
          date: entry.fecha,
          time,
          arcNumber,
          source: { player, campaign, cell: entry.celda },
        });
      }
    }
  }

  for (const [text, count] of [...plan.unmappedSkills].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    block(`Skill text "${text}" is not in the mapping (${count} entries).`);
  }
  for (const [text, count] of badDetails) {
    block(
      `Mapping for "${text}" is invalid: the entry either takes no detail or requires one — write it as "KEY: text" (${count} entries).`,
    );
  }
  for (const [key, count] of missingKeys) {
    block(`Catalogue key ${key} does not exist (or is no longer offered) in the campaign's system (${count} entries).`);
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

  lines.push("", `Skill texts still to map: ${plan.unmappedSkills.size}`);
  for (const [text, count] of [...plan.unmappedSkills].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`  ${String(count).padStart(4)}  ${text}`);
  }

  lines.push("", `Catalogue entries used (${plan.skills.size} distinct):`);
  for (const [skill, count] of [...plan.skills].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`  ${String(count).padStart(4)}  ${skill}`);
  }

  return lines.join("\n");
}
