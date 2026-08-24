// Access is invite-only: there is no public signup route. Accounts are created
// by an admin via POST /api/admin/users/invite, and "Allow new users to sign up"
// is disabled in Supabase Auth so auth.signUp() is rejected at the source.
export const AUTH_ROUTES = {
  public: ['/login'],
  protected: ['/'],
  login: '/login',
  dashboard: '/',
} as const

export const AUTH_ERRORS = {
  invalidCredentials: 'Invalid email or password',
  emailExists: 'An account with this email already exists',
  weakPassword: 'Password must be at least 6 characters',
  invalidEmail: 'Please enter a valid email address',
  networkError: 'Unable to connect. Please try again.',
} as const
