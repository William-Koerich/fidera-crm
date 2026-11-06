import type { ContactProfile } from "../channels/types";

/**
 * The name saved on the business's phone is how they know this person, so it
 * always wins. The name people set for themselves only fills a blank.
 */
export function chooseContactName(current: string | null, profile: ContactProfile): string | null {
  return profile.savedName ?? current ?? profile.publicName;
}
