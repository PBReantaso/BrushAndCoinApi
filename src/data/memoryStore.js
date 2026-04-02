const memoryStore = {
  users: [
    {
      id: 1,
      email: 'demo@brushandcoin.com',
      password: 'password123',
    },
  ],
  artists: [
    { id: 1, name: 'Lara Cruz', location: 'Quezon City', rating: 4.9 },
    { id: 2, name: 'Miguel Ramos', location: 'Makati', rating: 4.7 },
  ],
  projects: [
    {
      id: 1,
      title: 'Portrait Commission',
      clientName: 'Ana Santos',
      status: 'inProgress',
      milestones: [
        { title: 'Sketch Approval', amount: 50, isReleased: false },
        { title: 'Final Artwork', amount: 150, isReleased: false },
      ],
    },
    {
      id: 2,
      title: 'Event Mural',
      clientName: 'Local Café',
      status: 'inquiry',
      milestones: [],
    },
  ],
  conversations: [
    { id: 1, name: 'Ana Santos', lastMessage: 'Can I commission snake pasta art?', lastMessageDate: '2026-04-02T19:47:00Z' },
    { id: 2, name: 'Local Café', lastMessage: 'I love myself. Can u draw me?', lastMessageDate: '2026-04-02T18:07:00Z' },
    { id: 3, name: 'Event Organizer', lastMessage: 'I’m sorry because I am lost', lastMessageDate: '2026-02-17T10:00:00Z' },
  ],
  conversationParticipants: [
    // Demo user (ID 1) should only be in conversations they've actually participated in
    // For now, leave empty - user will see no conversations until they start chatting
  ],
  events: [
    {
      id: 1,
      title: 'Bicol Cosplay Arena',
      category: 'Art',
      eventDate: '2026-03-29',
      eventTime: '18:00',
      venue: 'Naga City Event Grounds',
      locationText: 'Naga, Camarines Sur',
      latitude: 13.6218,
      longitude: 123.1948,
      description: 'Community cosplay and art showcase.',
      additionalInfo: '',
      imageUrl: null,
      schedules: [
        { name: 'Gates Open', time: '16:30', description: 'Entry and registration' },
      ],
      createdBy: 1,
      createdAt: new Date().toISOString(),
    },
  ],
  follows: [],
  posts: [],
  postLikes: [],
  postComments: [],
};

module.exports = { memoryStore };
