import type {
  DiscoverActivityCategory,
  DiscoverActivitySignupStatus,
  DiscoverActivityStatus,
} from "@prisma/client";

import type { DiscoverActivityPhase } from "@/lib/discover/discover-activity-state";

export type DiscoverActivityRow = {
  id: string;
  organizerId: string;
  organizerNickname: string;
  organizerAvatarUrl: string | null;
  organizerVerifiedStudent: boolean;
  city: string;
  school: string;
  title: string;
  description: string | null;
  category: DiscoverActivityCategory | null;
  startAtISO: string;
  endAtISO: string;
  location: string;
  capacity: number | null;
  status: DiscoverActivityStatus;
  phase: DiscoverActivityPhase;
  goingCount: number;
  commentCount: number;
  viewerSignupStatus: DiscoverActivitySignupStatus | null;
  isOrganizer: boolean;
};
