import {
  excelHistorySchema,
  formatImportReport,
  importMappingSchema,
  planDiceEventImport,
  type ImportWorld,
} from "@/lib/diceEventImport";

const entry = (id: string, key: string, extra: { allowsDetail?: boolean; requiresDetail?: boolean; active?: boolean } = {}) => ({
  id,
  key,
  allowsDetail: false,
  requiresDetail: false,
  active: true,
  ...extra,
});

const catalog = [
  entry("sk-perception", "PERCEPTION"),
  entry("sk-attack", "ATTACK"),
  entry("sk-deception", "DECEPTION"),
  entry("sk-lore", "LORE", { allowsDetail: true }),
  entry("sk-performance", "PERFORMANCE", { allowsDetail: true }),
  entry("sk-strength", "STRENGTH"),
  entry("sk-dexterity", "DEXTERITY"),
  entry("sk-wisdom", "WISDOM"),
  entry("sk-custom", "CUSTOM_SKILL", { allowsDetail: true, requiresDetail: true }),
  entry("sk-dying", "DYING"),
  entry("sk-old", "OLD", { active: false }),
];

const world: ImportWorld = {
  campaigns: [
    { id: "c-orden", name: "La Orden", systemId: "pf2e" },
    { id: "c-academia", name: "Academia", systemId: "pf2e" },
    { id: "c-bare", name: "Sin Sistema", systemId: null },
    { id: "c-puente", name: "Puente X", systemId: "stormlight" },
  ],
  catalog: new Map([
    ["pf2e", catalog],
    ["stormlight", [entry("sl-perception", "PERCEPTION"), entry("sl-light", "LIGHT_WEAPONRY"), entry("sl-heavy", "HEAVY_WEAPONRY")]],
  ]),
  users: [
    { id: "u-paola", name: "Paola", email: "paola@example.com" },
    { id: "u-david", name: "David", email: "david@example.com" },
    { id: "u-twin1", name: "Twin", email: "t1@example.com" },
    { id: "u-twin2", name: "Twin", email: "t2@example.com" },
  ],
  memberships: new Set(["c-orden:u-paola", "c-academia:u-paola", "c-orden:u-david", "c-bare:u-paola", "c-puente:u-paola"]),
  arcNumbers: new Map([["c-academia", new Set([1])]]),
  existingKeys: new Set(),
  today: "2026-11-22",
};

const history = excelHistorySchema.parse({
  Paola: {
    "La Orden de San Jorge": {
      critico: [{ habilidad: " percepcion ", fecha: "2024-09-28", hora: "20:15", celda: "J4" }],
      pifia: [{ habilidad: "DECEPTION", fecha: "2024-09-28", hora: "23:18", celda: "K4" }],
    },
    "Academia de Saevis": {
      critico: [
        { habilidad: "ATAQUE", fecha: "2025-12-06", hora: "00:52", celda: "J4", arco: 1 },
        { habilidad: "ATAQUE", fecha: "2025-12-07", hora: "01:00", celda: "J5", arco: 2 },
      ],
    },
  },
});

const mapping = importMappingSchema.parse({
  importedBy: "david@example.com",
  campaigns: { "La Orden de San Jorge": "La Orden", "Academia de Saevis": "Academia" },
  players: { Paola: "paola@example.com" },
  skills: { PERCEPCION: "PERCEPTION", DECEPTION: "DECEPTION", ATAQUE: "ATTACK", LORE: "LORE", DYING: "DYING" },
});

function plan(h: unknown, m = mapping, w = world) {
  return planDiceEventImport(excelHistorySchema.parse(h), m, w);
}

describe("planDiceEventImport", () => {
  it("plans every row against the campaign's catalogue, with keys and arcs", () => {
    const result = planDiceEventImport(history, mapping, world);

    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((r) => r.skillKey)).toEqual(["PERCEPTION", "DECEPTION", "ATTACK", "ATTACK"]);
    expect(result.rows[0]).toMatchObject({
      importKey: "excel:Paola:La Orden de San Jorge:J4",
      campaignId: "c-orden",
      userId: "u-paola",
      kind: "CRITICAL",
      skillId: "sk-perception",
      detail: null,
      date: "2024-09-28",
      time: "20:15",
      arcNumber: null,
    });
    expect(result.rows[1].kind).toBe("FUMBLE");
  });

  it("creates only the arcs the campaign lacks", () => {
    expect(planDiceEventImport(history, mapping, world).arcsToCreate).toEqual([
      { campaignId: "c-academia", number: 2 },
    ]);
  });

  it("splits 'LORE: GUILD' into the Lore entry and its detail", () => {
    const result = plan({
      Paola: { "La Orden de San Jorge": { pifia: [{ habilidad: "lore:  guild", fecha: "2026-01-17", celda: "G8" }] } },
    });

    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ skillKey: "LORE", skillId: "sk-lore", detail: "GUILD" });
  });

  it("sends a rare text to Personalizado with an explicit detail", () => {
    const result = plan(
      { Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "fuerza", fecha: "2026-01-01", celda: "A1" }] } } },
      importMappingSchema.parse({ ...mapping, skills: { ...mapping.skills, FUERZA: "CUSTOM_SKILL: fuerza" } }),
    );

    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ skillKey: "CUSTOM_SKILL", skillId: "sk-custom", detail: "FUERZA" });
  });

  it("blocks a Personalizado with no detail, and a detail on an entry that takes none", () => {
    const rare = { Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "FUERZA", fecha: "2026-01-01", celda: "A1" }] } } };

    const missing = plan(rare, importMappingSchema.parse({ ...mapping, skills: { FUERZA: "CUSTOM_SKILL" } }));
    expect(missing.issues).toEqual([{ blocking: true, message: expect.stringContaining('Mapping for "FUERZA" is invalid') }]);

    const extra = plan(rare, importMappingSchema.parse({ ...mapping, skills: { FUERZA: "ATTACK: fuerza" } }));
    expect(extra.issues).toEqual([{ blocking: true, message: expect.stringContaining('Mapping for "FUERZA" is invalid') }]);
    expect(extra.rows).toHaveLength(0);
  });

  it("maps a condition like any other entry", () => {
    const result = plan({
      Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "DYING", fecha: "2026-11-01", celda: "N4" }] } },
    });

    expect(result.rows[0]).toMatchObject({ skillKey: "DYING", skillId: "sk-dying" });
  });

  it("blocks on a skill text nobody mapped, once per text with its count", () => {
    const result = plan({
      Paola: {
        "La Orden de San Jorge": {
          critico: [
            { habilidad: "SUCIEDAD", fecha: "2026-01-01", celda: "A1" },
            { habilidad: "suciedad", fecha: "2026-01-02", celda: "A2" },
          ],
        },
      },
    });

    expect(result.issues).toEqual([{ blocking: true, message: 'Skill text "SUCIEDAD" is not in the mapping (2 entries).' }]);
    expect(result.unmappedSkills.get("SUCIEDAD")).toBe(2);
    expect(result.rows).toHaveLength(0);
  });

  it("blocks on a key the campaign's system does not have, or no longer offers", () => {
    const result = plan(
      {
        Paola: {
          "La Orden de San Jorge": {
            critico: [
              { habilidad: "ATAQUE", fecha: "2026-01-01", celda: "A1" },
              { habilidad: "VIEJA", fecha: "2026-01-02", celda: "A2" },
            ],
          },
        },
      },
      importMappingSchema.parse({ ...mapping, skills: { ATAQUE: "NOPE", VIEJA: "OLD" } }),
    );

    const messages = result.issues.map((i) => i.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('"NOPE" for "ATAQUE"');
    expect(messages[1]).toContain('"OLD" for "VIEJA"');
    expect(result.rows).toHaveLength(0);
  });

  it("blocks once when a campaign has no role system", () => {
    const result = plan(
      {
        Paola: {
          "Otra": {
            critico: [
              { habilidad: "ATAQUE", fecha: "2026-01-01", celda: "A1" },
              { habilidad: "ATAQUE", fecha: "2026-01-02", celda: "A2" },
            ],
          },
        },
      },
      importMappingSchema.parse({ ...mapping, campaigns: { Otra: "Sin Sistema" } }),
    );

    expect(result.issues).toEqual([
      { blocking: true, message: expect.stringContaining('"Sin Sistema" has no role system') },
    ]);
  });

  it("leaves out rows already imported and counts them", () => {
    const result = planDiceEventImport(history, mapping, {
      ...world,
      existingKeys: new Set(["excel:Paola:La Orden de San Jorge:J4"]),
    });

    expect(result.alreadyImported).toBe(1);
    expect(result.rows).toHaveLength(3);
  });

  it("blocks on an unmapped campaign or player, once each", () => {
    const result = plan({
      Mario: { "La Orden de San Jorge": { pifia: [{ habilidad: "A", fecha: "2026-08-16", celda: "Q4" }] } },
      Paola: {
        "Puente X": {
          pifia: [
            { habilidad: "A", fecha: "2026-08-16", celda: "E4" },
            { habilidad: "B", fecha: "2026-08-16", celda: "E5" },
          ],
        },
      },
    });

    expect(result.issues.filter((i) => i.blocking).map((i) => i.message)).toEqual([
      'Player "Mario" is not in the mapping.',
      'Campaign "Puente X" is not in the mapping.',
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("treats a null target as an explicit skip that does not block", () => {
    const result = plan(
      { Paola: { "Puente X": { pifia: [{ habilidad: "A", fecha: "2026-08-16", celda: "E4" }] } } },
      importMappingSchema.parse({ ...mapping, campaigns: { ...mapping.campaigns, "Puente X": null } }),
    );

    expect(result.issues).toEqual([]);
    expect(result.skipped).toEqual([
      { player: "Paola", campaign: "Puente X", entries: 1, reason: "campaign skipped in the mapping" },
    ]);
  });

  it("blocks when the player is not a member, unless the pair is skipped", () => {
    const extra = { David: { "Academia de Saevis": { critico: [{ habilidad: "ATAQUE", fecha: "2026-08-16", celda: "B4" }] } } };
    const withDavid = importMappingSchema.parse({ ...mapping, players: { David: "David" } });

    const blocked = plan(extra, withDavid);
    expect(blocked.issues[0]).toMatchObject({ blocking: true });
    expect(blocked.issues[0].message).toContain("not a member");

    const skipped = plan(extra, importMappingSchema.parse({ ...withDavid, skipPairs: ["David|Academia de Saevis"] }));
    expect(skipped.issues).toEqual([]);
    expect(skipped.skipped).toHaveLength(1);
  });

  it("blocks on an ambiguous name, a bad date, a bad time and a repeated cell", () => {
    const result = plan(
      {
        Paola: {
          "La Orden de San Jorge": {
            critico: [
              { habilidad: "ATAQUE", fecha: "2026-02-30", celda: "J4" },
              { habilidad: "ATAQUE", fecha: "2026-02-01", hora: "25:00", celda: "J5" },
              { habilidad: "ATAQUE", fecha: "2026-02-01", celda: "J6" },
              { habilidad: "ATAQUE", fecha: "2026-02-01", celda: "J6" },
            ],
          },
        },
        Twin: { "La Orden de San Jorge": { pifia: [{ habilidad: "ATAQUE", fecha: "2026-02-01", celda: "K4" }] } },
      },
      importMappingSchema.parse({ ...mapping, players: { Paola: "Paola", Twin: "Twin" } }),
    );

    expect(result.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid date "2026-02-30"'),
        expect.stringContaining('invalid time "25:00"'),
        expect.stringContaining("appears twice"),
        expect.stringContaining("matches several users"),
      ]),
    );
    expect(result.rows).toHaveLength(1);
  });

  it("only warns about a future date", () => {
    const result = plan({
      Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "ATAQUE", fecha: "2026-12-01", celda: "J4" }] } },
    });

    expect(result.issues).toEqual([{ blocking: false, message: expect.stringContaining("in the future") }]);
    expect(result.rows).toHaveLength(1);
  });

  it("blocks when importedBy matches no user", () => {
    const result = plan({}, importMappingSchema.parse({ ...mapping, importedBy: "nobody" }));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].blocking).toBe(true);
  });
});

describe("the enriched history format", () => {
  const one = (entry: Record<string, unknown>) => ({
    Paola: { "La Orden de San Jorge": { critico: [{ fecha: "2026-01-01", celda: "A1", ...entry }] } },
  });

  it("maps habilidad_original, not the translated habilidad", () => {
    const result = plan(one({ habilidad: "Percepción", habilidad_original: "ATAQUE" }));

    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ skillKey: "ATTACK", originalText: "ATAQUE" });
  });

  it("still reads habilidad when there is no habilidad_original (the old format)", () => {
    const result = plan(one({ habilidad: "ataque" }));

    expect(result.rows[0]).toMatchObject({ skillKey: "ATTACK", originalText: "ataque", note: null });
  });

  it("keeps the preparer's remark, trimmed and capped, and ignores especialidad and categoria", () => {
    const result = plan(
      one({ habilidad_original: "ATAQUE", nota: `  ${"x".repeat(300)}  `, especialidad: "Hacha", categoria: "otra_tirada" }),
    );

    expect(result.issues).toEqual([]);
    expect(result.rows[0].note).toHaveLength(255);
  });

  it("sends attributes to their own entries", () => {
    const result = plan(
      {
        Paola: {
          "La Orden de San Jorge": {
            critico: [
              { habilidad_original: "FUERZA", fecha: "2026-01-01", celda: "A1" },
              { habilidad_original: "DESTREZA", fecha: "2026-01-01", celda: "A2" },
              { habilidad_original: "SABIDURÍA", fecha: "2026-01-01", celda: "A3" },
            ],
          },
        },
      },
      importMappingSchema.parse({
        ...mapping,
        skills: { ...mapping.skills, FUERZA: "STRENGTH", DESTREZA: "DEXTERITY", SABIDURIA: "WISDOM", SABIDURÍA: "WISDOM" },
      }),
    );

    expect(result.rows.map((r) => r.skillKey)).toEqual(["STRENGTH", "DEXTERITY", "WISDOM"]);
  });

  it("keeps a specialty on Performance through an explicit detail", () => {
    const result = plan(
      one({ habilidad_original: "MUSICA" }),
      importMappingSchema.parse({ ...mapping, skills: { ...mapping.skills, MUSICA: "PERFORMANCE: música" } }),
    );

    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({ skillKey: "PERFORMANCE", detail: "MÚSICA", originalText: "MUSICA" });
  });
});

describe("campaignSkills", () => {
  const puente = {
    Paola: {
      "Puente X": { pifia: [{ habilidad: "ataque", fecha: "2026-11-14", celda: "E5" }] },
      "La Orden de San Jorge": { pifia: [{ habilidad: "ataque", fecha: "2026-11-14", celda: "K9" }] },
    },
  };
  const withPuente = importMappingSchema.parse({
    ...mapping,
    campaigns: { ...mapping.campaigns, "Puente X": "Puente X" },
    campaignSkills: { "Puente X": { ATAQUE: "LIGHT_WEAPONRY" } },
  });

  it("resolves the same text to the key of each campaign's own system", () => {
    const result = plan(puente, withPuente);

    expect(result.issues).toEqual([]);
    expect(result.rows.map((r) => [r.campaignId, r.skillKey])).toEqual([
      ["c-puente", "LIGHT_WEAPONRY"],
      ["c-orden", "ATTACK"],
    ]);
  });

  it("does not leak into another campaign, and blocks when a system lacks the global target", () => {
    const withoutOverride = plan(puente, importMappingSchema.parse({ ...withPuente, campaignSkills: {} }));

    expect(withoutOverride.issues).toHaveLength(1);
    expect(withoutOverride.issues[0].message).toContain('"ATTACK" for "ATAQUE" in "Puente X"');
    expect(withoutOverride.rows.map((r) => r.campaignId)).toEqual(["c-orden"]);
  });

  it("still blocks an adjustment that names a key the campaign's system does not have", () => {
    const wrong = plan(
      puente,
      importMappingSchema.parse({ ...withPuente, campaignSkills: { "Puente X": { ATAQUE: "NOPE" } } }),
    );

    expect(wrong.issues[0].message).toContain('"NOPE" for "ATAQUE" in "Puente X"');
  });
});

describe("formatImportReport", () => {
  it("summarises problems, counts per campaign, arcs, skips and catalogue entries", () => {
    const report = formatImportReport(planDiceEventImport(history, mapping, world), world);

    expect(report).toContain("Issues: 0 blocking, 0 warnings");
    expect(report).toContain("To insert: 4");
    expect(report).toContain("La Orden: 1 critical, 1 fumble");
    expect(report).toContain("Academia: arc 2");
    expect(report).toMatch(/2\s+ATTACK/);
  });

  it("lists the texts still to map with their counts", () => {
    const result = plan({
      Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "SUCIEDAD", fecha: "2026-01-01", celda: "A1" }] } },
    });

    expect(formatImportReport(result, world)).toMatch(/Skill texts still to map: 1\n\s+1\s+SUCIEDAD/);
  });
});
