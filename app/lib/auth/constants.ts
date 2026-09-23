// This app has no public signup route. Admins create accounts through
// POST /api/admin/users/invite. Accounts created directly in the shared
// Supabase project remain without a role until an admin assigns one.
export const AUTH_ROUTES = {
  public: ['/login', '/forgot-password', '/reset-password'],
  protected: ['/'],
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  dashboard: '/',
} as const

export const AUTH_ERRORS = {
  invalidCredentials: 'Invalid email or password',
  emailExists: 'An account with this email already exists',
  weakPassword: 'Password must be at least 6 characters',
  invalidEmail: 'Please enter a valid email address',
  networkError: 'Unable to connect. Please try again.',
} as const
