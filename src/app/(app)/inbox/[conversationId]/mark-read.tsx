"use client";

import { useEffect } from "react";
import { markReadAction } from "../actions";

/** Clears the unread counter when the conversation is opened. */
export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void markReadAction(conversationId);
  }, [conversationId]);
  return null;
}
