import { collections } from '../database/collections'

// Existing players keep their current skill and are not forced through onboarding.
// Players created after this migration are intentionally left without the completion timestamp.
export async function up() {
  const result = await collections.players.updateMany(
    { skillOnboardingCompletedAt: { $exists: false } },
    { $set: { skillOnboardingCompletedAt: new Date() } },
  )
  console.info('marked existing players as skill-onboarding complete:', result.modifiedCount)
}
