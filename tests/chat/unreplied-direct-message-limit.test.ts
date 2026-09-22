import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countUnrepliedDirectStreak,
  hasMutualDirectExchange,
  isUnrepliedDirectSendBlocked,
  shouldShowUnrepliedDirectHint,
  UNREPLIED_DIRECT_MESSAGE_LIMIT,
} from "../../lib/chat/unreplied-direct-message-limit";

const viewer = "viewer";
const peer = "peer";

describe("countUnrepliedDirectStreak", () => {
  it("returns 0 for empty threads and self-notes", () => {
    assert.equal(countUnrepliedDirectStreak([], viewer, peer), 0);
    assert.equal(countUnrepliedDirectStreak([{ senderId: viewer, type: "TEXT" }], viewer, viewer), 0);
  });

  it("counts viewer messages before the peer has replied", () => {
    const messages = [
      { senderId: viewer, type: "TEXT" },
      { senderId: viewer, type: "IMAGE" },
    ];
    assert.equal(countUnrepliedDirectStreak(messages, viewer, peer), 2);
  });

  it("ignores SYSTEM rows while the first-contact gate is active", () => {
    const messages = [
      { senderId: viewer, type: "TEXT" },
      { senderId: viewer, type: "SYSTEM" },
      { senderId: viewer, type: "TEXT" },
    ];
    assert.equal(countUnrepliedDirectStreak(messages, viewer, peer), 2);
  });

  it("permanently unlocks after both participants have sent a message", () => {
    const messages = [
      { senderId: viewer, type: "TEXT" },
      { senderId: peer, type: "TEXT" },
      { senderId: viewer, type: "TEXT" },
      { senderId: viewer, type: "TEXT" },
    ];
    assert.equal(hasMutualDirectExchange(messages, viewer, peer), true);
    assert.equal(countUnrepliedDirectStreak(messages, viewer, peer), 0);
    assert.equal(countUnrepliedDirectStreak(messages, peer, viewer), 0);
  });
});

describe("unreplied send helpers", () => {
  it("blocks at the configured limit", () => {
    assert.equal(UNREPLIED_DIRECT_MESSAGE_LIMIT, 2);
    assert.equal(isUnrepliedDirectSendBlocked(1), false);
    assert.equal(isUnrepliedDirectSendBlocked(2), true);
  });

  it("shows a hint on empty or awaiting threads, not after peer reply or at limit", () => {
    assert.equal(shouldShowUnrepliedDirectHint([], viewer, peer), true);
    assert.equal(
      shouldShowUnrepliedDirectHint([{ senderId: viewer, type: "TEXT" }], viewer, peer),
      true,
    );
    assert.equal(
      shouldShowUnrepliedDirectHint(
        [
          { senderId: viewer, type: "TEXT" },
          { senderId: viewer, type: "TEXT" },
        ],
        viewer,
        peer,
      ),
      false,
    );
    assert.equal(
      shouldShowUnrepliedDirectHint([{ senderId: peer, type: "TEXT" }], viewer, peer),
      false,
    );
    assert.equal(
      shouldShowUnrepliedDirectHint(
        [
          { senderId: viewer, type: "TEXT" },
          { senderId: peer, type: "TEXT" },
        ],
        viewer,
        peer,
      ),
      false,
    );
  });
});
