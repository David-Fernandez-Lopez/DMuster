import { clientIpFromForwardedFor } from "@/lib/clientIp";

describe("clientIpFromForwardedFor", () => {
  it("returns null without a header", () => {
    expect(clientIpFromForwardedFor(null)).toBeNull();
  });

  it("takes the entry the proxy appended, not a client-supplied prefix", () => {
    expect(clientIpFromForwardedFor("1.2.3.4, 198.51.100.9")).toBe("198.51.100.9");
  });

  it("accepts IPv6", () => {
    expect(clientIpFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
  });

  it.each([["not-an-ip"], [""], ["1.2.3.4, <script>"], ["999.1.1.1"]])(
    "rejects %p",
    (value) => {
      expect(clientIpFromForwardedFor(value)).toBeNull();
    },
  );
});
