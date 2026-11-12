export type TourStep = { id: string; title: string; text: string; target?: string };
export const tourStorageKey = (tour: string) => `groupgrub:onboarding:v1:${tour}`;

export const joinTour: readonly TourStep[] = [
  {
    id: "join-invite",
    target: "invite-profile",
    title: "Your friends saved you a seat",
    text: "Group Grub helps everyone decide where to eat. Choose a nickname and avatar, then Join the table. No account is needed. Inside, explore restaurants and choose your top two when the host opens voting.",
  },
];

export const homeTour: readonly TourStep[] = [
  {
    id: "welcome",
    target: "welcome",
    title: "Dinner, decided together",
    text: "Group Grub helps your group choose where to eat. Start or join a table, explore nearby restaurants, and vote for your favorites. This quick tour shows you around without creating an account or a room.",
  },
  {
    id: "account",
    target: "account",
    title: "Make yourself at home",
    text: "Choose Sign in to create an account with Google or email. An account saves your hosting preferences, friends, and group history. Already signed in? Your Account is where you manage them. You can also host or join as a guest.",
  },
  {
    id: "host",
    target: "host",
    title: "Bring everyone to the table",
    text: "Start with a nickname and avatar, then choose an area and the group settings. Search an address or optionally use your location. Add at least two restaurants to the voting pool before creating the room and inviting friends.",
  },
  {
    id: "join",
    target: "join",
    title: "Joining friends?",
    text: "Choose Join friends, enter a nickname, and type the 6-character room code from your host. An invite link takes you straight to the join screen. No account is required.",
  },
  {
    id: "browse",
    target: "open-tables",
    title: "Find an open table",
    text: "Browse open tables to find public groups. In a room, choose two different restaurants: Want earns 2 points and Could earns 1. Submit your vote when voting opens; the host reveals the winner. Use Quick walkthrough on each page to replay its tips.",
  },
];
export const signInTour: readonly TourStep[] = [
  {
    id: "google",
    target: "google-signin",
    title: "One step with Google",
    text: "Continue with Google to sign in or create an account automatically. Save hosting defaults, connect with friends, and revisit your groups.",
  },
  {
    id: "signup",
    target: "email-signup",
    title: "Prefer an email account?",
    text: "Choose New here? Create an account, then enter a unique username, your email, and a password of at least 8 characters. Check your inbox to confirm your account, then return to sign in.",
  },
];
export const accountTour: readonly TourStep[] = [
  {
    id: "overview",
    target: "account-overview",
    title: "Your people and past picks",
    text: "Overview holds your friends, invitations, and past or current groups. Groups you join while signed in appear here so you can return to them.",
  },
  {
    id: "preferences",
    target: "preferences-tab",
    title: "Set your hosting defaults",
    text: "Preferences lets you choose your usual radius, price range, dietary filters, and distance units. These are hosting defaults for future tables; you can adjust each room separately.",
  },
  {
    id: "save-preferences",
    target: "save-preferences",
    title: "Keep your favorites for next time",
    text: "After changing your defaults, choose Save preferences. New tables will start with your saved choices. Close this tour to edit them; the tour does not change or save your preferences.",
  },
  {
    id: "settings",
    target: "account-settings",
    title: "Make it yours",
    text: "Settings lets you manage your profile, account, and linked restaurant rewards. Return Home whenever you are ready to host a table or join friends with a room code.",
  },
];
export const hostProfileTour: readonly TourStep[] = [
  {
    id: "profile",
    target: "host-profile",
    title: "Start with your seat",
    text: "Choose a nickname and avatar, then continue to choose the search area. Guests can host without making an account.",
  },
];
export const hostAreaTour: readonly TourStep[] = [
  {
    id: "area",
    target: "host-area",
    title: "Where should we look?",
    text: "Search for an address or neighborhood, or choose Use my location. Location access is optional. Adjust the search radius, then continue to the group settings.",
  },
];
export const hostGroupTour: readonly TourStep[] = [
  {
    id: "group",
    target: "host-group",
    title: "Set the table's needs",
    text: "Choose price levels, dietary restrictions, and a maximum wait. Leave prices unselected for any price. Continue to build the voting pool; nothing is shared with guests until you finish creating the room.",
  },
];
export const homeJoinTour: readonly TourStep[] = [
  {
    id: "join-details",
    target: "join-details",
    title: "A nickname and a code",
    text: "Choose your nickname and avatar, then enter the host's 6-character room code and choose Join the table. Returning to a table reuses your saved seat in this browser.",
  },
];

export function roomTour(
  isHost: boolean,
  status: "lobby" | "voting" | "closed",
  setup = false,
): readonly TourStep[] {
  if (status === "closed")
    return [
      {
        id: "winner",
        target: "winner",
        title: "The group's pick is in",
        text: "Explore the winning restaurant, directions, and any deals or rewards. Check prices, availability, and dietary needs directly with the restaurant before heading out.",
      },
    ];
  if (status === "voting")
    return [
      {
        id: "pool",
        target: "restaurant-pool",
        title: "Pick Want and Could",
        text: "On the restaurant cards, choose Want for your top pick (2 points) and Could for a different restaurant (1 point). Both choices are required.",
      },
      {
        id: "submit",
        target: "submit-vote",
        title: "Send your two picks",
        text: "Choose Submit vote after selecting two different restaurants. You can update your vote while voting is open. If the host enabled secret votes, individual choices stay hidden.",
      },
      {
        id: "members",
        target: "room-members",
        title: "See who is ready",
        text: "The member list shows who has voted. After submitting, you can play the waiting game while everyone else decides.",
      },
      ...(isHost
        ? [
            {
              id: "reveal",
              target: "reveal-winner",
              title: "Bring the group together",
              text: "When votes have arrived, choose End voting & reveal the winner. At least one vote is required. Closing voting ends the group's chance to update their picks.",
            },
          ]
        : []),
    ];
  return [
    ...(!setup
      ? [
          {
            id: "invite",
            target: "room-invite",
            title: "A table for your whole group",
            text: "Share the room code or invite link to bring friends here. Guests only need a nickname. Everyone at the table can add restaurant options before voting opens.",
          },
        ]
      : []),
    {
      id: "pool",
      target: "voting-pool",
      title: "Build the voting pool",
      text: "This is the list your group will vote on. Add restaurants from suggestions, search, or the map. At least two different places are needed before creating the room or opening voting.",
    },
    {
      id: "preferences",
      target: "dining-preferences",
      title: "Help the suggestions fit you",
      text: "Open Share my dining preferences to set cuisines, budget, distance, and dietary needs, then choose Use for this outing. Signed-in members can remember preferences. Each guest can share preferences for this outing too.",
    },
    {
      id: "conversation",
      target: "dining-conversation",
      title: "Talk through your options",
      text: "You can also record a short food discussion and review the detected preferences before using them. Recording is optional and requires microphone access. Suggested restaurants can be added to the voting pool.",
    },
    {
      id: "search",
      target: "add-restaurant",
      title: "Have another spot in mind?",
      text: "Search by restaurant, cuisine, or neighborhood, or explore nearby map listings. Choose Add to pool for any place you want the group to consider. Restaurant details may be missing; verify dietary needs directly.",
    },
    ...(isHost
      ? [
          {
            id: "ready",
            target: "pool-action",
            title: setup ? "Ready to invite everyone?" : "Ready for the group's picks?",
            text: setup
              ? "Choose Create Room once at least two restaurants are in the pool. Then share your room code and invite friends. You can keep adding options before opening voting."
              : "Choose Open voting once everyone has added their options. Each person picks two different restaurants: Want is worth 2 points and Could is worth 1.",
          },
        ]
      : []),
  ];
}
