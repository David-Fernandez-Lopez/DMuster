import {
  excelHistorySchema,
  formatImportReport,
  importMappingSchema,
  planDiceEventImport,
  type ImportWorld,
} from "@/lib/diceEventImport";

const catalog = [
  { id: "sk-perception", key: "PERCEPTION", allowsDetail: false, active: true },
  { id: "sk-attack", key: "ATTACK", allowsDetail: false, active: true },
  { id: "sk-deception", key: "DECEPTION", allowsDetail: false, active: true },
  { id: "sk-lore", key: "LORE", allowsDetail: true, active: true },
  { id: "sk-dying", key: "DYING", allowsDetail: false, active: true },
  { id: "sk-old", key: "OLD", allowsDetail: false, active: false },
];

const world: ImportWorld = {
  campaigns: [
    { id: "c-orden", name: "La Orden", systemId: "pf2e" },
    { id: "c-academia", name: "Academia", systemId: "pf2e" },
    { id: "c-bare", name: "Sin Sistema", systemId: null },
  ],
  catalog: new Map([["pf2e", catalog]]),
  users: [
    { id: "u-paola", name: "Paola", email: "paola@example.com" },
    { id: "u-david", name: "David", email: "david@example.com" },
    { id: "u-twin1", name: "Twin", email: "t1@example.com" },
    { id: "u-twin2", name: "Twin", email: "t2@example.com" },
  ],
  memberships: new Set(["c-orden:u-paola", "c-academia:u-paola", "c-orden:u-david", "c-bare:u-paola"]),
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
