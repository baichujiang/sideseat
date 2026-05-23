/** Usernames from `allocateUniqueUsername` (`u_` + random suffix). */
export function isSystemAllocatedUsername(username: string): boolean {
  return /^u_[a-z0-9]{6,31}$/i.test(username.trim());
}
