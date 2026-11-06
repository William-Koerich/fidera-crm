import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentPath,
  attachmentProblem,
  attachmentType,
  baseMimeType,
  isAttachmentPathOf,
  isStoragePathOf,
} from "./attachments";

describe("attachment rules", () => {
  it("classifies the types WhatsApp receives, ignoring parameters", () => {
    expect(attachmentType("image/jpeg")).toEqual({ kind: "image", extension: "jpg" });
    expect(attachmentType("audio/ogg; codecs=opus")?.kind).toBe("audio");
    expect(attachmentType("application/pdf")?.kind).toBe("document");
    expect(baseMimeType("AUDIO/OGG; codecs=opus")).toBe("audio/ogg");
  });

  it("refuses what could run in a browser, empty files and large files", () => {
    expect(attachmentProblem("text/html", 10)).toBe("unsupported");
    expect(attachmentProblem("image/svg+xml", 10)).toBe("unsupported");
    expect(attachmentProblem("image/png", 0)).toBe("empty");
    expect(attachmentProblem("image/png", MAX_ATTACHMENT_BYTES + 1)).toBe("too_large");
    expect(attachmentProblem("image/png", MAX_ATTACHMENT_BYTES)).toBeNull();
  });
});

describe("storage paths", () => {
  it("builds a path that passes its own check", () => {
    const path = attachmentPath("org", "conv", "id", "jpg");
    expect(path).toBe("org/outbound/conv/id.jpg");
    expect(isAttachmentPathOf(path, "org", "conv")).toBe(true);
  });

  it("refuses paths from another organization or conversation, and traversal", () => {
    expect(isAttachmentPathOf("other/outbound/conv/a.jpg", "org", "conv")).toBe(false);
    expect(isAttachmentPathOf("org/outbound/other/a.jpg", "org", "conv")).toBe(false);
    expect(isAttachmentPathOf("org/outbound/conv/../../../other/a.jpg", "org", "conv")).toBe(false);
    expect(isStoragePathOf("org/avatars/c", "org")).toBe(true);
    expect(isStoragePathOf("other/avatars/c", "org")).toBe(false);
    expect(isStoragePathOf("org/../other/a", "org")).toBe(false);
    expect(isStoragePathOf("organization/a", "org")).toBe(false);
  });
});
