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
    { id: 1, name: 'Ana Santos' },
    { id: 2, name: 'Local Café' },
    { id: 3, name: 'Event Organizer' },
  ],
};

module.exports = { memoryStore };
