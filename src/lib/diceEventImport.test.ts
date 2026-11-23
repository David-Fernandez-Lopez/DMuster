import {
  excelHistorySchema,
  formatImportReport,
  importMappingSchema,
  planDiceEventImport,
  type ImportWorld,
} from "@/lib/diceEventImport";

const world: ImportWorld = {
  campaigns: [
    { id: "c-orden", name: "La Orden" },
    { id: "c-academia", name: "Academia" },
  ],
  users: [
    { id: "u-paola", name: "Paola", email: "paola@example.com" },
    { id: "u-david", name: "David", email: "david@example.com" },
    { id: "u-twin1", name: "Twin", email: "t1@example.com" },
    { id: "u-twin2", name: "Twin", email: "t2@example.com" },
  ],
  memberships: new Set(["c-orden:u-paola", "c-academia:u-paola", "c-orden:u-david"]),
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
  skills: { deception: "engaño" },
});

describe("planDiceEventImport", () => {
  it("plans every row with normalised and mapped skills, keys and arcs", () => {
    const plan = planDiceEventImport(history, mapping, world);

    expect(plan.issues).toEqual([]);
    expect(plan.rows).toHaveLength(4);
    expect(plan.rows.map((r) => r.skill)).toEqual(["PERCEPCION", "ENGAÑO", "ATAQUE", "ATAQUE"]);
    expect(plan.rows[0]).toMatchObject({
      importKey: "excel:Paola:La Orden de San Jorge:J4",
      campaignId: "c-orden",
      userId: "u-paola",
      kind: "CRITICAL",
      date: "2024-09-28",
      time: "20:15",
      arcNumber: null,
    });
    expect(plan.rows[1].kind).toBe("FUMBLE");
  });

  it("creates only the arcs the campaign lacks", () => {
    const plan = planDiceEventImport(history, mapping, world);

    expect(plan.arcsToCreate).toEqual([{ campaignId: "c-academia", number: 2 }]);
  });

  it("leaves out rows already imported and counts them", () => {
    const plan = planDiceEventImport(history, mapping, {
      ...world,
      existingKeys: new Set(["excel:Paola:La Orden de San Jorge:J4"]),
    });

    expect(plan.alreadyImported).toBe(1);
    expect(plan.rows).toHaveLength(3);
  });

  it("blocks on an unmapped campaign or player, once each", () => {
    const extra = excelHistorySchema.parse({
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

    const plan = planDiceEventImport(extra, mapping, world);

    expect(plan.issues.filter((i) => i.blocking).map((i) => i.message)).toEqual([
      'Player "Mario" is not in the mapping.',
      'Campaign "Puente X" is not in the mapping.',
    ]);
    expect(plan.rows).toHaveLength(0);
  });

  it("treats a null target as an explicit skip that does not block", () => {
    const extra = excelHistorySchema.parse({
      Paola: { "Puente X": { pifia: [{ habilidad: "A", fecha: "2026-08-16", celda: "E4" }] } },
    });

    const plan = planDiceEventImport(
      extra,
      importMappingSchema.parse({ ...mapping, campaigns: { ...mapping.campaigns, "Puente X": null } }),
      world,
    );

    expect(plan.issues).toEqual([]);
    expect(plan.skipped).toEqual([
      { player: "Paola", campaign: "Puente X", entries: 1, reason: "campaign skipped in the mapping" },
    ]);
  });

  it("blocks when the player is not a member, unless the pair is skipped", () => {
    const extra = excelHistorySchema.parse({
      David: { "Academia de Saevis": { critico: [{ habilidad: "A", fecha: "2026-08-16", celda: "B4" }] } },
    });
    const withDavid = importMappingSchema.parse({ ...mapping, players: { David: "David" } });

    const blocked = planDiceEventImport(extra, withDavid, world);
    expect(blocked.issues[0]).toMatchObject({ blocking: true });
    expect(blocked.issues[0].message).toContain("not a member");

    const skipped = planDiceEventImport(
      extra,
      importMappingSchema.parse({ ...withDavid, skipPairs: ["David|Academia de Saevis"] }),
      world,
    );
    expect(skipped.issues).toEqual([]);
    expect(skipped.skipped).toHaveLength(1);
  });

  it("blocks on an ambiguous name, a bad date, a bad time and a repeated cell", () => {
    const bad = excelHistorySchema.parse({
      Paola: {
        "La Orden de San Jorge": {
          critico: [
            { habilidad: "A", fecha: "2026-02-30", celda: "J4" },
            { habilidad: "A", fecha: "2026-02-01", hora: "25:00", celda: "J5" },
            { habilidad: "A", fecha: "2026-02-01", celda: "J6" },
            { habilidad: "B", fecha: "2026-02-01", celda: "J6" },
          ],
        },
      },
      Twin: { "La Orden de San Jorge": { pifia: [{ habilidad: "A", fecha: "2026-02-01", celda: "K4" }] } },
    });

    const plan = planDiceEventImport(bad, importMappingSchema.parse({ ...mapping, players: { Paola: "Paola", Twin: "Twin" } }), world);
    const messages = plan.issues.map((i) => i.message);

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid date "2026-02-30"'),
        expect.stringContaining('invalid time "25:00"'),
        expect.stringContaining("appears twice"),
        expect.stringContaining("matches several users"),
      ]),
    );
    expect(plan.rows).toHaveLength(1);
  });

  it("only warns about a future date", () => {
    const future = excelHistorySchema.parse({
      Paola: { "La Orden de San Jorge": { critico: [{ habilidad: "A", fecha: "2026-12-01", celda: "J4" }] } },
    });

    const plan = planDiceEventImport(future, mapping, world);

    expect(plan.issues).toEqual([{ blocking: false, message: expect.stringContaining("in the future") }]);
    expect(plan.rows).toHaveLength(1);
  });

  it("blocks when importedBy matches no user", () => {
    const plan = planDiceEventImport({}, importMappingSchema.parse({ ...mapping, importedBy: "nobody" }), world);

    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0].blocking).toBe(true);
  });
});

describe("formatImportReport", () => {
  it("summarises problems, counts per campaign, arcs, skips and skills", () => {
    const report = formatImportReport(planDiceEventImport(history, mapping, world), world);

    expect(report).toContain("Issues: 0 blocking, 0 warnings");
    expect(report).toContain("To insert: 4");
    expect(report).toContain("La Orden: 1 critical, 1 fumble");
    expect(report).toContain("Academia: arc 2");
    expect(report).toMatch(/2\s+ATAQUE/);
  });
});
