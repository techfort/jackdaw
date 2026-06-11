export const getActorInfo = (currentUser: any): { userId: string; userName: string } => ({
  userId: currentUser?.id || 'anonymous',
  userName: currentUser?.name || 'Musician',
});
