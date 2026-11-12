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
    text: "Choose Sign in to create an account with Google or email. An account saves your hosting preferences, friends, and group history. Already signed in? Your table is where you manage them. You can also host or join as a guest.",
  },
  {
    id: "host",
    target: "host",
    title: "Bring everyone to the table",
    text: "Start a new table with a nickname and avatar. Allow location access to find restaurants nearby. As host, adjust the search area, budget, cuisine, and dietary filters before opening voting.",
  },
  {
    id: "join",
    target: "join",
    title: "Joining friends?",
    text: "Choose Join friends, enter a nickname, and type the 6-character room code from your host. An invite link takes you straight to the join screen. No account is required.",
  },
  {
    id: "join-details",
    target: "join-details",
    title: "A nickname and a code",
    text: "Pick your name and avatar here, then enter the room code and choose Join the table. Once inside, explore the restaurant pool and nominate a wildcard before you vote.",
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
    text: "Preferences lets you choose your usual radius, price range, cuisines, dietary filters, and distance units. These are hosting defaults for future tables; you can adjust each room separately.",
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
    text: "Settings lets you manage your profile and account. Return Home whenever you are ready to host a table or join friends with a room code.",
  },
];
export function roomTour(
  isHost: boolean,
  status: "lobby" | "voting" | "closed",
): readonly TourStep[] {
  if (status === "closed")
    return [
      {
        id: "winner",
        target: "winner",
        title: "The group's pick is in",
        text: "Here is the winning restaurant and the voting result. Check dietary needs, prices, and availability directly with the restaurant before heading out.",
      },
    ];
  return [
    {
      id: "invite",
      target: "room-invite",
      title: "A table for your whole group",
      text: "Share the room code or copy the invite link to bring friends here. Guests only need a nickname. The room updates automatically while everyone gets ready.",
    },
    ...(isHost && status === "lobby"
      ? [
          {
            id: "filters",
            target: "host-settings",
            title: "Find food that fits",
            text: "Adjust the search center, radius, budget, cuisines, and dietary filters here. Room settings save automatically. Restaurant details may be missing; confirm dietary needs directly with the restaurant.",
          },
        ]
      : []),
    {
      id: "wildcard",
      target: "wildcard",
      title: "Have another spot in mind?",
      text: "Search for a restaurant and nominate one wildcard for the group. Change your nomination until you submit your vote.",
    },
    {
      id: "pool",
      target: "restaurant-pool",
      title: status === "voting" ? "Pick Want and Could" : "Explore before voting",
      text:
        status === "voting"
          ? "On the restaurant cards, choose Want for your top pick (2 points) and Could for a different restaurant (1 point). Both choices are required."
          : "Browse the restaurant cards and map. Once the host opens voting, choose Want for your favorite (2 points) and Could for a different restaurant (1 point).",
    },
    ...(status === "voting"
      ? [
          {
            id: "submit",
            target: "submit-vote",
            title: "Send your two picks",
            text: "Choose Submit vote after selecting two different restaurants. Update your vote while voting is open. If the host enabled secret votes, individual choices stay hidden.",
          },
        ]
      : []),
    {
      id: "members",
      target: "room-members",
      title: isHost ? "You set the pace" : "Watch the table come together",
      text: isHost
        ? "Use the controls here to open voting when the group is ready, then reveal the result after votes arrive. The member list shows who has voted."
        : "See who is here and who has voted. The host opens voting and reveals the winner. If voting is not open yet, keep exploring the pool.",
    },
  ];
}
