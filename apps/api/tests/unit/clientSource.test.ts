import { expect, test } from "vitest";
import { clientSource } from "../../src/Presentations/clientSource";

test("client source only accepts validated socket peers", () =>
{
    const request = (address: unknown) => Object.assign(new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10", forwarded: "for=203.0.113.11" } }), { runtime: { node: { req: { socket: { remoteAddress: address } } } } });
    expect(clientSource(request("127.0.0.1"))).toBe("127.0.0.1");
    expect(clientSource(request("::ffff:127.0.0.1"))).toBe("127.0.0.1");
    expect(clientSource(request("::ffff:7f00:1"))).toBe("127.0.0.1");
    expect(clientSource(request("not-an-ip"))).toBeNull();
    expect(clientSource(request("fe80::1%eth0"))).toBeNull();
    expect(clientSource(request(42))).toBeNull();
    expect(clientSource(new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.9" } }))).toBeNull();
});
