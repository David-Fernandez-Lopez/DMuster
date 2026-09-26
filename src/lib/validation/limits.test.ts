import { acceptInvitationSchema, createInvitationSchema } from "@/lib/validation/invitation";
import { changePasswordSchema } from "@/lib/validation/profile";

/** Collects the i18n keys a failed parse produced, joined for matching. */
function reasons(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.success ? "" : (result.error?.issues ?? []).map((i) => i.message).join(" | ");
}

describe("email length", () => {
  const longLocal = "a".repeat(200);

  // The column is VARCHAR(191) and MySQL runs with STRICT_TRANS_TABLES, so a
  // longer address aborted the insert; the generic catch turned that into a 500
  // and wrote the rejected value into the server log.
  it("rejects an address longer than the column, with a 400-shaped error", () => {
    const result = createInvitationSchema.safeParse({ email: `${longLocal}@ejemplo.com` });

    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("auth.errors.emailTooLong");
  });

  it("accepts an ordinary address", () => {
    expect(createInvitationSchema.safeParse({ email: "ana@dmuster.local" }).success).toBe(true);
  });
});

describe("password length", () => {
  const valid = {
    name: "Ana",
    password: "una-contrasena-larga",
    confirmPassword: "una-contrasena-larga",
  };

  it("accepts a normal password", () => {
    expect(acceptInvitationSchema.safeParse(valid).success).toBe(true);
  });

  // bcrypt reads the first 72 bytes and silently ignores the rest, so without a
  // bound two different passwords sharing that prefix authenticate
  // interchangeably — and a generated passphrase is weaker than it looks.
  it("rejects a password past what bcrypt will read", () => {
    const tooLong = "a".repeat(73);
    const result = acceptInvitationSchema.safeParse({
      ...valid,
      password: tooLong,
      confirmPassword: tooLong,
    });

    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("auth.errors.passwordTooLong");
  });

  it("accepts exactly 72 bytes", () => {
    const atLimit = "a".repeat(72);

    expect(
      acceptInvitationSchema.safeParse({ ...valid, password: atLimit, confirmPassword: atLimit })
        .success,
    ).toBe(true);
  });

  // The limit is in bytes, which is what bcrypt counts: an accented passphrase
  // reaches it sooner than its character count suggests.
  it("counts bytes, not characters", () => {
    const fortyEmoji = "🎲".repeat(19); // 19 characters, 76 bytes
    const result = acceptInvitationSchema.safeParse({
      ...valid,
      password: fortyEmoji,
      confirmPassword: fortyEmoji,
    });

    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("auth.errors.passwordTooLong");
  });

  it("applies the same limit when changing a password", () => {
    const tooLong = "b".repeat(73);
    const result = changePasswordSchema.safeParse({
      currentPassword: "la-de-ahora",
      newPassword: tooLong,
      confirmPassword: tooLong,
    });

    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("auth.errors.passwordTooLong");
  });
});

describe("display name characters", () => {
  const base = { password: "una-contrasena-larga", confirmPassword: "una-contrasena-larga" };

  // The name is set here once and for all — there is no way to change it — and
  // it lands in the description of a calendar event on every campaign-mate's
  // Google Calendar, a field where Google interprets a subset of HTML.
  it.each([
    ["<b>Ana</b>"],
    ['<a href="http://x">click</a>'],
    ["Ana\nBeatriz"],
    ["Ana​Beatriz"],
  ])("rejects %p", (name) => {
    const result = acceptInvitationSchema.safeParse({ ...base, name });

    expect(result.success).toBe(false);
    expect(reasons(result)).toContain("auth.errors.nameInvalidCharacters");
  });

  // Real names, which must keep working — the rule is about markup, not accents.
  it.each([["Ana"], ["José Luis"], ["O'Brien"], ["Anne-Marie"], ["Núñez, J."], ["李雷"], ["Ана"]])(
    "accepts %p",
    (name) => {
      expect(acceptInvitationSchema.safeParse({ ...base, name }).success).toBe(true);
    },
  );
});
