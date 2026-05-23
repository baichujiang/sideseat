import type { DiscoverCityNameKey } from "./discover-city-name-keys";

export type AppMessages = {
  nav: {
    home: string;
    courses: string;
    discoverTab: string;
    chats: string;
    me: string;
    mainNavAria: string;
  };
  common: {
    save: string;
    cancel: string;
    back: string;
    done: string;
    close: string;
    loading: string;
    search: string;
    reset: string;
    /** Generic display when a name is missing (UI chrome only). */
    studentFallback: string;
    /** Chat list / compact timestamps — `{count}` in minute/hour templates. */
    listRelativeTime: {
      justNow: string;
      /** `{count}` minutes, ≥ 1 */
      minutesAgo: string;
      hoursAgoOne: string;
      /** `{count}` hours, ≥ 2 */
      hoursAgoMany: string;
      yesterday: string;
    };
  };
  guest: {
    /** When a page does not pass a specific headline/body. */
    genericHeadline: string;
    genericBody: string;
    createAccount: string;
    logIn: string;
    browsePrivateHint: string;
    homeHeadline: string;
    homeBody: string;
    discoverHeadline: string;
    discoverBody: string;
    inboxHeadline: string;
    inboxBody: string;
    profileHeadline: string;
    profileBody: string;
    signInPromptTitle: string;
    signInPromptBody: string;
  };
  onboarding: {
    genericTitle: string;
    genericBody: string;
    continueSetup: string;
    homeTitle: string;
    homeBody: string;
    discoverTitle: string;
    discoverBody: string;
    inboxTitle: string;
    inboxBody: string;
    meTitle: string;
    meBody: string;
  };
  home: {
    greetingNight: string;
    greetingMorning: string;
    greetingAfternoon: string;
    greetingEvening: string;
    guestDisplayName: string;
    guestBrowseHint: string;
    openProfileAria: string;
  };
  discover: {
    screenTitle: string;
    screenSubtitle: string;
    /** Use `{city}` — localized label for the default Discover metro. */
    areaFilterAria: string;
    areaStatusPrefix: string;
    /** Use `{city}` — localized label for the default Discover metro. */
    areaComingSoon: string;
    /** Use `{city}` — static single-city context, e.g. "Munich only". */
    cityContextOnly: string;
    /** Keys match stored `ClassmatePost.city` English names; UI labels only. */
    cityNames: Record<DiscoverCityNameKey, string>;
  };
  /** Discover — buddy-finding feed (tabs, search, filters, card chrome). */
  discoverBuddy: {
    feedTabForYou: string;
    feedTabToday: string;
    feedTabNearby: string;
    feedTabLatest: string;
    typeChipAll: string;
    typeChipsAria: string;
    searchPlaceholder: string;
    searchAria: string;
    filterOpenAria: string;
    filterSheetTitle: string;
    filterBuddyTypeSection: string;
    filterTimeSection: string;
    filterTimeAny: string;
    filterTimeToday: string;
    filterTimeTomorrow: string;
    filterTimeThisWeek: string;
    filterOpenOnly: string;
    filterApply: string;
    filterReset: string;
    createRequestCta: string;
    createRequestCtaAria: string;
    sheetChooseBuddyType: string;
    sheetTitlePrefix: string;
    buddyTypeCourse: string;
    buddyTypeStudy: string;
    buddyTypeMeal: string;
    buddyTypeLanguage: string;
    buddyTypeSports: string;
    emptyFeed: string;
    emptyFeedToday: string;
    peopleStripTitle: string;
    buddyCardMessage: string;
    buddyCardMessageAria: string;
    buddyCardOpen: string;
    buddyCardTimeTbd: string;
    /** `{city}` — city label on compact card */
    buddyCardCityLine: string;
  };
  /** Buddy request detail / Discover post drill-in — request-first copy. */
  discoverBuddyDetail: {
    planDetailsTitle: string;
    rowWhen: string;
    rowPreferredTime: string;
    rowWhere: string;
    rowStatus: string;
    rowAvailability: string;
    rowCity: string;
    notSpecified: string;
    statusOpen: string;
    statusExpired: string;
    statusClosed: string;
    /** `{date}` — open request expiry */
    availabilityActiveUntil: string;
    /** `{date}` — expired at */
    availabilityExpiredOn: string;
    /** `{date}` — closed updated */
    availabilityClosedOn: string;
    yourRequestBadge: string;
    manageRequestCta: string;
    manageRequestAria: string;
    messageAuthorCta: string;
    messageAuthorAria: string;
    signInToMessageCta: string;
    signInToMessageAria: string;
    viewProfileCta: string;
    viewProfileAria: string;
    shareRequestAria: string;
    guestIntro: string;
    bottomBarRequestExpired: string;
    bottomBarRequestClosed: string;
    bottomBarMessagingUnavailable: string;
  };
  discoverList: {
    emptyShared: string;
    emptyCategory: string;
    addCourse: string;
    sceneTabShared: string;
    sceneTabStudy: string;
    sceneTabMeals: string;
    sceneTabLanguage: string;
    sceneTabSports: string;
    sceneHeadingShared: string;
    sceneHeadingStudy: string;
    sceneHeadingMeals: string;
    sceneHeadingLanguage: string;
    sceneHeadingSports: string;
    sceneDescShared: string;
    sceneDescStudy: string;
    sceneDescMeals: string;
    sceneDescLanguage: string;
    sceneDescSports: string;
    postNoExpiry: string;
    /** `{date}` — short formatted end date */
    postActiveUntil: string;
    /** `{time}` — accessible label for posted-at (relative / short date); visible line is icon + time only. */
    postPostedAria: string;
    /** `{date}` — post detail when closed */
    postDetailClosedUpdated: string;
    /** `{date}` — post detail when expired */
    postDetailExpiredUpdated: string;
    /** Primary CTA to open the create-post sheet. */
    postCta: string;
    postSheetSubtitle: string;
    postSheetTitlePrefix: string;
    /** `{selected}` `{total}` — course picker heading in create-post sheet. */
    postSheetCoursePicker: string;
    postSheetSelectAll: string;
    postSheetDeselectAll: string;
    postSheetNeedEnroll: string;
    postSheetTitleQuestion: string;
    postSheetTitlePlaceholder: string;
    /** `{current}` `{max}` — trimmed length vs limit for post title. */
    postCharCountCurrentMax: string;
    /** `{count}` — characters remaining before body limit (non-negative in copy; pass 0 when over). */
    postCharCountRemaining: string;
    postSheetDetailsLabel: string;
    postSheetDetailsPlaceholder: string;
    postSheetPhotosLabel: string;
    /** `{max}` — max images per post. */
    postSheetPhotosHint: string;
    postSheetAddPhoto: string;
    postSheetPhotosUploading: string;
    /** `{index}` — 1-based photo index for a11y. */
    postSheetPhotoRemoveAria: string;
    postSheetPhotoMoveLeftAria: string;
    postSheetPhotoMoveRightAria: string;
    postSheetExpiresLabel: string;
    postExpiry3d: string;
    postExpiry1w: string;
    postExpiry1m: string;
    postExpiryNever: string;
    postSubmitButton: string;
    postSubmitting: string;
    postErrorSelectCourse: string;
    postErrorNeedTitle: string;
    postErrorNeedBody: string;
    /** `{max}` — title exceeds server max (trimmed). */
    postErrorTitleTooLong: string;
    /** `{max}` — body exceeds server max (trimmed). */
    postErrorBodyTooLong: string;
    postErrorCreateFailed: string;
    postErrorImageUpload: string;
    /** `{max}` — too many photos. */
    postErrorImageMax: string;
    postPlaceholderShared: string;
    postPlaceholderStudy: string;
    postPlaceholderMeals: string;
    postPlaceholderLanguage: string;
    postPlaceholderSports: string;
    /** Author-only CTA on Discover post cards — opens inbox My posts. */
    myPostsListCta: string;
    /** Accessible label for the My posts card CTA (navigates to list). */
    myPostsListCtaAria: string;
    /** Author-only footer CTA on Discover post cards (Manage / my-posts). */
    postCardOwnPostManageCta: string;
    postCardOwnPostManageCtaAria: string;
    /** Discover post card — pill next to the author name when the viewer owns the post. */
    postCardYourPostBadge: string;
    /** Inner panel — heading above the author’s language tags on LANGUAGE posts. */
    postCardSpeaksLabel: string;
    /** Inner panel — short hint under the body on SPORTS posts (no separate sport fields in data). */
    postCardSportsBlurb: string;
    /** `aria-label` for the linked-course chip row on SHARED_COURSES posts. */
    postCardLinkedCoursesAria: string;
    /** `aria-label` for optional post images on cards and detail. */
    postCardImagesAria: string;
    postCardMealsMetaAria: string;
    postCardMealsVenuesLabel: string;
    /** Short prefix for map-pin location row (card + detail). */
    postCardLocationLabel: string;
    postCardLanguageMetaAria: string;
    postCardLanguageOffersLabel: string;
    postCardLanguageTargetsLabel: string;
    postCardSportsMetaAria: string;
    postCardSportsTagsLabel: string;
    /** Study post structured preferences — section `aria-label`. */
    postCardStudyMetaAria: string;
    postCardStudyPurposesLabel: string;
    postCardStudyTimeLabel: string;
    postCardStudyVenuesLabel: string;
    studyPurposeDailySelfStudy: string;
    studyPurposeExamPrep: string;
    studyPurposeSprint: string;
    studyTimeMorning: string;
    studyTimeAfternoon: string;
    studyTimeEvening: string;
    studyVenueMainLibrary: string;
    studyVenueGarchingMi: string;
    studyVenueOlympiaPark: string;
    studyVenueOther: string;
    mealVenueMainCampusMensa: string;
    mealVenueGarchingMensa: string;
    mealVenueGarchingCafe: string;
    mealVenueLeopoldstrasseMensa: string;
    mealVenueLothstrasseMensa: string;
    mealVenueMartinsriedMensa: string;
    mealVenueWeihenstephanMensa: string;
    mealVenueOutside: string;
    mealVenueOther: string;
    languageTagChinese: string;
    languageTagEnglish: string;
    languageTagGerman: string;
    languageTagFrench: string;
    languageTagHindi: string;
    languageTagSpanish: string;
    languageTagOther: string;
    languageProficiencyNative: string;
    languageProficiencyFluent: string;
    languageProficiencyConversational: string;
    languageProficiencyBasic: string;
    languageProficiencyLearning: string;
    sportTagBasketball: string;
    sportTagBadminton: string;
    sportTagTableTennis: string;
    sportTagFootball: string;
    sportTagVolleyball: string;
    sportTagTennis: string;
    sportTagGym: string;
    sportTagRunning: string;
    sportTagHiking: string;
    sportTagCycling: string;
    sportTagSwimming: string;
    sportTagSkiing: string;
    sportTagClimbing: string;
    sportTagYoga: string;
    sportTagOther: string;
    postSheetStudyPurposeLabel: string;
    postSheetStudyTimeLabel: string;
    postSheetStudyVenueLabel: string;
    postSheetMealsVenueLabel: string;
    postSheetMealsLocationPlaceholder: string;
    postSheetMealsLocationHint: string;
    postSheetLanguageOffersLabel: string;
    postSheetLanguageTargetsLabel: string;
    postSheetLanguageOfferLevelLabel: string;
    postSheetLanguageComboboxPlaceholder: string;
    postSheetLanguageComboboxEmpty: string;
    postSheetLanguageOpenPickerAria: string;
    /** `{label}` — language display name. */
    postSheetLanguageRemoveTagAria: string;
    postSheetSportsLabel: string;
    postSheetSportsComboboxPlaceholder: string;
    postSheetSportsComboboxEmpty: string;
    postSheetSportsOpenPickerAria: string;
    postSheetSportsComboboxHint: string;
    postSheetVenueOtherPlaceholder: string;
    postErrorStudyVenueOtherNote: string;
    postErrorStudyVenueOtherRequiresOther: string;
    /** `{max}` — study “other place” note length. */
    postErrorStudyVenueNoteTooLong: string;
    /** `{max}` — meals “where to eat” text length. */
    postErrorMealsVenueNoteTooLong: string;
    postErrorLanguageNeedMeta: string;
    postErrorSportsOtherNote: string;
    postErrorSportsOtherRequiresOther: string;
    /** `{max}` — sports “other” note length. */
    postErrorSportsNoteTooLong: string;
  };
  inbox: {
    screenTitle: string;
    screenSubtitle: string;
    screenSubtitleGuest: string;
    guestHeadline: string;
    guestBody: string;
    dbUnavailableTitle: string;
    dbUnavailableBody: string;
    sessionBootstrapFailed: string;
    sessionBootstrapHint: string;
    retryBootstrap: string;
    onboardingTitle: string;
    onboardingBody: string;
    chipNew: string;
    chipPlans: string;
    chipPlansLinkTitle: string;
    chipPlansAria: string;
    chipPlansAriaWithCount: string;
    chipUpcomingPlan: string;
    chipUpcomingPlanLinkTitle: string;
    chipUpcomingPlanAria: string;
    chipUpcomingPlanAriaWithCount: string;
    chipStudyGroup: string;
    chipStudyGroupLinkTitle: string;
    chipStudyGroupAria: string;
    chipStudyGroupAriaWithUnread: string;
    chipCourseChats: string;
    chipCourseChatsLinkTitle: string;
    chipCourseChatsAria: string;
    chipCourseChatsAriaWithUnread: string;
    studyGroupsPageTitle: string;
    studyGroupsPageSubtitle: string;
    studyGroupsEmptyTitle: string;
    studyGroupsEmptyDesc: string;
    courseChatsPageTitle: string;
    courseChatsPageSubtitle: string;
    courseChatsEmptyTitle: string;
    courseChatsEmptyDesc: string;
    chipScheduleRequests: string;
    chipScheduleRequestsLinkTitle: string;
    chipScheduleRequestsAria: string;
    /** `{count}` — pending schedule-share meeting proposals. */
    chipScheduleRequestsAriaWithCount: string;
    scheduleRequestsTitle: string;
    scheduleRequestsSubtitle: string;
    scheduleRequestsEmptyTitle: string;
    scheduleRequestsEmptyDesc: string;
    headerMenuScheduleRequests: string;
    chipPosts: string;
    chipNewLinkTitle: string;
    chipNewAria: string;
    /** `{count}` — total unread for the chip aria-label. */
    chipNewAriaWithUnread: string;
    /** Unread filter active — chip aria when clearing the filter. */
    chipNewAriaFilterOn: string;
    /** `{count}` — unread filter on with badge count. */
    chipNewAriaFilterOnWithUnread: string;
    emptyUnreadFilterTitle: string;
    emptyUnreadFilterDesc: string;
    /** Collapsed search — opens the chat search field. */
    headerSearchOpenAria: string;
    /** When search field is visible — hide field (icon toggles). */
    headerSearchCloseAria: string;
    headerMoreMenuAria: string;
    headerMenuMyPlan: string;
    headerMenuMyPosts: string;
    headerMenuSavedPosts: string;
    searchPlaceholder: string;
    searchAria: string;
    emptyNoConversationsTitle: string;
    emptyNoConversationsDesc: string;
    /** Shown above recommended classmates when the inbox list is empty. */
    recommendedClassmatesEmptyHint: string;
    emptyNoMatchesTitle: string;
    /** Use `{query}` placeholder. */
    emptyNoMatchesDesc: string;
    preview: {
      scheduleShared: string;
      planInvite: string;
      planConfirmed: string;
      availabilityShared: string;
      photo: string;
      location: string;
      reply: string;
    };
  };
  me: {
    screenTitle: string;
    screenSubtitle: string;
    guestScreenTitle: string;
    guestScreenSubtitle: string;
    guestSessionTitle: string;
    guestHeroBadge: string;
    guestUnlockSection: string;
    guestLockedLabel: string;
    guestPreviewIdentitySubtitle: string;
    guestPreviewVerificationSubtitle: string;
    createAccount: string;
    logInExisting: string;
    endGuestSession: string;
    profileSectionTitle: string;
    verificationSectionTitle: string;
    tipSectionTitle: string;
    logOutRowTitle: string;
    logOutRowSubtitle: string;
    adminNavAria: string;
    adminLabel: string;
    adminReports: string;
    adminVerify: string;
    adminUsers: string;
    adminFeedback: string;
    verificationSuccessBanner: string;
    tipSuccessBanner: string;
    tipCancelBanner: string;
  };
  chat: {
    back: string;
    openYourProfileAria: string;
    /** `{name}` — peer display name or username. */
    openPeerProfileAria: string;
    today: string;
    yesterday: string;
    noMessagesYet: string;
    availabilityOrphan: string;
    attachmentScheduleCaption: string;
    attachmentScheduleAria: string;
    scheduleShareCardTitleOwn: string;
    /** `{name}` placeholder. */
    scheduleShareCardTitlePeer: string;
    scheduleShareCardSubtitleOwn: string;
    scheduleShareCardSubtitlePeer: string;
    scheduleShareCardOpen: string;
    scheduleShareCardLoadingPreview: string;
    scheduleShareCardPreviewExpired: string;
    scheduleShareCardPreviewUnavailable: string;
    scheduleShareBackToChat: string;
    locationShareDefaultLabel: string;
    locationShareOpenInMaps: string;
    /** Subtitle on plan request cards that originated from a schedule share link. */
    planFromScheduleShare: string;
    messageInputLabel: string;
    placeholderWrite: string;
    placeholderReply: string;
    sendAria: string;
    attachmentsUnavailableTitle: string;
    attachmentsUnavailableAria: string;
    cancelReplyAria: string;
    /** `{name}` placeholder. */
    replyingTo: string;
    unableToSend: string;
    /** Icon button in composer row — opens in-thread search. */
    searchThreadAria: string;
    searchThreadTitle: string;
    searchThreadPlaceholder: string;
    searchThreadNoMatches: string;
    searchThreadHint: string;
    searchThreadCloseAria: string;
  };
  /** SideSeat Assistant DM (FAQ + quick chips). */
  assistant: {
    officialBadge: string;
    headerSubtitle: string;
    composerPlaceholder: string;
    chipsAria: string;
    chips: {
      gettingStarted: string;
      discover: string;
      verification: string;
      guestSignup: string;
      schedule: string;
      inbox: string;
    };
    faqLinks: {
      home: string;
      discover: string;
      inbox: string;
      courses: string;
      profile: string;
      profileInfo: string;
      verification: string;
      signup: string;
      login: string;
      account: string;
    };
    faq: {
      gettingStartedBody: string;
      discoverBody: string;
      verificationBody: string;
      verificationDoneBody: string;
      guestSignupBody: string;
      guestSignupRegisteredBody: string;
      scheduleBody: string;
      inboxBody: string;
      fallbackBody: string;
    };
  };
  auth: {
    forgotPassword: string;
    signUpLink: string;
    signupHaveAccount: string;
    signupLogInLink: string;
  };
  authForm: {
    createAccountTitle: string;
    logInTitle: string;
    signupWithEmail: string;
    signupWithPhone: string;
    signupDisplayNameLabel: string;
    signupDisplayNamePlaceholder: string;
    signupDisplayNameTooShort: string;
    signupDisplayNameTooLong: string;
    signupDisplayNameNotEmail: string;
    signupDisplayNameHint: string;
    signupDisplayNameTaken: string;
    signupDisplayNameReserved: string;
    usernameLabel: string;
    usernamePlaceholder: string;
    usernameHint: string;
    signupUsernameTooShort: string;
    signupUsernameTooLong: string;
    signupUsernameInvalid: string;
    signupUsernameReserved: string;
    emailLabel: string;
    emailPlaceholder: string;
    phoneLabel: string;
    phonePlaceholder: string;
    enterPhoneNumber: string;
    enterEmailAddress: string;
    otpCodeLabel: string;
    otpCodePlaceholder: string;
    emailOtpCodeLabel: string;
    sendCode: string;
    sendEmailCode: string;
    sendingCode: string;
    codeSentHint: string;
    emailCodeSentHint: string;
    passwordLabel: string;
    passwordPlaceholderNew: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    identifierLabel: string;
    identifierPlaceholder: string;
    submitCreate: string;
    submitLogIn: string;
    pleaseWait: string;
    unableToContinue: string;
    emailOtpErrors: {
      dbUnavailable: string;
      dbSchema: string;
      emailInvalid: string;
      emailAlreadyRegistered: string;
      rateLimited: string;
      emailNotConfigured: string;
      emailSendFailed: string;
      invalidRequest: string;
      networkError: string;
      unknown: string;
      codeSent: string;
    };
    signupEmailErrors: {
      dbUnavailable: string;
      codeInvalid: string;
      emailAlreadyRegistered: string;
      usernameTaken: string;
      displayNameTaken: string;
      displayNameReserved: string;
      invalidRequest: string;
      unknown: string;
    };
    forgotPassword: {
      title: string;
      description: string;
      codeHint: string;
      submitReset: string;
      backToLogin: string;
      errors: {
        dbUnavailable: string;
        dbSchema: string;
        emailInvalid: string;
        rateLimited: string;
        emailNotConfigured: string;
        emailSendFailed: string;
        codeInvalid: string;
        invalidRequest: string;
        networkError: string;
        unknown: string;
        codeSent: string;
        resetSuccess: string;
      };
    };
  };
  schedule: {
    repeatDaily: string;
    repeatWeekly: string;
    repeatBiweekly: string;
    repeatMonthly: string;
    repeatYearly: string;
    repeatNone: string;
    newEvent: string;
    icsCalendarPickerDescription: string;
    exportCalendar: string;
    exportCalendarHint: string;
    importEvents: string;
    importEventsHint: string;
    icsMenuAria: string;
    manageCalendarsAria: string;
    addToScheduleOpenAria: string;
    addToScheduleCloseAria: string;
    addToScheduleCloseTitle: string;
    addPanelTitle: string;
    addPanelTitleEdit: string;
    addPanelCloseAria: string;
    addPanelSaveAria: string;
    addPanelAddAria: string;
    addPanelTitleAria: string;
    addPanelLocationPlaceholder: string;
    addPanelNotesPlaceholder: string;
    addPanelStart: string;
    addPanelEnd: string;
    addPanelRepeat: string;
    addPanelRepeatUntil: string;
    addPanelWithPlaceholder: string;
    addPanelChooseClassmatesAria: string;
    addPanelCalendar: string;
    addPanelNone: string;
    addPanelSelect: string;
    addPanelAdded: string;
    addPanelAddPerson: string;
    addPanelSaveErrorCreate: string;
    addPanelSaveErrorEdit: string;
    addPanelInvalidTimes: string;
    addPanelTitleRequired: string;
    exportError: string;
    exportSaved: string;
    importFailed: string;
    importErrorGeneric: string;
    importSuccessOne: string;
    importSuccessMany: string;
    importSuccessSkipped: string;
    viewTabDay: string;
    viewTabWeek: string;
    viewTabMonth: string;
    viewTablistAria: string;
    today: string;
    jumpToTodayAria: string;
    prevDateAria: string;
    nextDateAria: string;
    visibleDaysLabel: string;
    visibleDaysAria: string;
    /** `{count}` — visible day columns in the Home week view. */
    visibleDaysValue: string;
    expandWeekCalendarAria: string;
    closeExpandedWeekAria: string;
    weekCalendarExpandedLayerAria: string;
    /** Top-left time-axis header in week grid. */
    timeColumnLabel: string;
    /** Row label for all-day events band in week grid. */
    allDayRowLabel: string;
    /** `{when}` — localized weekday + date, e.g. “Create event on Mon, Apr 22”. */
    createEventOnDayAria: string;
    /** `{when}` — long date for month grid cell accessibility. */
    monthCellAriaNone: string;
    monthCellAriaOne: string;
    /** `{when}` `{count}` */
    monthCellAriaMany: string;
    /** Banner when opening “new event” after a calendar copy/cut. */
    calendarClipboardBannerTitle: string;
    calendarClipboardDismiss: string;
    /** Fills the title field from structured clipboard payload. */
    calendarClipboardApplyTitle: string;
    recurringDeleteDialogTitle: string;
    /** `{title}` */
    recurringDeleteDialogBody: string;
    recurringDeleteThisOccurrence: string;
    recurringDeleteAllFuture: string;
    recurringDeleteEntireSeries: string;
    recurringDeleteAriaLabel: string;
    /** Home schedule toolbar — open Schedule Share dialog */
    shareScheduleOpenAria: string;
    inviteOrEditPeople: string;
    /** `{name}` — single connection companion on the event. */
    sendPlanInviteTo: string;
    sendPlanInviteOpening: string;
    sendPlanInviteFailed: string;
    sendPlanInviteNetwork: string;
    naturalScheduleAria: string;
    naturalSheetTitle: string;
    naturalSheetCloseAria: string;
    naturalSheetHint: string;
    naturalInputPlaceholder: string;
    naturalParseCta: string;
    naturalParsing: string;
    naturalParseError: string;
    naturalParseEmpty: string;
    /** `{count}` */
    naturalPreviewCount: string;
    naturalConfirmCta: string;
    naturalSaving: string;
    naturalSaveError: string;
  };
  /** Schedule Share — Home share link + public viewer + proposals */
  scheduleShare: {
    dialogTitle: string;
    dialogSubtitle: string;
    visibleRange: string;
    presetSevenDays: string;
    presetThisWeek: string;
    presetNextWeek: string;
    presetCustom: string;
    revealSectionTitle: string;
    showAllCategories: string;
    revealPresetsHint: string;
    presetsGroupLabel: string;
    presetCourse: string;
    presetPersonal: string;
    presetWork: string;
    presetOther: string;
    myCalendarsTitle: string;
    meetingProposalsTitle: string;
    allowProposals: string;
    allowProposalsHelper: string;
    linkExpiryLabel: string;
    linkUsageLabel: string;
    linkUsageSingleUse: string;
    linkUsageUnlimited: string;
    linkUsageSingleUseHint: string;
    linkExpiresAtLabel: string;
    linkExpiryChange: string;
    linkExpiryDone: string;
    linkExpiryPolicyDefault: string;
    linkExpiryPolicyCustom: string;
    /** `{usage}` `{when}` */
    linkExpirySummary: string;
    linkExpiryHelper: string;
    privacyPreviewNone: string;
    privacyPreviewSome: string;
    ownerPageTitle: string;
    ownerOptionsTitle: string;
    ownerAdjustOptionsAria: string;
    savingSettings: string;
    createLink: string;
    creating: string;
    copyLink: string;
    /** Owner settings — copy guest read-only URL to clipboard */
    generateShareLink: string;
    shareLinkGenerated: string;
    copied: string;
    shareReady: string;
    ownerShareMaxDays: string;
    ownerShareDaysCount: string;
    ownerNoShareDaysSelected: string;
    ownerClearShareDays: string;
    ownerQuickSelectNext3Days: string;
    ownerQuickSelectNext3DaysHint: string;
    ownerQuickSelectNext7Days: string;
    ownerQuickSelectNext7DaysHint: string;
    ownerQuickSelectNextWeek: string;
    ownerQuickSelectNextWeekHint: string;
    ownerSelectShareDayAria: string;
    shareUrlHelp: string;
    invalidRange: string;
    createFailed: string;
    sendInChat: string;
    sendingToChat: string;
    sendToChatFailed: string;
    dialogSubtitleChat: string;
    networkError: string;
    copyFailed: string;
    ownerDisplayFallback: string;
    publicUnavailableTitle: string;
    publicUnavailableBody: string;
    busySectionTitle: string;
    busyAnonymous: string;
    noBusyInRange: string;
    freeSlotsTitle: string;
    publicRangeHint: string;
    shareExcludedDayBadge: string;
    /** `{name}` `{range}` — e.g. “Lin shared their schedule for next week with you”. */
    publicShareHeadline: string;
    publicShareRangeNextWeek: string;
    publicShareRangeThisWeek: string;
    slotPickHint: string;
    proposeDragHint: string;
    proposePickHint: string;
    proposeSignInFirstHeadline: string;
    proposeSignInFirstBody: string;
    /** Owner opened the recipient URL — preview headline (not “shared with you”). */
    recipientOwnerViewHeadline: string;
    recipientOwnerProposeHint: string;
    recipientOwnerEditLink: string;
    /** Signed-in visitor may propose on this link. */
    recipientVisitorProposeHint: string;
    proposalPendingTitle: string;
    proposalPendingHint: string;
    proposalAcceptedTitle: string;
    proposalAcceptedHint: string;
    editProposal: string;
    updateProposal: string;
    proposalAlreadyAccepted: string;
    prevWeekAria: string;
    nextWeekAria: string;
    selectionPreview: string;
    proposalFormTitle: string;
    guestName: string;
    guestContact: string;
    proposalTitle: string;
    proposalNote: string;
    proposalLocation: string;
    proposalStart: string;
    proposalEnd: string;
    proposalDurationLabel: string;
    proposalWithinBoundsHint: string;
    proposalDurationInvalid: string;
    submitProposal: string;
    proposalCancel: string;
    proposalSignInToSend: string;
    continueEditing: string;
    adjustTime: string;
    optionalDetails: string;
    sending: string;
    rateLimited: string;
    timeUnavailable: string;
    submitProposalFailed: string;
    pickFreeSlotFirst: string;
    invalidProposalTimes: string;
    proposalOutsideSlot: string;
    proposalSent: string;
    proposalSentHint: string;
    registerNudgeHeadline: string;
    registerNudgeBody: string;
    myPlanScheduleShareHeading: string;
    acceptProposal: string;
    declineProposal: string;
  };
  account: {
    back: string;
    title: string;
    subtitle: string;
    discoverCityTitle: string;
    discoverCityHint: string;
    changePassword: {
      title: string;
      hint: string;
      listSubtitle: string;
      currentLabel: string;
      newLabel: string;
      newPlaceholder: string;
      confirmLabel: string;
      confirmPlaceholder: string;
      save: string;
      saving: string;
      enterCurrent: string;
      passwordTooShort: string;
      passwordsMismatch: string;
      forgotLink: string;
      errors: {
        dbUnavailable: string;
        dbSchema: string;
        currentInvalid: string;
        sameAsCurrent: string;
        invalidRequest: string;
        networkError: string;
        unknown: string;
        saved: string;
      };
    };
    loginUsername: {
      title: string;
      hint: string;
      hintSystem: string;
      currentLabel: string;
      newLabel: string;
      newPlaceholder: string;
      save: string;
      saving: string;
      enterUsername: string;
      errors: {
        invalidRequest: string;
        usernameTaken: string;
        networkError: string;
        unknown: string;
        saved: string;
      };
    };
    loginEmail: {
      title: string;
      hint: string;
      currentLabel: string;
      notSet: string;
      newLabel: string;
      newPlaceholder: string;
      codeLabel: string;
      codePlaceholder: string;
      codeHint: string;
      sendCode: string;
      sendingCode: string;
      save: string;
      saving: string;
      enterEmail: string;
      errors: {
        dbUnavailable: string;
        dbSchema: string;
        emailInvalid: string;
        emailAlreadyRegistered: string;
        sameAsCurrent: string;
        rateLimited: string;
        emailNotConfigured: string;
        emailSendFailed: string;
        codeInvalid: string;
        invalidRequest: string;
        networkError: string;
        unknown: string;
        codeSent: string;
        saved: string;
      };
    };
    blockedTitle: string;
    blockedNone: string;
    blockedOne: string;
    blockedMany: string;
    aboutTitle: string;
    aboutSubtitle: string;
    deleteTitle: string;
    deleteSubtitle: string;
    logOut: string;
    replayTutorialTitle: string;
    replayTutorialSubtitle: string;
  };
  tutorial: {
    welcomeTitle: string;
    subtitle: string;
    stepLabel: string;
    homeTitle: string;
    homeBody: string;
    coursesTitle: string;
    coursesBody: string;
    discoverTabTitle: string;
    discoverTabBody: string;
    chatsTitle: string;
    chatsBody: string;
    meTitle: string;
    meBody: string;
    next: string;
    back: string;
    getStarted: string;
    replayHint: string;
    skip: string;
    coachSubtitle: string;
  };
  language: {
    sectionTitle: string;
    sectionHint: string;
    english: string;
    chinese: string;
    bilingualLabel: string;
  };
  profile: {
    preferencesTitle: string;
    preferencesSubtitleNone: string;
    preferencesSubtitleOne: string;
    preferencesSubtitleMany: string;
    savedPostsRowTitle: string;
    savedPostsRowSubtitle: string;
    myPlanRowTitle: string;
    myPlanRowSubtitle: string;
    discoverCityRowTitle: string;
    discoverCityRowSubtitle: string;
    discoverCitySelectAria: string;
    myPostsRowTitle: string;
    myPostsRowSubtitle: string;
    myPlanPageTitle: string;
    myPlanPageSubtitle: string;
    myPlanShareLinksHeading: string;
    myPlanShareLinksHint: string;
    myPlanShareLinksNoneActive: string;
    myPlanShareLinksEndedHeading: string;
    /** `{date}` */
    myPlanShareLinkExpires: string;
    myPlanShareLinkSelectAll: string;
    myPlanShareLinkDeselectAll: string;
    /** `{count}` */
    myPlanShareLinkRevokeSelected: string;
    /** `{count}` */
    myPlanShareLinkRevokeSelectedConfirm: string;
    myPlanShareLinkRevoke: string;
    myPlanShareLinkStatusActive: string;
    myPlanShareLinkStatusExpired: string;
    myPlanShareLinkStatusRevoked: string;
    myPlanShareLinkStatusUsed: string;
    myPlanEmptyTitle: string;
    myPlanEmptyDesc: string;
    myPlanPendingHeading: string;
    myPlanUpcomingHeading: string;
    myPlanPeerFallback: string;
    /** `{name}` */
    myPlanStatusInvitedYou: string;
    /** `{name}` */
    myPlanStatusWaitingOn: string;
    myPlanTypeMeal: string;
    myPlanTypeSports: string;
    myPlanTypeLanguage: string;
    myPlanTypeCustom: string;
    myPlanTypeStudy: string;
    myPostsPageTitle: string;
    myPostsPageSubtitle: string;
    myPostsEmptyTitle: string;
    myPostsEmptyDesc: string;
    myPostsOpenDiscover: string;
    myPostsSectionLive: string;
    myPostsSectionPast: string;
  };
  savedClassmatePosts: {
    screenTitle: string;
    screenSubtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyCta: string;
    saveAria: string;
    unsaveAria: string;
    nextPage: string;
    prevPage: string;
  };
  /** Me tab — feedback dialog & list row (`FeedbackFormCard`). */
  meFeedback: {
    dialogTitle: string;
    intro: string;
    placeholder: string;
    errorMinLength: string;
    errorSendFailed: string;
    errorNetwork: string;
    successLine: string;
    submitBusy: string;
    submit: string;
    listRowTitle: string;
    listRowSubtitle: string;
    cardTitle: string;
    cardSubtitle: string;
    writeButton: string;
    sendFeedbackAria: string;
  };
  /** Me tab — PWA install row (`MePageInstallCard`). Use `{appName}` where the product name is injected. */
  meInstall: {
    rowInstallApp: string;
    rowAddToHome: string;
    rowGenericInstall: string;
    subtitleDeferred: string;
    subtitleIos: string;
    subtitleNoPrompt: string;
    ctaInstallApp: string;
    ctaBusy: string;
    helpBrowserMenu: string;
    ctaAddToHome: string;
    iosHelpShareLikely: string;
    iosHelpCopyFallback: string;
    linkCopiedFollowUp: string;
    manualStepsSummary: string;
    noPromptBody: string;
    iosStepSafari: string;
    iosStepChrome: string;
    /** Floating install bar dismiss (`PwaInstallBar`). */
    dismissFloatingBarAria: string;
  };
  /** Floating service-worker / build update bar (`PwaUpdatePrompt`). */
  pwaUpdatePrompt: {
    message: string;
    updateNow: string;
  };
  /** Me profile card, rows, and edit sheets (`ProfileIdentitySheets`). */
  meIdentity: {
    displayNamePlaceholder: string;
    taglineEmpty: string;
    /** `{semester}` — number only. */
    schoolLineSemester: string;
    editProfile: string;
    editProfileAria: string;
    profilePhotoCaption: string;
    profileRowsNavAria: string;
    rowPhoto: string;
    rowName: string;
    rowBio: string;
    rowGender: string;
    rowSchool: string;
    rowLanguages: string;
    profileInfoNavAria: string;
    backAria: string;
    adjustPhotoTitle: string;
    adjustPhotoHint: string;
    editProfileSheetTitle: string;
    chooseImageFile: string;
    photoSectionLabel: string;
    usingUploadedPhoto: string;
    tapAvatarHint: string;
    displayNameLabel: string;
    /** `{username}` — ASCII login handle. */
    loginUsernameOnCard: string;
    /** Shown when editing display name — points to account settings. */
    loginUsernameNameSheetHint: string;
    nameFieldPlaceholder: string;
    bioSectionLabel: string;
    bioFieldPlaceholder: string;
    saving: string;
    save: string;
    photoSheetTitle: string;
    yourUploadedPhoto: string;
    uploadPhoto: string;
    avatarFormatsHint: string;
    /** `{id}` — preset avatar id, not translated. */
    avatarPresetAria: string;
    errorCouldNotSave: string;
    errorInvalidName: string;
    errorNicknameTaken: string;
    errorNicknameReserved: string;
    errorInvalidBio: string;
    errorChoosePhoto: string;
    errorCouldNotUpload: string;
    errorCouldNotUpdate: string;
  };
  /** Student email / manual verification on Me (`StudentVerificationForm`). */
  studentVerification: {
    statusUnverified: string;
    statusEmailPending: string;
    statusVerified: string;
    statusManualReviewRequired: string;
    statusRejected: string;
    errorRequestFailed: string;
    errorAttachCertificate: string;
    errorManualSubmitFailed: string;
    submittedForReviewFallback: string;
    emailPlaceholderGeneric: string;
    manualEmailOptionalGeneric: string;
    manualEmailOptionalWithDomain: string;
    universityEmailLabel: string;
    /** `{school}` — short school code/label from config. */
    verifiedLineWithSchool: string;
    verifiedChip: string;
    /** `{school}` — short label or empty for generic alt. */
    logoAltWithSchool: string;
    logoAltUniversity: string;
    heading: string;
    sending: string;
    verifyCta: string;
    verificationLinkHeading: string;
    openLink: string;
    copy: string;
    copied: string;
    manualReviewHeading: string;
    /** `{school}` — short label; use neutral word in locale when school missing. */
    manualReviewBody: string;
    uploading: string;
    resubmit: string;
    submitForReview: string;
    pendingFileNote: string;
    cantEmailUploadLink: string;
    schoolWord: string;
    /** `{school}` and `{email}` — trust card aria. */
    verifiedAriaWithSchool: string;
    verifiedAriaGeneric: string;
  };
  /** Shared profile editor copy (`ProfileForm`) — sheet, full, and academic variants. */
  profileForm: {
    sheetCardHeadingSr: string;
    sheetDisplayNamePlaceholder: string;
    sheetTaglinePlaceholder: string;
    schoolProgramHeading: string;
    recommendClassmatesBlurb: string;
    labelSchool: string;
    labelDegree: string;
    labelMajor: string;
    labelSemester: string;
    majorPlaceholder: string;
    majorNotSpecified: string;
    majorFreeTextOk: string;
    privacyHeading: string;
    hideFromDiscoveryTitle: string;
    hideFromDiscoverySubtitle: string;
    hideFromRecommendationsTitle: string;
    hideFromRecommendationsSubtitle: string;
    hideInCourseTitle: string;
    hideInCourseSubtitle: string;
    languagesHeading: string;
    languagesIntroBlurb: string;
    addLanguagePrompt: string;
    addLanguagePromptContinue: string;
    proficiencyAria: string;
    removeLanguageTitle: string;
    removeLanguageKeepOneTitle: string;
    removeLanguageAria: string;
    cannotRemoveLastLanguageAria: string;
    removeLanguage: string;
    addLanguage: string;
    verifiedEmailHeading: string;
    verifiedEmailBlurb: string;
    languagePickerTitle: string;
    languagePickerHint: string;
    searchLanguagesPlaceholder: string;
    noLanguageMatches: string;
    otherLanguagesLabel: string;
    otherLanguageFootnote: string;
    contactHeading: string;
    contactBlurb: string;
    homeProfileHeading: string;
    homeProfileBlurb: string;
    nicknamePlaceholder: string;
    nicknameTaken: string;
    nicknameReserved: string;
    taglinePlaceholderLong: string;
    unableToSave: string;
    saving: string;
    saved: string;
    noChangesToSave: string;
    saveChanges: string;
    saveProfileAndContinue: string;
    academicSectionTitle: string;
    academicSectionDescription: string;
  };
  /** Avatar crop step (`AvatarCropEditor`). */
  meAvatarCrop: {
    adjustTitle: string;
    adjustHint: string;
    zoomLabel: string;
    usePhoto: string;
    uploading: string;
    errorReadImage: string;
    errorPrepareImage: string;
  };
  push: {
    title: string;
    loading: string;
    unavailable: string;
    unavailableBody: string;
    setup: string;
    setupBodyBefore: string;
    setupBodyAfter: string;
    subtitle: string;
    hintPermissionDenied: string;
    hintBadKeys: string;
    hintSaveFailed: string;
    hintEnableFailed: string;
    hintDisableFailed: string;
    /** Capacitor iOS/Android — native push (not Web Push). */
    nativeSubtitle: string;
    nativeDataSync: string;
    nativeDeniedHint: string;
    nativeOpenSettings: string;
    nativeRegisterFailed: string;
  };
  tip: {
    /** Standalone card label above the headline. */
    cardLabel: string;
    headline: string;
    body: string;
    /** Collapsed in-list row title. */
    listTitle: string;
    listSubtitle: string;
    /** In-list expanded heading. */
    expandedHeading: string;
    expandedBody: string;
    chooseAmount: string;
    preset1: string;
    preset3: string;
    preset5: string;
    /** Muted placeholder on the custom EUR field ("Custom" / "自定义"). */
    customPlaceholder: string;
    /** Short range hint for `aria-label` on the custom amount field. */
    customHint: string;
    /** `{amount}` — formatted chosen amount. */
    ctaButton: string;
    ctaBusy: string;
    stripeNotice: string;
    stripeNoCard: string;
    errorRange: string;
    errorCheckout: string;
    errorNetwork: string;
    /** Screen-reader hint for the EUR amount field (min/max). */
    amountInputHint: string;
  };
  weekCalendarEditToolbar: {
    /** Cut to clipboard then remove from schedule. */
    cut: string;
    /** Copy event payload to the system clipboard. */
    copy: string;
    /** Create another copy of the event (POSTs a new event). */
    duplicate: string;
    /** Destructive delete action. */
    delete: string;
    /** Confirmation shown before delete. */
    deleteConfirm: string;
    /** Toolbar aria-label / dismiss label. */
    toolbarAriaLabel: string;
  };
  /** Other user's profile (`/users/[id]`) — not your own Me page. */
  userProfile: {
    screenTitle: string;
    aboutSection: string;
    languagesSection: string;
    emptyBio: string;
    coursesSection: string;
    coursesEmpty: string;
    sharedCoursesOne: string;
    /** `{count}` */
    sharedCoursesMany: string;
    noCourseOverlap: string;
    openChat: string;
    messageButton: string;
    messageOpening: string;
    messageUnableOpen: string;
    messageUnexpectedResponse: string;
    messageNetworkError: string;
    menuMoreActions: string;
    /** `{name}` — peer display name */
    menuDeleteContact: string;
    /** `{name}` */
    menuBlockUser: string;
    contactRemarkPlaceholder: string;
  };
  courses: CoursesMessages;
};

export type CoursesWeekdayShort = {
  MON: string;
  TUE: string;
  WED: string;
  THU: string;
  FRI: string;
  SAT: string;
  SUN: string;
};

export type CoursesMessages = {
  screenTitle: string;
  screenSubtitle: string;
  schoolHeading: string;
  /** `{school}` — full school label after the colon. */
  schoolSelectSrSuffix: string;
  tabsNavAria: string;
  tabPopular: string;
  tabMyCourses: string;
  tabBookmarks: string;
  searchPlaceholder: string;
  searchSubmit: string;
  searchClear: string;
  popularSubtitlePopularInSchool: string;
  /** `{query}` — raw search string, not translated. */
  popularSubtitleResultsFor: string;
  popularSubtitleRequiredCore: string;
  /** `{count}` — number of courses in the list meta line. */
  metaCourseCount: string;
  emptyNoCourses: string;
  /** `{query}` */
  emptyNoMatchQuery: string;
  guestManageHeadline: string;
  guestManageBodyPopular: string;
  guestManageBodyBookmarksTabs: string;
  onboardingCoursesTitle: string;
  onboardingCoursesBody: string;
  myCoursesEmptyTitle: string;
  myCoursesEmptyBody: string;
  /** Section title — classmates who share your courses (not yet chatting). */
  recommendedClassmatesTitle: string;
  browsePopularCourses: string;
  addWithForm: string;
  /** Prefix before instructor name from API (not translated). */
  instructorPrefix: string;
  /** `{count}` */
  classmatesCountMany: string;
  classmatesCountOne: string;
  enrolledNoWeeklyTimes: string;
  /** Non-compact card when there are zero sessions (full sentence). */
  enrolledNoWeeklyTimesCard: string;
  /** `{n}` — number of additional session rows. */
  enrolledMoreSlotsCount: string;
  backToCourses: string;
  addCourseTitle: string;
  chipNoOneYet: string;
  chipNoOneYetTitle: string;
  chipOneClassmate: string;
  chipOneClassmateTitle: string;
  /** `{count}` */
  chipManyClassmates: string;
  /** `{count}` */
  chipManyClassmatesTitle: string;
  chipJustYou: string;
  chipJustYouTitle: string;
  chipOtherClassmatesOne: string;
  chipOtherClassmatesOneTitle: string;
  /** `{count}` */
  chipOtherClassmatesMany: string;
  /** `{count}` */
  chipOtherClassmatesManyTitle: string;
  detailGuestPrompt: string;
  detailInviteBodyNone: string;
  detailInviteBodyOne: string;
  detailInviteBodyMany: string;
  inboxHiddenNotice: string;
  showInChats: string;
  chatHiddenBanner: string;
  groupChat: string;
  groupChatOpenTitle: string;
  /** `{count}` — enrolled total including viewer. */
  groupChatMetaMembersMany: string;
  groupChatMetaMembersOne: string;
  /** `{count}` */
  groupChatMetaUnreadMany: string;
  groupChatMetaUnreadOne: string;
  lastActiveJustNow: string;
  /** `{when}` — localized relative phrase from `common.listRelativeTime` (e.g. “3 min ago”, “昨天”). */
  lastActiveWhen: string;
  noClassmatesShareHint: string;
  /** `{membersFragment}` already localized; `{school}` from school labels. */
  courseChatSubtitle: string;
  /** `{count}` classmates in subtitle */
  chatClassmatesMany: string;
  chatClassmatesOne: string;
  chatEmptyTitle: string;
  chatEmptyBody: string;
  /** Course room composer — plain textarea, not course title from API. */
  courseChatComposerPlaceholder: string;
  /** Screen-reader label for the course chat message field. */
  courseChatComposerInputLabel: string;
  courseChatAttachmentsUnavailableAria: string;
  courseChatAttachmentsUnavailableTitle: string;
  chatBubbleYou: string;
  chatViewYourProfileAria: string;
  savedSectionTitle: string;
  /** `{count}` */
  savedCountCoursesMany: string;
  savedCountCoursesOne: string;
  savedCountFallback: string;
  classmatesEnrolledMany: string;
  classmatesEnrolledOne: string;
  savedEmptyTitle: string;
  savedEmptyBody: string;
  savedSearchCourses: string;
  /** `{label}` — course code or name from API. */
  savedRemoveAria: string;
  enrollCta: string;
  enrolledCta: string;
  enrollAria: string;
  errorCouldNotEnroll: string;
  errorNetworkEnroll: string;
  bookmarkOnScheduleAria: string;
  bookmarkOnScheduleTitle: string;
  bookmarkOnScheduleChip: string;
  bookmarkOnScheduleBlock: string;
  bookmarkSave: string;
  bookmarkSaved: string;
  bookmarkSavedTapRemove: string;
  bookmarkRemoveAria: string;
  bookmarkSaveAria: string;
  unenrollLink: string;
  /** `{courseName}` — course title from API. */
  unenrollDialogTitle: string;
  unenrollDialogBody: string;
  unenrollConfirm: string;
  unenrolling: string;
  couldNotUnenroll: string;
  memberListHeading: string;
  /** `{count}` */
  memberSearchPlaceholder: string;
  memberSearchAria: string;
  memberEmpty: string;
  /** `{query}` */
  memberNoMatch: string;
  memberMessage: string;
  memberOpenChat: string;
  memberOpening: string;
  memberWantsTo: string;
  /** `{overlap}` — short duration string (e.g. 2h), not translated. */
  memberOverlapLine: string;
  /** `{name}` — nickname, not translated. */
  memberViewProfileAria: string;
  intentStudyTogether: string;
  intentExamPrep: string;
  intentGoTogether: string;
  intentGetCoffee: string;
  setupClearAllConfirm: string;
  setupErrorFixBlocks: string;
  setupErrorMissingCode: string;
  setupClearAllBlocks: string;
  setupSaving: string;
  setupSyncCalendar: string;
  setupSyncing: string;
  setupEdit: string;
  setupAddTimes: string;
  setupErrorSaveCalendarPrefix: string;
  setupErrorSaveCalendarRetry: string;
  setupUnableSaveGeneric: string;
  /** When mirror API returns non-string error. */
  setupSyncCalendarFailedGeneric: string;
  shareSideSeatCourseTitle: string;
  /** `{url}` */
  shareInviteText: string;
  sharePromptCopy: string;
  shareInviteClassmates: string;
  shareCourseLink: string;
  shareLinkCopied: string;
  shareAriaInvite: string;
  shareAriaShare: string;
  /** `{label}` — short school code in filter control. */
  schoolFilterAria: string;
  miniHintReadOnly: string;
  miniHintEditing: string;
  miniSessionStartLabel: string;
  miniSessionEndLabel: string;
  miniLocationPlaceholder: string;
  miniSessionDelete: string;
  /** `{courseTitle}`, `{weekday}`, `{time}` */
  miniAddSlotAria: string;
  /** `{courseTitle}`, `{weekday}`, `{time}` */
  miniBlockAria: string;
  /** `{courseTitle}` */
  miniAdjustStartAria: string;
  /** `{courseTitle}` */
  miniAdjustEndAria: string;
  catalogSearchPlaceholder: string;
  catalogClearSearchAria: string;
  catalogSearching: string;
  /** `{query}` */
  catalogNoMatchTitle: string;
  catalogNoMatchHint: string;
  /** `{count}` */
  catalogResultsMany: string;
  catalogResultsOne: string;
  catalogEnrolledBadge: string;
  menuMoreAria: string;
  menuRemoveConfirm: string;
  menuRemoving: string;
  menuRemoveFromCourses: string;
  menuCouldNotRemove: string;
  formCourseLabel: string;
  formChange: string;
  formSearchPlaceholder: string;
  formSearching: string;
  /** `{query}` */
  formAddAsNew: string;
  formNewCourse: string;
  formUseThisCourse: string;
  /** `{count}` */
  formSchedulesOthersMany: string;
  formSchedulesOthersOne: string;
  formUse: string;
  formUsing: string;
  formRoomDefault: string;
  formWeeklyTimesTitle: string;
  formWeeklyTimesHint: string;
  formAddWeeklyRow: string;
  formNeedWeeklySlot: string;
  formRemoveSessionAria: string;
  formCheckSessionTimes: string;
  formOpenTo: string;
  formSubmitting: string;
  formSubmit: string;
  formUnableAdd: string;
  /** `{semester}` — digit */
  memberSemesterChip: string;
  weekdayShort: CoursesWeekdayShort;
};
