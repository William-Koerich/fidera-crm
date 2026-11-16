import { describe, expect, it } from "vitest";
import { parseChatProCredentials, serializeChatProCredentials } from "./credentials";

describe("ChatPro credentials", () => {
  it("round-trips both keys", () => {
    const stored = serializeChatProCredentials({ token: "conn", chatToken: "chat" });
    expect(parseChatProCredentials(stored)).toEqual({ token: "conn", chatToken: "chat" });
  });

  it("accepts a missing chat key", () => {
    expect(parseChatProCredentials('{"token":"conn"}')).toEqual({ token: "conn", chatToken: "" });
  });

  it("rejects anything without a connection key", () => {
    expect(parseChatProCredentials(null)).toBeNull();
    expect(parseChatProCredentials("")).toBeNull();
    expect(parseChatProCredentials("not json")).toBeNull();
    expect(parseChatProCredentials('{"chatToken":"chat"}')).toBeNull();
    expect(parseChatProCredentials("[]")).toBeNull();
  });
});
