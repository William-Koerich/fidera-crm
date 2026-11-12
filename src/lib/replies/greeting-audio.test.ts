import { describe, expect, it } from "vitest";
import { greetingAudioPath, greetingRawPath, greetingUploadProblem, isGreetingAudioPathOf, isGreetingRawPathOf } from "./greeting-audio";

const ORG = "11111111-1111-1111-1111-111111111111";
const ID = "22222222-2222-2222-2222-222222222222";

describe("greeting audio paths", () => {
  it("accepts only the business's own converted file", () => {
    expect(isGreetingAudioPathOf(greetingAudioPath(ORG, ID), ORG)).toBe(true);
    expect(isGreetingAudioPathOf(greetingAudioPath("other-org", ID), ORG)).toBe(false);
    expect(isGreetingAudioPathOf(`${ORG}/greetings/../outbound/x.ogg`, ORG)).toBe(false);
    expect(isGreetingAudioPathOf(`${ORG}/greetings/raw/${ID}`, ORG)).toBe(false);
    expect(isGreetingAudioPathOf(`${ORG}/greetings/${ID}.mp3`, ORG)).toBe(false);
  });

  it("accepts only the business's own raw upload", () => {
    expect(isGreetingRawPathOf(greetingRawPath(ORG, ID), ORG)).toBe(true);
    expect(isGreetingRawPathOf(greetingRawPath("other-org", ID), ORG)).toBe(false);
    expect(isGreetingRawPathOf(`${ORG}/greetings/raw/../../x`, ORG)).toBe(false);
  });
});

describe("greetingUploadProblem", () => {
  it("takes recordings from phones and browsers, and refuses the rest", () => {
    for (const mimeType of ["audio/mp4", "audio/x-m4a", "audio/ogg; codecs=opus", "audio/webm;codecs=opus", "audio/mpeg", "", "video/webm"]) {
      expect(greetingUploadProblem({ mimeType, size: 1000 })).toBeNull();
    }
    expect(greetingUploadProblem({ mimeType: "image/png", size: 1000 })).toBe("unsupported");
    expect(greetingUploadProblem({ mimeType: "audio/mpeg", size: 0 })).toBe("empty");
    expect(greetingUploadProblem({ mimeType: "audio/mpeg", size: 17 * 1024 * 1024 })).toBe("too_large");
  });
});
