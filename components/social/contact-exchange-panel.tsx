import Link from "next/link";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import {
  type ContactExchangeState,
  type ContactHandles,
  handlesAreEmpty,
} from "@/lib/queries/contact-exchange";
import { cn } from "@/lib/utils";

type HandleKey = keyof ContactHandles;

const HANDLE_LABELS: Record<HandleKey, string> = {
  wechat: "WeChat",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
};

function listSharedLabels(handles: ContactHandles): string[] {
  return (Object.keys(HANDLE_LABELS) as HandleKey[])
    .filter((k) => Boolean(handles[k]))
    .map((k) => HANDLE_LABELS[k]);
}

function formatCooldown(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours <= 1) return "in <1h";
  if (hours >= 24) return `in ~${Math.ceil(hours / 24)}d`;
  return `in ~${hours}h`;
}

/**
 * Shared panel used in the 1:1 chat footer and on the peer profile. Shows the
 * current exchange state and lets the viewer progress it forward.
 *
 * IMPORTANT: `peerHandles` must be `null` unless the exchange is ACCEPTED —
 * the server helper `peerHandlesIfAccepted` enforces this. `selfHandles` is
 * always safe to pass because it's the viewer's own data.
 */
export function ContactExchangePanel({
  connectionId,
  peerNickname,
  state,
  selfHandles,
  peerHandles,
  variant,
  returnTo,
}: {
  connectionId: string;
  peerNickname: string | null;
  state: ContactExchangeState;
  selfHandles: ContactHandles;
  peerHandles: ContactHandles | null;
  variant: "chat" | "profile";
  returnTo?: string;
}) {
  const name = peerNickname?.trim() || "Student";
  const action = `/api/connections/${connectionId}/contact-exchange`;
  const wrapperClass =
    variant === "chat"
      ? "shrink-0 border-t border-border bg-muted/20 px-3 py-2.5"
      : "rounded-xl border border-border bg-muted/20 p-3";

  // ACCEPTED — show peer handles + a subtle "shared" marker.
  if (state.kind === "accepted") {
    return (
      <div className={wrapperClass}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </p>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Shared
          </span>
        </div>
        <HandleList handles={peerHandles} />
      </div>
    );
  }

  // OUTGOING PENDING — requester can cancel.
  if (state.kind === "outgoing_pending") {
    return (
      <div className={wrapperClass}>
        <p className="mb-2 text-xs text-muted-foreground">
          Waiting for <span className="font-medium text-foreground">{name}</span> to
          accept your contact request.
        </p>
        <form action={action} method="post">
          <input name="action" type="hidden" value="cancel" />
          {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
          <Button
            className="w-full"
            size="sm"
            type="submit"
            variant="ghost"
          >
            Cancel request
          </Button>
        </form>
      </div>
    );
  }

  // INCOMING PENDING — responder can accept or decline.
  if (state.kind === "incoming_pending") {
    const selfList = listSharedLabels(selfHandles);
    return (
      <div className={wrapperClass}>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> wants to
          exchange contact info.
        </p>
        {selfList.length > 0 ? (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            They&apos;ll see your{" "}
            <span className="font-medium text-foreground/90">
              {selfList.join(", ")}
            </span>
            .
          </p>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            You haven&apos;t added any handles yet —{" "}
            <Link
              href={"/profile" as Route}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              add them in Profile
            </Link>{" "}
            before you accept.
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <form action={action} method="post" className="flex-1">
            <input name="action" type="hidden" value="decline" />
            {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
            <Button className="w-full" size="sm" type="submit" variant="ghost">
              Decline
            </Button>
          </form>
          <form action={action} method="post" className="flex-1">
            <input name="action" type="hidden" value="accept" />
            {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
            <Button className="w-full" size="sm" type="submit">
              Accept
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // COOLDOWN — after a decline/cancel.
  if (state.kind === "cooldown") {
    return (
      <div className={wrapperClass}>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Contact exchange on hold — you can try again {formatCooldown(state.until)}.
        </p>
      </div>
    );
  }

  // NONE — offer to request. Preview what the viewer will share.
  const selfList = listSharedLabels(selfHandles);
  const isEmpty = handlesAreEmpty(selfHandles);
  return (
    <div className={wrapperClass}>
      {isEmpty ? (
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Contact info is private. You haven&apos;t added any handles yet —{" "}
          <Link
            href={"/profile" as Route}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            add them in Profile
          </Link>{" "}
          first, then request an exchange.
        </p>
      ) : (
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Contact info is private. If {name} accepts, you&apos;ll both see each
          other&apos;s{" "}
          <span className="font-medium text-foreground/90">
            {selfList.join(", ")}
          </span>
          .
        </p>
      )}
      <form action={action} method="post">
        <input name="action" type="hidden" value="request" />
        {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
        <Button
          className="w-full"
          size="sm"
          type="submit"
          variant="outline"
          disabled={isEmpty}
        >
          {isEmpty ? "Add handles first" : "Request contact exchange"}
        </Button>
      </form>
    </div>
  );
}

function HandleList({ handles }: { handles: ContactHandles | null }) {
  if (!handles) {
    return (
      <p className="text-xs text-muted-foreground">No handles shared yet.</p>
    );
  }
  const entries = (Object.keys(HANDLE_LABELS) as HandleKey[])
    .map((k) => [HANDLE_LABELS[k], handles[k]] as const)
    .filter(([, v]) => Boolean(v));

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        They haven&apos;t added any handles yet.
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-xs leading-relaxed">
      {entries.map(([label, value]) => (
        <li key={label} className={cn("flex justify-between gap-3")}>
          <span className="text-muted-foreground">{label}</span>
          <span className="truncate font-medium text-foreground">{value}</span>
        </li>
      ))}
    </ul>
  );
}
